// Copyright (C) 2019 Agoric, under Apache License 2.0
// @ts-check

// To ensure that this module operates without special privilege, it should
// not reference the free variable `console` except for its own internal
// debugging purposes in the declaration of `internalDebugConsole`, which is
// normally commented out.

// This module however has top level mutable state which is observable to code
// given access to the `loggedErrorHandler`, such as the causal console
// of `console.js`. However, for code that does not have such access, this
// module should not be observably impure.

import {
  Error,
  RangeError,
  TypeError,
  WeakMap,
  assign,
  freeze,
  globalThis,
  is,
  weakmapGet,
  weakmapSet,
} from '../commons.js';
import { an, bestEffortStringify } from './stringify-utils.js';
import './types.js';
import './internal-types.js';

// For our internal debugging purposes, uncomment
// const internalDebugConsole = console;

// /////////////////////////////////////////////////////////////////////////////

/** @type {WeakMap<StringablePayload, any>} */
const declassifiers = new WeakMap();

/** @type {AssertQuote} */
const quote = (payload, spaces = undefined) => {
  const result = freeze({
    toString: freeze(() => bestEffortStringify(payload, spaces)),
  });
  declassifiers.set(result, payload);
  return result;
};
freeze(quote);

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} HiddenDetails
 *
 * Captures the arguments passed to the `details` template string tag.
 *
 * @property {TemplateStringsArray | string[]} template
 * @property {any[]} args
 */

/**
 * @type {WeakMap<DetailsToken, HiddenDetails>}
 *
 * Maps from a details token which a `details` template literal returned
 * to a record of the contents of that template literal expression.
 */
const hiddenDetailsMap = new WeakMap();

/**
 * @param {HiddenDetails} hiddenDetails
 * @returns {string}
 */
const getMessageString = ({ template, args }) => {
  const parts = [template[0]];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    let argStr;
    if (declassifiers.has(arg)) {
      argStr = `${arg}`;
    } else if (arg instanceof Error) {
      argStr = `(${an(arg.name)})`;
    } else {
      argStr = `(${an(typeof arg)})`;
    }
    parts.push(argStr, template[i + 1]);
  }
  return parts.join('');
};

/**
 * Give detailsTokens a toString behavior. To minimize the overhead of
 * creating new detailsTokens, we do this with an
 * inherited `this` sensitive `toString` method, even though we normally
 * avoid `this` sensitivity. To protect the method from inappropriate
 * `this` application, it does something interesting only for objects
 * registered in `redactedDetails`, which should be exactly the detailsTokens.
 *
 * The printing behavior must not reveal anything redacted, so we just use
 * the same `getMessageString` we use to construct the redacted message
 * string for a thrown assertion error.
 */
const DetailsTokenProto = freeze({
  toString() {
    const hiddenDetails = hiddenDetailsMap.get(this);
    if (hiddenDetails === undefined) {
      return '[Not a DetailsToken]';
    }
    return getMessageString(hiddenDetails);
  },
});
freeze(DetailsTokenProto.toString);

/**
 * Normally this is the function exported as `assert.details` and often
 * spelled `d`. However, if the `{errorTaming: 'unsafe'}` option is given to
 * `lockdown`, then `unredactedDetails` is used instead.
 *
 * There are some unconditional uses of `redactedDetails` in this module. All
 * of them should be uses where the template literal has no redacted
 * substitution values. In those cases, the two are equivalent.
 *
 * @type {DetailsTag}
 */
const redactedDetails = (template, ...args) => {
  // Keep in mind that the vast majority of calls to `details` creates
  // a details token that is never used, so this path must remain as fast as
  // possible. Hence we store what we've got with little processing, postponing
  // all the work to happen only if needed, for example, if an assertion fails.
  const detailsToken = freeze({ __proto__: DetailsTokenProto });
  hiddenDetailsMap.set(detailsToken, { template, args });
  return detailsToken;
};
freeze(redactedDetails);

/**
 * `unredactedDetails` is like `details` except that it does not redact
 * anything. It acts like `details` would act if all substitution values
 * were wrapped with the `quote` function above (the function normally
 * spelled `q`). If the `{errorTaming: 'unsafe'}` option is given to
 * `lockdown`, then the lockdown-shim arranges for the global `assert` to be
 * one whose `details` property is `unredactedDetails`.
 * This setting optimizes the debugging and testing experience at the price
 * of safety. `unredactedDetails` also sacrifices the speed of `details`,
 * which is usually fine in debugging and testing.
 *
 * @type {DetailsTag}
 */
const unredactedDetails = (template, ...args) => {
  args = args.map(arg => (declassifiers.has(arg) ? arg : quote(arg)));
  return redactedDetails(template, ...args);
};
freeze(unredactedDetails);
export { unredactedDetails };

/**
 * @param {HiddenDetails} hiddenDetails
 * @returns {LogArgs}
 */
const getLogArgs = ({ template, args }) => {
  const logArgs = [template[0]];
  for (let i = 0; i < args.length; i += 1) {
    let arg = args[i];
    if (declassifiers.has(arg)) {
      arg = declassifiers.get(arg);
    }
    // Remove the extra spaces (since console.error puts them
    // between each cause).
    const priorWithoutSpace = (logArgs.pop() || '').replace(/ $/, '');
    if (priorWithoutSpace !== '') {
      logArgs.push(priorWithoutSpace);
    }
    const nextWithoutSpace = template[i + 1].replace(/^ /, '');
    logArgs.push(arg, nextWithoutSpace);
  }
  if (logArgs[logArgs.length - 1] === '') {
    logArgs.pop();
  }
  return logArgs;
};

/**
 * @type {WeakMap<Error, LogArgs>}
 *
 * Maps from an error object to the log args that are a more informative
 * alternative message for that error. When logging the error, these
 * log args should be preferred to `error.message`.
 */
const hiddenMessageLogArgs = new WeakMap();

// So each error tag will be unique.
let errorTagNum = 0;

/**
 * @type {WeakMap<Error, string>}
 */
const errorTags = new WeakMap();

/**
 * @param {Error} err
 * @param {string=} optErrorName
 * @returns {string}
 */
const tagError = (err, optErrorName = err.name) => {
  let errorTag = weakmapGet(errorTags, err);
  if (errorTag !== undefined) {
    return errorTag;
  }
  errorTagNum += 1;
  errorTag = `${optErrorName}#${errorTagNum}`;
  weakmapSet(errorTags, err, errorTag);
  return errorTag;
};

/**
 * @type {AssertMakeError}
 */
const makeError = (
  optDetails = redactedDetails`Assert failed`,
  ErrorConstructor = Error,
  { errorName = undefined } = {},
) => {
  if (typeof optDetails === 'string') {
    // If it is a string, use it as the literal part of the template so
    // it doesn't get quoted.
    optDetails = redactedDetails([optDetails]);
  }
  const hiddenDetails = hiddenDetailsMap.get(optDetails);
  if (hiddenDetails === undefined) {
    throw new Error(`unrecognized details ${quote(optDetails)}`);
  }
  const messageString = getMessageString(hiddenDetails);
  const error = new ErrorConstructor(messageString);
  hiddenMessageLogArgs.set(error, getLogArgs(hiddenDetails));
  if (errorName !== undefined) {
    tagError(error, errorName);
  }
  // The next line is a particularly fruitful place to put a breakpoint.
  return error;
};
freeze(makeError);

// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {WeakMap<Error, LogArgs[]>}
 *
 * Maps from an error to an array of log args, where each log args is
 * remembered as an annotation on that error. This can be used, for example,
 * to keep track of additional causes of the error. The elements of any
 * log args may include errors which are associated with further annotations.
 * An augmented console, like the causal console of `console.js`, could
 * then retrieve the graph of such annotations.
 */
const hiddenNoteLogArgsArrays = new WeakMap();

/**
 * @type {WeakMap<Error, NoteCallback[]>}
 *
 * An augmented console will normally only take the hidden noteArgs array once,
 * when it logs the error being annotated. Once that happens, further
 * annotations of that error should go to the console immediately. We arrange
 * that by accepting a note-callback function from the console as an optional
 * part of that taking operation. Normally there will only be at most one
 * callback per error, but that depends on console behavior which we should not
 * assume. We make this an array of callbacks so multiple registrations
 * are independent.
 */
const hiddenNoteCallbackArrays = new WeakMap();

/** @type {AssertNote} */
const note = (error, detailsNote) => {
  if (typeof detailsNote === 'string') {
    // If it is a string, use it as the literal part of the template so
    // it doesn't get quoted.
    detailsNote = redactedDetails([detailsNote]);
  }
  const hiddenDetails = hiddenDetailsMap.get(detailsNote);
  if (hiddenDetails === undefined) {
    throw new Error(`unrecognized details ${quote(detailsNote)}`);
  }
  const logArgs = getLogArgs(hiddenDetails);
  const callbacks = hiddenNoteCallbackArrays.get(error);
  if (callbacks !== undefined) {
    for (const callback of callbacks) {
      callback(error, logArgs);
    }
  } else {
    const logArgsArray = hiddenNoteLogArgsArrays.get(error);
    if (logArgsArray !== undefined) {
      logArgsArray.push(logArgs);
    } else {
      hiddenNoteLogArgsArrays.set(error, [logArgs]);
    }
  }
};
freeze(note);

/**
 * The unprivileged form that just uses the de facto `error.stack` property.
 * The start compartment normally has a privileged `globalThis.getStackString`
 * which should be preferred if present.
 *
 * @param {Error} error
 * @returns {string}
 */
const defaultGetStackString = error => {
  if (!('stack' in error)) {
    return '';
  }
  const stackString = `${error.stack}`;
  const pos = stackString.indexOf('\n');
  if (stackString.startsWith(' ') || pos === -1) {
    return stackString;
  }
  return stackString.slice(pos + 1); // exclude the initial newline
};

/** @type {LoggedErrorHandler} */
const loggedErrorHandler = {
  getStackString: globalThis.getStackString || defaultGetStackString,
  tagError: error => tagError(error),
  resetErrorTagNum: () => {
    errorTagNum = 0;
  },
  getMessageLogArgs: error => hiddenMessageLogArgs.get(error),
  takeMessageLogArgs: error => {
    const result = hiddenMessageLogArgs.get(error);
    hiddenMessageLogArgs.delete(error);
    return result;
  },
  takeNoteLogArgsArray: (error, callback) => {
    const result = hiddenNoteLogArgsArrays.get(error);
    hiddenNoteLogArgsArrays.delete(error);
    if (callback !== undefined) {
      const callbacks = hiddenNoteCallbackArrays.get(error);
      if (callbacks) {
        callbacks.push(callback);
      } else {
        hiddenNoteCallbackArrays.set(error, [callback]);
      }
    }
    return result || [];
  },
};
freeze(loggedErrorHandler);
export { loggedErrorHandler };

// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {MakeAssert}
 */
const makeAssert = (optRaise = undefined, unredacted = false) => {
  const details = unredacted ? unredactedDetails : redactedDetails;
  /** @type {AssertFail} */
  const fail = (
    optDetails = details`Assert failed`,
    ErrorConstructor = Error,
  ) => {
    const reason = makeError(optDetails, ErrorConstructor);
    if (optRaise !== undefined) {
      optRaise(reason);
    }
    throw reason;
  };
  freeze(fail);

  // Don't freeze or export `baseAssert` until we add methods.
  // TODO If I change this from a `function` function to an arrow
  // function, I seem to get type errors from TypeScript. Why?
  /** @type {BaseAssert} */
  function baseAssert(
    flag,
    optDetails = details`Check failed`,
    ErrorConstructor = Error,
  ) {
    if (!flag) {
      throw fail(optDetails, ErrorConstructor);
    }
  }

  /** @type {AssertEqual} */
  const equal = (
    actual,
    expected,
    optDetails = details`Expected ${actual} is same as ${expected}`,
    ErrorConstructor = RangeError,
  ) => {
    baseAssert(is(actual, expected), optDetails, ErrorConstructor);
  };
  freeze(equal);

  /** @type {AssertTypeof} */
  const assertTypeof = (specimen, typename, optDetails) => {
    baseAssert(
      typeof typename === 'string',
      details`${quote(typename)} must be a string`,
    );
    if (optDetails === undefined) {
      // Like
      // ```js
      // optDetails = details`${specimen} must be ${quote(an(typename))}`;
      // ```
      // except it puts the typename into the literal part of the template
      // so it doesn't get quoted.
      optDetails = details(['', ` must be ${an(typename)}`], specimen);
    }
    equal(typeof specimen, typename, optDetails, TypeError);
  };
  freeze(assertTypeof);

  /** @type {AssertString} */
  const assertString = (specimen, optDetails) =>
    assertTypeof(specimen, 'string', optDetails);

  // Note that "assert === baseAssert"
  /** @type {Assert} */
  const assert = assign(baseAssert, {
    error: makeError,
    fail,
    equal,
    typeof: assertTypeof,
    string: assertString,
    note,
    details,
    quote,
    makeAssert,
  });
  return freeze(assert);
};
freeze(makeAssert);
export { makeAssert };

/** @type {Assert} */
const assert = makeAssert();
export { assert };
