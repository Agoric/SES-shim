// @ts-check

import {
  Error,
  Set,
  String,
  freeze,
  is,
  setAdd,
  setHas,
  stringStartsWith,
  stringIncludes,
  stringifyJson,
  toStringTagSymbol,
} from '../commons.js';

/**
 * Prepend the correct indefinite article onto a noun, typically a typeof
 * result, e.g., "an object" vs. "a number"
 *
 * @param {string} str The noun to prepend
 * @returns {string} The noun prepended with a/an
 */
const an = str => {
  str = `${str}`;
  if (str.length >= 1 && stringIncludes('aeiouAEIOU', str[0])) {
    return `an ${str}`;
  }
  return `a ${str}`;
};
freeze(an);
export { an };

/**
 * Like `JSON.stringify` but does not blow up if given a cycle or a bigint.
 * This is not
 * intended to be a serialization to support any useful unserialization,
 * or any programmatic use of the resulting string. The string is intended
 * *only* for showing a human under benign conditions, in order to be
 * informative enough for some
 * logging purposes. As such, this `bestEffortStringify` has an
 * imprecise specification and may change over time.
 *
 * The current `bestEffortStringify` possibly emits too many "seen"
 * markings: Not only for cycles, but also for repeated subtrees by
 * object identity.
 *
 * As a best effort only for diagnostic interpretation by humans,
 * `bestEffortStringify` also turns various cases that normal
 * `JSON.stringify` skips or errors on, like `undefined` or bigints,
 * into strings that convey their meaning. To distinguish this from
 * strings in the input, these synthesized strings always begin and
 * end with square brackets. To distinguish those strings from an
 * input string with square brackets, and input string that starts
 * with an open square bracket `[` is itself placed in square brackets.
 *
 * @param {any} payload
 * @param {(string|number)=} spaces
 * @returns {string}
 */
const bestEffortStringify = (payload, spaces = undefined) => {
  const seenSet = new Set();
  const replacer = (_, val) => {
    switch (typeof val) {
      case 'object': {
        if (val === null) {
          return null;
        }
        if (setHas(seenSet, val)) {
          return '[Seen]';
        }
        setAdd(seenSet, val);
        if (val instanceof Error) {
          return `[${val.name}: ${val.message}]`;
        }
        if (toStringTagSymbol in val) {
          // For the built-ins that have or inherit a `Symbol.toStringTag`-named
          // property, most of them inherit the default `toString` method,
          // which will print in a similar manner: `"[object Foo]"` vs
          // `"[Foo]"`. The exceptions are
          //    * `Symbol.prototype`, `BigInt.prototype`, `String.prototype`
          //      which don't matter to us since we handle primitives
          //      separately and we don't care about primitive wrapper objects.
          //    * TODO
          //      `Date.prototype`, `TypedArray.prototype`.
          //      Hmmm, we probably should make special cases for these. We're
          //      not using these yet, so it's not urgent. But others will run
          //      into these.
          //
          // Once #2018 is closed, the only objects in our code that have or
          // inherit a `Symbol.toStringTag`-named property are remotables
          // or their remote presences.
          // This printing will do a good job for these without
          // violating abstraction layering. This behavior makes sense
          // purely in terms of JavaScript concepts. That's some of the
          // motivation for choosing that representation of remotables
          // and their remote presences in the first place.
          return `[${val[toStringTagSymbol]}]`;
        }
        return val;
      }
      case 'function': {
        return `[Function ${val.name || '<anon>'}]`;
      }
      case 'string': {
        if (stringStartsWith(val, '[')) {
          return `[${val}]`;
        }
        return val;
      }
      case 'undefined':
      case 'symbol': {
        return `[${String(val)}]`;
      }
      case 'bigint': {
        return `[${val}n]`;
      }
      case 'number': {
        if (is(val, NaN)) {
          return '[NaN]';
        } else if (val === Infinity) {
          return '[Infinity]';
        } else if (val === -Infinity) {
          return '[-Infinity]';
        }
        return val;
      }
      default: {
        return val;
      }
    }
  };
  try {
    return stringifyJson(payload, replacer, spaces);
  } catch (_err) {
    // Don't do anything more fancy here if there is any
    // chance that might throw, unless you surround that
    // with another try-catch-recovery. For example,
    // the caught thing might be a proxy or other exotic
    // object rather than an error. The proxy might throw
    // whenever it is possible for it to.
    return '[Something that failed to stringify]';
  }
};
freeze(bestEffortStringify);
export { bestEffortStringify };
