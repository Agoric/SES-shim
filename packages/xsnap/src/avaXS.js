/* avaXS - ava style test runner for XS

Usage:

  node -r esm avaXS.js [--debug] test-*.js

*/
/* global __filename */

// @ts-check

/* eslint-disable no-await-in-loop */
import '@agoric/install-ses';
import { assert, details as X, q } from '@agoric/assert';
import { xsnap } from './xsnap';

// scripts for use in xsnap subprocesses
const SESboot = `../dist/bundle-ses-boot-debug.umd.js`;
const testEnv = `../dist/bundle-ses-test-env-debug.umd.js`;
const avaAssert = `./avaAssertXS.js`;
const avaHandler = `./avaHandler.js`;

const importMetaUrl = `file://${__filename}`;
/** @type { (ref: string, readFile: typeof import('fs').promises.readFile ) => Promise<string> } */
const asset = (ref, readFile) =>
  readFile(new URL(ref, importMetaUrl).pathname, 'utf8');

/**
 * When we bundle test scripts, we leave these externals
 * as `require(...)` style graph exits and (in avaHandler.js)
 * supply them via a `require` endowment
 * on the Compartment used to run the script.
 */
const externals = [
  'ses/lockdown',
  'ava',
  '@agoric/ses-ava',
  '@agoric/bundle-source',
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const { keys } = Object;

/**
 * Quick-n-dirty work-alike for matcher
 * https://github.com/sindresorhus/matcher
 *
 * @param {string} specimen
 * @param {string} pattern
 */
function isMatch(specimen, pattern) {
  return specimen.match(`^${pattern.replace(/\*/g, '.*')}$`);
}

/**
 * Run one test script in an xsnap subprocess.
 *
 * The subprocess reports back once for each test assertion.
 *
 * @typedef {{ id?: number, status: Status, message?: string }
 *         | { plan: number}
 *         | { note: string, label?: string }
 * } TapMessage
 *
 * It also calls back if a test calls `bundleSource`.
 *
 * @typedef {{ moduleFormat: string, source: string }} Bundle
 *
 * And finally it reports back a summary of assertion results.
 *
 * @typedef {{
 *   pass: number,
 *   fail: number,
 *   total: number,
 * }} Summary
 *
 * @param { string } filename
 * @param { string[] } preamble scripts to run in XS start compartment
 * @param {{ verbose?: boolean, titleMatch?: string }} options
 * @param {{
 *   spawnXSnap: (opts: object) => XSnap,
 *   bundleSource: (...args: [string, ...unknown[]]) => Promise<Bundle>,
 *   resolve: ResolveFn,
 *   dirname: typeof import('path').dirname,
 *   basename: typeof import('path').basename,
 * }} io
 * @returns {Promise<TestResults>}
 *
 * @typedef {{ total: number, pass: number, fail: { filename: string, name: string }[] }} TestResults
 * @typedef { 'ok' | 'not ok' | 'SKIP' } Status
 * @typedef {ReturnType<typeof import('./xsnap').xsnap>} XSnap
 */
async function runTestScript(
  filename,
  preamble,
  { verbose, titleMatch },
  { spawnXSnap, bundleSource, resolve, dirname, basename },
) {
  const testBundle = await bundleSource(filename, 'getExport', { externals });
  // require('fs').writeFileSync(`${filename}-bundle.js`, testBundle.source);
  if (
    testBundle.source.match(
      /This module exports both Compartment and StaticModuleRecord/,
    )
  ) {
    console.log('!!SKIP module-shim, babel', filename);
    console.log(`      "${filename}",`);
    return { total: 0, pass: 0, fail: [] };
  }

  let assertionStatus = { ok: 0, 'not ok': 0, SKIP: 0 };
  /** @type { number | null } */
  let plan = null;
  /** @type {TestResults} */
  const testStatus = { total: 0, pass: 0, fail: [] };
  let label = '';
  /** @type { string[] } */
  let testNames = [];

  /**
   * Handle callback "command" from xsnap subprocess.
   *
   * @type { (msg: ArrayBuffer) => Promise<ArrayBuffer> }
   */
  async function handleCommand(message) {
    /**
     * See also send() in avaHandler.js
     *
     * @type { TapMessage | { testNames: string[] } | { bundleSource: [string, ...unknown[]] } | Summary }
     */
    const msg = JSON.parse(decoder.decode(message));
    // console.log(input, msg, qty, byStatus);

    if ('testNames' in msg) {
      testNames = msg.testNames;
    }

    if ('bundleSource' in msg) {
      const [startFilename, ...rest] = msg.bundleSource;
      // see also makeBundleResolve() below
      const bundle = await bundleSource(resolve(startFilename), ...rest);
      return encoder.encode(JSON.stringify(bundle));
    }

    if ('label' in msg) {
      label = msg.label || label;
      if (verbose) {
        console.log(`${filename}: ${msg.label} ${msg.note}`);
      }
    }
    if ('status' in msg) {
      assertionStatus[msg.status] += 1;
      if (msg.status === 'not ok') {
        console.warn({ ...msg, filename, label });
      }
    }
    if ('plan' in msg) {
      plan = msg.plan;
    }
    return encoder.encode('null');
  }

  // ISSUE: only works in one file / dir
  const literal = JSON.stringify;
  const testPath = resolve(filename);
  const pathGlobalsKludge = `
    globalThis.__filename = ${literal(testPath)};
    globalThis.__dirname = ${literal(dirname(testPath))};
   `;

  const worker = spawnXSnap({ handleCommand, name: basename(filename) });
  try {
    for (const script of preamble) {
      await worker.evaluate(script);
    }

    await worker.evaluate(pathGlobalsKludge);

    // Send the test script to avaHandler.
    await worker.issueStringCommand(
      JSON.stringify({ method: 'loadScript', source: testBundle.source }),
    );

    for (const name of testNames) {
      if (titleMatch && !isMatch(name, titleMatch)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      assertionStatus = { ok: 0, 'not ok': 0, SKIP: 0 };
      label = name;
      plan = null;
      await worker.issueStringCommand(
        JSON.stringify({ method: 'runTest', name }),
      );
      testStatus.total += 1;

      const pending = typeof plan === 'number' ? plan - assertionStatus.ok : 0;

      const pass =
        pending === 0 &&
        assertionStatus.ok > 0 &&
        assertionStatus['not ok'] === 0;
      if (pass) {
        testStatus.pass += 1;
      } else {
        testStatus.fail.push({ filename, name });
      }
      if (verbose) {
        console.log(pass ? '.' : 'F', filename, name);
      }
      if (pending !== 0) {
        console.warn(`bad plan: ${pending} still to go`);
      }
    }
  } finally {
    await worker.terminate();
  }

  return testStatus;
}

/**
 * Get ava / ava-xs config from package.json
 *
 * @param { string[] } args
 * @param {Object} options
 * @param {string} [options.packageFilename]
 * @param {{
 *   readFile: typeof import('fs').promises.readFile,
 *   glob: typeof import('glob')
 * }} io
 * @returns {Promise<AvaXSConfig>}
 *
 * @typedef {Object} AvaXSConfig
 * @property {string[]} files - files from args or else ava.files
 * @property {string[]} require - specifiers of modules to run before each test script
 * @property {string[]=} exclude - files containing any of these should be skipped
 * @property {boolean} debug
 * @property {boolean} verbose
 * @property {string=} titleMatch
 * @property {boolean} failFast
 */
async function avaConfig(args, options, { glob, readFile }) {
  /** @type {string[]} */
  let files = [];
  let debug = false;
  let verbose = false;
  let failFast = false;
  let titleMatch;
  while (args.length > 0) {
    const arg = args.shift();
    assert.typeof(arg, 'string');
    switch (arg) {
      case '--debug':
        debug = true;
        break;
      case '-v':
      case '--verbose':
        verbose = true;
        break;
      case '-m':
      case '--match':
        titleMatch = args.shift();
        break;
      case '--fail-fast':
        failFast = true;
        break;
      default:
        files.push(arg);
    }
  }
  const { packageFilename = 'package.json' } = options;

  const txt = await readFile(packageFilename, 'utf-8');
  const pkgMeta = JSON.parse(txt);

  if (!pkgMeta.ava) {
    return { files: [], require: [], debug, verbose, failFast };
  }
  const expected = ['files', 'require'];
  const unsupported = keys(pkgMeta.ava).filter(k => !expected.includes(k));
  if (unsupported.length > 0) {
    console.warn(X`ava-xs does not support ava options: ${q(unsupported)}`);
  }
  const { files: filePatterns, require } = pkgMeta.ava;
  let { exclude } = pkgMeta['ava-xs'] || {};
  if (typeof exclude === 'string') {
    exclude = [exclude];
  }
  assert(
    !exclude || Array.isArray(exclude),
    X`ava-xs.exclude: expected array or string: ${q(exclude)}`,
  );

  if (!files.length) {
    /**
     * @param { string } pattern
     * @returns { Promise<string[]> }
     */
    const globFiles = pattern =>
      new Promise((res, rej) =>
        glob(pattern, {}, (err, matches) => (err ? rej(err) : res(matches))),
      );
    assert(
      Array.isArray(filePatterns),
      X`ava.files: expected Array: ${q(filePatterns)}`,
    );
    files = (await Promise.all(filePatterns.map(globFiles))).flat();
  }

  assert(
    Array.isArray(require),
    X`ava.requires: expected Array: ${q(require)}`,
  );
  const config = {
    files,
    require,
    exclude,
    debug,
    verbose,
    titleMatch,
    failFast,
  };
  return config;
}

/**
 * @param {string[]} args - CLI args (excluding node interpreter, script name)
 * @param {{
 *   bundleSource: typeof import('@agoric/bundle-source').default,
 *   spawn: typeof import('child_process')['spawn'],
 *   osType: typeof import('os')['type'],
 *   readFile: typeof import('fs')['promises']['readFile'],
 *   resolve: typeof import('path').resolve,
 *   dirname: typeof import('path').dirname,
 *   basename: typeof import('path').basename,
 *   glob: typeof import('glob'),
 * }} io
 */
export async function main(
  args,
  { bundleSource, spawn, osType, readFile, resolve, dirname, basename, glob },
) {
  const {
    files,
    require,
    exclude,
    debug,
    verbose,
    titleMatch,
    failFast,
  } = await avaConfig(args, {}, { readFile, glob });

  /** @param {Record<string, unknown>} opts */
  const spawnXSnap = opts =>
    xsnap({
      ...opts,
      debug,
      spawn,
      os: osType(),
      meteringLimit: 0,
      stdout: 'inherit',
      stderr: 'inherit',
    });

  /**
   * SES objects to `import(...)`
   * avaAssert and avaHandler only use import() in type comments
   *
   * @param { string } src
   */
  const hideImport = src => src.replace(/import\(/g, '');

  const requiredBundles = await Promise.all(
    require
      .filter(specifier => !['esm', ...externals].includes(specifier))
      .map(specifier => bundleSource(specifier, 'getExport', { externals })),
  );
  const requiredScripts = requiredBundles.map(
    ({ source }) => `(${source}\n)()`,
  );

  const preamble = [
    // await asset(SESboot, readFile),
    await asset(testEnv, readFile),
    ...requiredScripts,
    hideImport(await asset(avaAssert, readFile)),
    hideImport(await asset(avaHandler, readFile)),
  ];

  /** @type { TestResults } */
  const stats = { total: 0, pass: 0, fail: [] };

  for (const filename of files) {
    if (exclude && exclude.filter(s => filename.match(s)).length > 0) {
      console.warn('# SKIP test excluded on XS', filename);
      // eslint-disable-next-line no-continue
      continue;
    } else if (verbose) {
      console.log('# test script:', filename);
    }

    const results = await runTestScript(
      filename,
      preamble,
      { verbose, titleMatch },
      {
        spawnXSnap,
        bundleSource,
        resolve,
        dirname,
        basename,
      },
    );

    stats.total += results.total;
    stats.pass += results.pass;
    results.fail.forEach(info => stats.fail.push(info));
    if (failFast && results.fail.length > 0) {
      break;
    }
  }

  console.log(stats.pass, 'tests passed');
  if (stats.fail.length > 0) {
    console.warn(stats.fail.length, 'tests failed');
    for (const { filename, name } of stats.fail) {
      console.log('F', filename, name);
    }
  }
  return stats.fail.length > 0 ? 1 : 0;
}

/**
 * Fix path resolution for test contract bundles.
 *
 * @param {typeof import('path')} path
 * @returns {ResolveFn}
 * @typedef {typeof import('path').resolve } ResolveFn
 */
export function makeBundleResolve(path) {
  const bundleRoots = [
    { basename: 'zcfTesterContract', pkg: 'zoe', dir: 'test/unitTests/zcf' },
  ];
  return function resolveWithFixes(seg0, ...pathSegments) {
    for (const { basename, pkg, dir } of bundleRoots) {
      if (seg0.indexOf(basename) >= 0) {
        const [sdk] = seg0.split(`packages${path.sep}${pkg}${path.sep}`, 1);
        seg0 = path.join(sdk, 'packages', pkg, ...dir.split('/'), basename);
      }
    }
    return path.resolve(seg0, ...pathSegments);
  };
}
