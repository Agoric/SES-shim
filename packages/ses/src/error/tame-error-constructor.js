import {
  Error,
  apply,
  construct,
  defineProperties,
  setPrototypeOf,
  getOwnPropertyDescriptor,
} from '../commons.js';
import { NativeErrors } from '../whitelist.js';
import { tameV8ErrorConstructor } from './tame-v8-error-constructor.js';

// Present on at least FF. Proposed by Error-proposal. Not on SES whitelist
// so grab it before it is removed.
const stackDesc = getOwnPropertyDescriptor(Error.prototype, 'stack');
const stackGetter = stackDesc && stackDesc.get;

// Use concise methods to obtain named functions without constructors.
const tamedMethods = {
  getStackString(error) {
    if (typeof stackGetter === 'function') {
      return apply(stackGetter, error, []);
    } else if ('stack' in error) {
      // The fallback is to just use the de facto `error.stack` if present
      return `${error.stack}`;
    }
    return '';
  },
};

export default function tameErrorConstructor(
  errorTaming = 'safe',
  stackFiltering = 'concise',
) {
  if (errorTaming !== 'safe' && errorTaming !== 'unsafe') {
    throw new Error(`unrecognized errorTaming ${errorTaming}`);
  }
  if (stackFiltering !== 'concise' && stackFiltering !== 'verbose') {
    throw new Error(`unrecognized stackFiltering ${stackFiltering}`);
  }
  const OriginalError = Error;
  const ErrorPrototype = OriginalError.prototype;

  const platform =
    typeof OriginalError.captureStackTrace === 'function' ? 'v8' : 'unknown';

  const makeErrorConstructor = (_ = {}) => {
    // eslint-disable-next-line no-shadow
    const ResultError = function Error(...rest) {
      let error;
      if (new.target === undefined) {
        error = apply(OriginalError, this, rest);
      } else {
        error = construct(OriginalError, rest, new.target);
      }
      if (platform === 'v8') {
        // TODO Likely expensive!
        OriginalError.captureStackTrace(error, ResultError);
      }
      return error;
    };
    defineProperties(ResultError, {
      length: { value: 1 },
      prototype: {
        value: ErrorPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
    return ResultError;
  };
  const InitialError = makeErrorConstructor({ powers: 'original' });
  const SharedError = makeErrorConstructor({ powers: 'none' });
  defineProperties(ErrorPrototype, {
    constructor: { value: SharedError },
    /* TODO
    stack: {
      get() {
        return '';
      },
      set(_) {
        // ignore
      },
    },
    */
  });

  for (const NativeError of NativeErrors) {
    setPrototypeOf(NativeError, SharedError);
  }

  // https://v8.dev/docs/stack-trace-api#compatibility advises that
  // programmers can "always" set `Error.stackTraceLimit`
  // even on non-v8 platforms. On non-v8
  // it will have no effect, but this advice only makes sense
  // if the assignment itself does not fail, which it would
  // if `Error` were naively frozen. Hence, we add setters that
  // accept but ignore the assignment on non-v8 platforms.
  defineProperties(InitialError, {
    stackTraceLimit: {
      get() {
        if (typeof OriginalError.stackTraceLimit === 'number') {
          // OriginalError.stackTraceLimit is only on v8
          return OriginalError.stackTraceLimit;
        }
        return undefined;
      },
      set(newLimit) {
        if (typeof newLimit !== 'number') {
          // silently do nothing. This behavior doesn't precisely
          // emulate v8 edge-case behavior. But given the purpose
          // of this emulation, having edge cases err towards
          // harmless seems the safer option.
          return;
        }
        if (typeof OriginalError.stackTraceLimit === 'number') {
          // OriginalError.stackTraceLimit is only on v8
          OriginalError.stackTraceLimit = newLimit;
          // We place the useless return on the next line to ensure
          // that anything we place after the if in the future only
          // happens if the then-case does not.
          // eslint-disable-next-line no-useless-return
          return;
        }
      },
      // WTF on v8 stackTraceLimit is enumerable
      enumerable: false,
      configurable: true,
    },
  });

  // The default SharedError much be completely powerless even on v8,
  // so the lenient `stackTraceLimit` accessor does nothing on all
  // platforms.
  defineProperties(SharedError, {
    stackTraceLimit: {
      get() {
        return undefined;
      },
      set(_newLimit) {
        // do nothing
      },
      enumerable: false,
      configurable: true,
    },
  });

  let initialGetStackString = tamedMethods.getStackString;
  if (platform === 'v8') {
    initialGetStackString = tameV8ErrorConstructor(
      OriginalError,
      InitialError,
      errorTaming,
      stackFiltering,
    );
  }
  return {
    '%InitialGetStackString%': initialGetStackString,
    '%InitialError%': InitialError,
    '%SharedError%': SharedError,
  };
}
