/* global __filename process */
// @ts-check
/* eslint no-await-in-loop: ["off"] */

/**
 * @typedef {typeof import('child_process').spawn} Spawn
 */

/**
 * @template T
 * @typedef {import('./defer').Deferred<T>} Deferred
 */

import { defer } from './defer';
import * as netstring from './netstring';
import * as node from './node-stream';

// This will need adjustment, but seems to be fine for a start.
const DEFAULT_CRANK_METERING_LIMIT = 1e7;

const OK = '.'.charCodeAt(0);
const ERROR = '!'.charCodeAt(0);
const QUERY = '?'.charCodeAt(0);

const OK_SEPARATOR = 1;

const importMetaUrl = `file://${__filename}`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const { freeze } = Object;

/**
 * @param {Uint8Array} arg
 * @returns {Uint8Array}
 */
function echoCommand(arg) {
  return arg;
}

/**
 * @param {Object} options
 * @param {string} options.os
 * @param {Spawn} options.spawn
 * @param {(request:Uint8Array) => Promise<Uint8Array>} [options.handleCommand]
 * @param {string=} [options.name]
 * @param {boolean=} [options.debug]
 * @param {number=} [options.parserBufferSize] in kB (must be an integer)
 * @param {string=} [options.snapshot]
 * @param {'ignore' | 'inherit'} [options.stdout]
 * @param {'ignore' | 'inherit'} [options.stderr]
 * @param {number} [options.meteringLimit]
 * @param {Record<string, string>} [options.env]
 */
export function xsnap(options) {
  const {
    os,
    spawn,
    name = '<unnamed xsnap worker>',
    handleCommand = echoCommand,
    debug = false,
    parserBufferSize = undefined,
    snapshot = undefined,
    stdout = 'ignore',
    stderr = 'ignore',
    meteringLimit = DEFAULT_CRANK_METERING_LIMIT,
    env = process.env,
  } = options;

  const platform = {
    Linux: 'lin',
    Darwin: 'mac',
    Windows_NT: 'win',
  }[os];

  if (platform === undefined) {
    throw new Error(`xsnap does not support platform ${os}`);
  }

  let bin = new URL(
    `../xsnap-native/xsnap/build/bin/${platform}/${
      debug ? 'debug' : 'release'
    }/xsnap-ava`,
    importMetaUrl,
  ).pathname;

  /** @type {Deferred<void>} */
  const vatExit = defer();

  let args = [name];
  if (snapshot) {
    args.push('-r', snapshot);
  }
  if (meteringLimit) {
    args.push('-l', `${meteringLimit}`);
  }
  if (parserBufferSize) {
    args.push('-s', `${parserBufferSize}`);
  }

  if (env.XSNAP_DEBUG_RR) {
    args = [bin, ...args];
    bin = 'rr';
    console.log('XSNAP_DEBUG_RR', { bin, args });
  }
  const xsnapProcess = spawn(bin, args, {
    stdio: ['ignore', stdout, stderr, 'pipe', 'pipe'],
  });

  xsnapProcess.on('exit', (code, signal) => {
    if (code === 0) {
      vatExit.resolve();
    } else if (signal !== null) {
      vatExit.reject(new Error(`${name} exited due to signal ${signal}`));
    } else {
      vatExit.reject(new Error(`${name} exited with code ${code}`));
    }
  });

  const vatCancelled = vatExit.promise.then(() => {
    throw Error(`${name} exited`);
  });

  const messagesToXsnap = netstring.writer(
    node.writer(
      /** @type {NodeJS.WritableStream} */ (xsnapProcess.stdio[3]),
      `messages to ${name}`,
    ),
  );
  const messagesFromXsnap = netstring.reader(
    /** @type {AsyncIterable<Uint8Array>} */ (xsnapProcess.stdio[4]),
  );

  /** @type {Promise<void>} */
  let baton = Promise.resolve();

  /**
   * @template T
   * @typedef {Object} RunResult
   * @property {T} reply
   * @property {{ meterType: string, allocate: number|null, compute: number|null }} meterUsage
   */

  /**
   * @returns {Promise<RunResult<Uint8Array>>}
   */
  async function runToIdle() {
    for (;;) {
      const { done, value: message } = await messagesFromXsnap.next();
      if (done) {
        xsnapProcess.kill();
        return vatCancelled;
      }
      if (message.byteLength === 0) {
        // A protocol error kills the xsnap child process and breaks the baton
        // chain with a terminal error.
        xsnapProcess.kill();
        throw new Error('xsnap protocol error: received empty message');
      } else if (message[0] === OK) {
        let compute = null;
        const meterSeparator = message.indexOf(OK_SEPARATOR, 1);
        if (meterSeparator >= 0) {
          // The message is `.meterdata\1reply`.
          const meterData = message.slice(1, meterSeparator);
          // We parse the meter data as JSON.
          // For now it is just a number for the used compute meter.
          compute = JSON.parse(decoder.decode(meterData));
        }
        const meterUsage = {
          // The version identifier for our meter type.
          // TODO Bump this whenever there's a change to metering semantics.
          meterType: 'xs-meter-1',
          allocate: null, // No allocation meter yet.
          compute,
        };
        // console.log('have meterUsage', meterUsage);
        return {
          reply: message.subarray(meterSeparator < 0 ? 1 : meterSeparator + 1),
          meterUsage,
        };
      } else if (message[0] === ERROR) {
        throw new Error(
          `Uncaught exception in ${name}: ${decoder.decode(
            message.subarray(1),
          )}`,
        );
      } else if (message[0] === QUERY) {
        await messagesToXsnap.next(await handleCommand(message.subarray(1)));
      }
    }
  }

  /**
   * @param {string} code
   * @returns {Promise<RunResult<Uint8Array>>}
   */
  async function evaluate(code) {
    const result = baton.then(async () => {
      await messagesToXsnap.next(encoder.encode(`e${code}`));
      return runToIdle();
    });
    baton = result.then(() => {}).catch(() => {});
    return Promise.race([vatCancelled, result]);
  }

  /**
   * @param {string} fileName
   * @returns {Promise<void>}
   */
  async function execute(fileName) {
    const result = baton.then(async () => {
      await messagesToXsnap.next(encoder.encode(`s${fileName}`));
      await runToIdle();
    });
    baton = result.catch(() => {});
    return Promise.race([vatCancelled, result]);
  }

  /**
   * @param {string} fileName
   * @returns {Promise<void>}
   */
  async function importModule(fileName) {
    const result = baton.then(async () => {
      await messagesToXsnap.next(encoder.encode(`m${fileName}`));
      await runToIdle();
    });
    baton = result.catch(() => {});
    return Promise.race([vatCancelled, result]);
  }

  /**
   * @param {Uint8Array} message
   * @returns {Promise<RunResult<Uint8Array>>}
   */
  async function issueCommand(message) {
    const result = baton.then(async () => {
      const request = new Uint8Array(message.length + 1);
      request[0] = QUERY;
      request.set(message, 1);
      await messagesToXsnap.next(request);
      return runToIdle();
    });
    baton = result.then(
      () => {},
      () => {},
    );
    return Promise.race([vatCancelled, result]);
  }

  /**
   * @param {string} message
   * @returns {Promise<RunResult<string>>}
   */
  async function issueStringCommand(message) {
    const result = await issueCommand(encoder.encode(message));
    return { ...result, reply: decoder.decode(result.reply) };
  }

  /**
   * @param {string} file
   * @returns {Promise<void>}
   */
  async function writeSnapshot(file) {
    const result = baton.then(async () => {
      await messagesToXsnap.next(encoder.encode(`w${file}`));
      await runToIdle();
    });
    baton = result.catch(() => {});
    return Promise.race([vatExit.promise, baton]);
  }

  /**
   * @returns {Promise<void>}
   */
  async function close() {
    baton = baton.then(async () => {
      await messagesToXsnap.return();
      throw new Error(`${name} closed`);
    });
    baton.catch(() => {}); // Suppress Node.js unhandled exception warning.
    return vatExit.promise;
  }

  /**
   * @returns {Promise<void>}
   */
  async function terminate() {
    xsnapProcess.kill();
    baton = Promise.reject(new Error(`${name} terminated`));
    baton.catch(() => {}); // Suppress Node.js unhandled exception warning.
    // Mute the vatExit exception: it is expected.
    return vatExit.promise.catch(() => {});
  }

  return freeze({
    issueCommand,
    issueStringCommand,
    close,
    terminate,
    evaluate,
    execute,
    import: importModule,
    snapshot: writeSnapshot,
  });
}
