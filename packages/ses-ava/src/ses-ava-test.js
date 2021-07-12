// @ts-check
import 'ses';
import './types.js';

/**
 * Just forwards to global `console.error`.
 *
 * @type {Logger}
 */
const defaultLogger = (...args) => {
  console.error(...args);
};

/**
 * Determine if the argument is a Promise.
 * (Approximately copied from promiseKit.js)
 *
 * @param {unknown} maybePromise The value to examine
 * @returns {maybePromise is Promise} Whether it is a promise
 */
const isPromise = maybePromise =>
  Promise.resolve(maybePromise) === maybePromise;

/**
 * @type {LogCallError}
 */
const logErrorFirst = (func, args, name, logger = defaultLogger) => {
  let result;
  try {
    result = func(...args);
  } catch (err) {
    logger(`THROWN from ${name}:`, err);
    throw err;
  }
  if (isPromise(result)) {
    return result.then(
      v => v,
      reason => {
        logger(`REJECTED from ${name}:`, reason);
        return result;
      },
    );
  } else {
    return result;
  }
};

/**
 * @param {Assertions} originalT
 * @param {Logger} logger
 * @returns {Assertions}
 */
const wrapAssertions = (originalT, logger) => {
  /**
   * Inherits all methods from the originalT that it does not override.
   * Those that it does override it wraps behavior around a `super` call,
   * and so uses concise method syntax rather than arrow functions.
   *
   * See TODO comment on cast below to remove the `{unknown}` type declaration.
   *
   * @type {unknown}
   */
  const newT = harden({
    __proto__: originalT,
    fail(message) {
      const err = new Error(message);
      logger('FAILED by t.fail', err);
      return super.fail(message);
    },
    notThrows(originalFn, message) {
      const newFn = (...args) =>
        logErrorFirst(originalFn, args, 'notThrows', logger);
      return super.notThrows(newFn, message);
    },
    notThrowsAsync(originalFn, message) {
      const newFn = (...args) =>
        logErrorFirst(originalFn, args, 'notThrowsAsync', logger);
      return super.notThrowsAsync(newFn, message);
    },
  });
  // TODO The `{unknown}` above and the cast here seem to be needed
  // because TypeScript doesn't understand `__proto__:` in an object
  // literal implies inheritance, and thus usually subtyping.
  return /** @type {Assertions} */ (newT);
};

const testerMethodsWhitelist = [
  'after',
  'afterEach',
  'before',
  'beforeEach',
  'cb',
  'failing',
  'serial',
  'only',
  'skip',
];

/**
 * @param {TesterFunc} testerFunc
 * @param {Logger} logger
 * @returns {TesterFunc} Not yet frozen!
 */
const wrapTester = (testerFunc, logger) => {
  /** @type {TesterFunc} */
  const testerWrapper = (title, implFunc, ...otherArgs) => {
    /** @type {ImplFunc} */
    const testFuncWrapper = originalT => {
      const newT = wrapAssertions(originalT, logger);
      return logErrorFirst(implFunc, [newT, ...otherArgs], 'ava test', logger);
    };
    if (implFunc && implFunc.title) {
      testFuncWrapper.title = implFunc.title;
    }
    return testerFunc(title, testFuncWrapper, ...otherArgs);
  };
  return testerWrapper;
};

/**
 * The ava `test` function takes a callback argument of the form
 * `t => {...}`. If the outcome of this function indicates an error, either
 * by throwing or by eventually rejecting a returned promise, ava does its
 * own peculiar console-like display of this error and its stacktrace.
 * However, it does not use the ses `console` and so bypasses all the fancy
 * diagnostics provided by the ses `console`.
 *
 * To use this package, a test file replaces the line
 * ```js
 * import test from 'ava';
 * ```
 * with
 * ```js
 * import { wrapTest } from '@endo/ses-ava';
 * import rawTest from 'ava';
 *
 * const test = wrapTest(rawTest);
 * ```
 * Then the calls to `test` in the rest of the test file will act like they
 * used to, except that, if a test fails because the test function (the
 * callback argument to `test`) throws or returns a promise
 * that eventually rejects, the error is first sent to the `console` before
 * propagating into `rawTest`.
 *
 * @param {TesterInterface} avaTest
 * @param {Logger=} logger
 * @returns {TesterInterface}
 */
const wrapTest = (avaTest, logger = defaultLogger) => {
  /** @type {TesterInterface} */
  const testerWrapper = wrapTester(avaTest, logger);
  for (const methodName of testerMethodsWhitelist) {
    if (methodName in avaTest) {
      /** @type {TesterFunc} */
      const testerMethod = (title, implFunc, ...otherArgs) =>
        avaTest[methodName](title, implFunc, ...otherArgs);
      testerWrapper[methodName] = wrapTester(testerMethod, logger);
    }
  }
  harden(testerWrapper);
  return testerWrapper;
};
// harden(wrapTest);
export { wrapTest };
