/* global process */
// @ts-check
/* eslint no-await-in-loop: ["off"] */

/**
 * @template T
 * @typedef {import('./defer').Deferred<T>} Deferred
 */
import * as childProcess from 'child_process';
import * as os from 'os';
import * as readline from 'readline';
import { xsnap } from './xsnap';
import { defer } from './defer';

const decoder = new TextDecoder();

async function main() {
  const xsnapOptions = {
    spawn: childProcess.spawn,
    os: os.type(),
    meteringLimit: 0,
  };

  /**
   * For the purposes of the REPL, the only command is effectively `print`.
   *
   * @param {Uint8Array} message
   * @returns {Promise<Uint8Array>}
   */
  async function handleCommand(message) {
    console.log(decoder.decode(message));
    return new Uint8Array();
  }

  const rl = readline.createInterface({
    input: /** @type {NodeJS.ReadableStream} */ (process.stdin),
    output: process.stdout,
  });

  let vat = xsnap({ ...xsnapOptions, handleCommand });

  await vat.evaluate(`
    const compartment = new Compartment();
    function handleCommand(request) {
      const command = String.fromArrayBuffer(request);
      let result = compartment.evaluate(command);
      if (result === undefined) {
        result = null;
      }
      issueCommand(ArrayBuffer.fromString(JSON.stringify(result, null, 4)));
    }
  `);

  /**
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  function ask(prompt) {
    const { promise, resolve } = /** @type {Deferred<string>} */ (defer());
    rl.question(prompt, resolve);
    return promise;
  }

  for (;;) {
    const answer = await ask('xs> ');
    if (answer === 'exit' || answer === 'quit') {
      break;
    } else if (answer === 'load') {
      const file = await ask('file> ');
      await vat.close();
      vat = xsnap({ ...xsnapOptions, handleCommand, snapshot: file });
    } else if (answer === 'save') {
      const file = await ask('file> ');
      await vat.snapshot(file);
    } else {
      await vat.issueStringCommand(answer);
    }
  }

  rl.close();
  return vat.close();
}

main();
