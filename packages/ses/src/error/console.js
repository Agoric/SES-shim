// @ts-check

// To ensure that this module operates without special privilege, it should
// not reference the free variable `console` except for its own internal
// debugging purposes in the declaration of `internalDebugConsole`, which is
// normally commented out.

import {
  Error,
  WeakSet,
  defineProperty,
  freeze,
  fromEntries,
  weaksetAdd,
  weaksetHas,
} from '../commons.js';
import './types.js';
import './internal-types.js';

// For our internal debugging purposes, uncomment
// const internalDebugConsole = console;

// The whitelists of console methods, from:
// Whatwg "living standard" https://console.spec.whatwg.org/
// Node https://nodejs.org/dist/latest-v14.x/docs/api/console.html
// MDN https://developer.mozilla.org/en-US/docs/Web/API/Console_API
// TypeScript https://openstapps.gitlab.io/projectmanagement/interfaces/_node_modules__types_node_globals_d_.console.html
// Chrome https://developers.google.com/web/tools/chrome-devtools/console/api

// All console level methods have parameters (fmt?, ...args)
// where the argument sequence `fmt?, ...args` formats args according to
// fmt if fmt is a format string. Otherwise, it just renders them all as values
// separated by spaces.
// https://console.spec.whatwg.org/#formatter
// https://nodejs.org/docs/latest/api/util.html#util_util_format_format_args

// For the causal console, all occurrences of `fmt, ...args` or `...args` by
// itself must check for the presence of an error to ask the
// `loggedErrorHandler` to handle.
// In theory we should do a deep inspection to detect for example an array
// containing an error. We currently do not detect these and may never.

/** @typedef {keyof VirtualConsole | 'profile' | 'profileEnd'} ConsoleProps */

/** @type {readonly [ConsoleProps, LogSeverity | undefined][]} */
const consoleLevelMethods = freeze([
  ['debug', 'debug'], // (fmt?, ...args) verbose level on Chrome
  ['log', 'log'], // (fmt?, ...args) info level on Chrome
  ['info', 'info'], // (fmt?, ...args)
  ['warn', 'warn'], // (fmt?, ...args)
  ['error', 'error'], // (fmt?, ...args)

  ['trace', 'log'], // (fmt?, ...args)
  ['dirxml', 'log'], // (fmt?, ...args)
  ['group', 'log'], // (fmt?, ...args)
  ['groupCollapsed', 'log'], // (fmt?, ...args)
]);

/** @type {readonly [ConsoleProps, LogSeverity | undefined][]} */
const consoleOtherMethods = freeze([
  ['assert', 'error'], // (value, fmt?, ...args)
  ['timeLog', 'log'], // (label?, ...args) no fmt string

  // Insensitive to whether any argument is an error. All arguments can pass
  // thru to baseConsole as is.
  ['clear', undefined], // ()
  ['count', 'info'], // (label?)
  ['countReset', undefined], // (label?)
  ['dir', 'log'], // (item, options?)
  ['groupEnd', 'log'], // ()
  // In theory tabular data may be or contain an error. However, we currently
  // do not detect these and may never.
  ['table', 'log'], // (tabularData, properties?)
  ['time', 'info'], // (label?)
  ['timeEnd', 'info'], // (label?)

  // Node Inspector only, MDN, and TypeScript, but not whatwg
  ['profile', undefined], // (label?)
  ['profileEnd', undefined], // (label?)
  ['timeStamp', undefined], // (label?)
]);

/** @type {readonly [ConsoleProps, LogSeverity | undefined][]} */
export const consoleWhitelist = freeze([
  ...consoleLevelMethods,
  ...consoleOtherMethods,
]);

/**
 * consoleOmittedProperties is currently unused. I record and maintain it here
 * with the intention that it be treated like the `false` entries in the main
 * SES whitelist: that seeing these on the original console is expected, but
 * seeing anything else that's outside the whitelist is surprising and should
 * provide a diagnostic.
 *
 * const consoleOmittedProperties = freeze([
 *   'memory', // Chrome
 *   'exception', // FF, MDN
 *   '_ignoreErrors', // Node
 *   '_stderr', // Node
 *   '_stderrErrorHandler', // Node
 *   '_stdout', // Node
 *   '_stdoutErrorHandler', // Node
 *   '_times', // Node
 *   'context', // Chrome, Node
 *   'record', // Safari
 *   'recordEnd', // Safari
 *
 *   'screenshot', // Safari
 *   // Symbols
 *   '@@toStringTag', // Chrome: "Object", Safari: "Console"
 *   // A variety of other symbols also seen on Node
 * ]);
 */

// /////////////////////////////////////////////////////////////////////////////

/** @type {MakeLoggingConsoleKit} */
const makeLoggingConsoleKit = (
  loggedErrorHandler,
  { shouldResetForDebugging = false } = {},
) => {
  if (shouldResetForDebugging) {
    loggedErrorHandler.resetErrorTagNum();
  }

  // Not frozen!
  let logArray = [];

  const loggingConsole = fromEntries(
    consoleWhitelist.map(([name, _]) => {
      // Use an arrow function so that it doesn't come with its own name in
      // its printed form. Instead, we're hoping that tooling uses only
      // the `.name` property set below.
      /**
       * @param {...any} args
       */
      const method = (...args) => {
        logArray.push([name, ...args]);
      };
      defineProperty(method, 'name', { value: name });
      return [name, freeze(method)];
    }),
  );
  freeze(loggingConsole);

  const takeLog = () => {
    const result = freeze(logArray);
    logArray = [];
    return result;
  };
  freeze(takeLog);

  const typedLoggingConsole = /** @type {VirtualConsole} */ (loggingConsole);

  return freeze({ loggingConsole: typedLoggingConsole, takeLog });
};
freeze(makeLoggingConsoleKit);
export { makeLoggingConsoleKit };

// /////////////////////////////////////////////////////////////////////////////

/** @type {ErrorInfo} */
const ErrorInfo = {
  NOTE: 'ERROR_NOTE:',
  MESSAGE: 'ERROR_MESSAGE:',
};
freeze(ErrorInfo);

/**
 * The error annotations are sent to the baseConsole by calling some level
 * method. The 'debug' level seems best, because the Chrome console classifies
 * `debug` as verbose and does not show it by default. But we keep it symbolic
 * so we can change our mind. (On Node, `debug`, `log`, and `info` are aliases
 * for the same function and so will behave the same there.)
 */
export const BASE_CONSOLE_LEVEL = 'debug';

/** @type {MakeCausalConsole} */
const makeCausalConsole = (baseConsole, loggedErrorHandler) => {
  const {
    getStackString,
    tagError,
    takeMessageLogArgs,
    takeNoteLogArgsArray,
  } = loggedErrorHandler;

  /**
   * @param {ReadonlyArray<any>} logArgs
   * @param {Array<any>} subErrorsSink
   * @returns {any}
   */
  const extractErrorArgs = (logArgs, subErrorsSink) => {
    const argTags = logArgs.map(arg => {
      if (arg instanceof Error) {
        subErrorsSink.push(arg);
        return `(${tagError(arg)})`;
      }
      return arg;
    });
    return argTags;
  };

  /**
   * @param {Error} error
   * @param {ErrorInfoKind} kind
   * @param {readonly any[]} logArgs
   * @param {Array<Error>} subErrorsSink
   */
  const logErrorInfo = (error, kind, logArgs, subErrorsSink) => {
    const errorTag = tagError(error);
    const errorName =
      kind === ErrorInfo.MESSAGE ? `${errorTag}:` : `${errorTag} ${kind}`;
    const argTags = extractErrorArgs(logArgs, subErrorsSink);
    baseConsole[BASE_CONSOLE_LEVEL](errorName, ...argTags);
  };

  /**
   * Logs the `subErrors` within a group name mentioning `optTag`.
   *
   * @param {Error[]} subErrors
   * @param {string | undefined} optTag
   * @returns {void}
   */
  const logSubErrors = (subErrors, optTag = undefined) => {
    if (subErrors.length === 0) {
      return;
    }
    if (subErrors.length === 1 && optTag === undefined) {
      // eslint-disable-next-line no-use-before-define
      logError(subErrors[0]);
      return;
    }
    let label;
    if (subErrors.length === 1) {
      label = `Nested error`;
    } else {
      label = `Nested ${subErrors.length} errors`;
    }
    if (optTag !== undefined) {
      label = `${label} under ${optTag}`;
    }
    baseConsole.group(label);
    try {
      for (const subError of subErrors) {
        // eslint-disable-next-line no-use-before-define
        logError(subError);
      }
    } finally {
      baseConsole.groupEnd();
    }
  };

  const errorsLogged = new WeakSet();

  /** @type {NoteCallback} */
  const noteCallback = (error, noteLogArgs) => {
    const subErrors = [];
    // Annotation arrived after the error has already been logged,
    // so just log the annotation immediately, rather than remembering it.
    logErrorInfo(error, ErrorInfo.NOTE, noteLogArgs, subErrors);
    logSubErrors(subErrors, tagError(error));
  };

  /**
   * @param {Error} error
   */
  const logError = error => {
    if (weaksetHas(errorsLogged, error)) {
      return;
    }
    const errorTag = tagError(error);
    weaksetAdd(errorsLogged, error);
    const subErrors = [];
    const messageLogArgs = takeMessageLogArgs(error);
    const noteLogArgsArray = takeNoteLogArgsArray(error, noteCallback);
    // Show the error's most informative error message
    if (messageLogArgs === undefined) {
      // If there is no message log args, then just show the message that
      // the error itself carries.
      baseConsole[BASE_CONSOLE_LEVEL](`${errorTag}:`, error.message);
    } else {
      // If there is one, we take it to be strictly more informative than the
      // message string carried by the error, so show it *instead*.
      logErrorInfo(error, ErrorInfo.MESSAGE, messageLogArgs, subErrors);
    }
    // After the message but before any other annotations, show the stack.
    let stackString = getStackString(error);
    if (
      typeof stackString === 'string' &&
      stackString.length >= 1 &&
      !stackString.endsWith('\n')
    ) {
      stackString += '\n';
    }
    baseConsole[BASE_CONSOLE_LEVEL](stackString);
    // Show the other annotations on error
    for (const noteLogArgs of noteLogArgsArray) {
      logErrorInfo(error, ErrorInfo.NOTE, noteLogArgs, subErrors);
    }
    // explain all the errors seen in the messages already emitted.
    logSubErrors(subErrors, errorTag);
  };

  const levelMethods = consoleLevelMethods.map(([level, _]) => {
    /**
     * @param {...any} logArgs
     */
    const levelMethod = (...logArgs) => {
      const subErrors = [];
      const argTags = extractErrorArgs(logArgs, subErrors);
      // @ts-ignore
      baseConsole[level](...argTags);
      logSubErrors(subErrors);
    };
    defineProperty(levelMethod, 'name', { value: level });
    return [level, freeze(levelMethod)];
  });
  const otherMethodNames = consoleOtherMethods.filter(
    ([name, _]) => name in baseConsole,
  );
  const otherMethods = otherMethodNames.map(([name, _]) => {
    /**
     * @param {...any} args
     */
    const otherMethod = (...args) => {
      // @ts-ignore
      baseConsole[name](...args);
      return undefined;
    };
    defineProperty(otherMethod, 'name', { value: name });
    return [name, freeze(otherMethod)];
  });

  const causalConsole = fromEntries([...levelMethods, ...otherMethods]);
  return freeze(causalConsole);
};
freeze(makeCausalConsole);
export { makeCausalConsole };

// /////////////////////////////////////////////////////////////////////////////

/** @type {FilterConsole} */
const filterConsole = (baseConsole, filter, _topic = undefined) => {
  // TODO do something with optional topic string
  const whilelist = consoleWhitelist.filter(([name, _]) => name in baseConsole);
  const methods = whilelist.map(([name, severity]) => {
    /**
     * @param {...any} args
     */
    const method = (...args) => {
      if (severity === undefined || filter.canLog(severity)) {
        // @ts-ignore
        baseConsole[name](...args);
      }
    };
    return [name, freeze(method)];
  });
  const filteringConsole = fromEntries(methods);
  return freeze(filteringConsole);
};
freeze(filterConsole);
export { filterConsole };
