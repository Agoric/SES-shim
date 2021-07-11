import {
  Error,
  Object,
  String,
  TypeError,
  getOwnPropertyNames,
  defineProperty,
} from './commons.js';
import { assert } from './error/assert.js';

const { details: d, quote: q } = assert;

const localePattern = /^(\w*[a-z])Locale([A-Z]\w*)$/;

// Use concise methods to obtain named functions without constructor
// behavior or `.prototype` property.
const tamedMethods = {
  // See https://tc39.es/ecma262/#sec-string.prototype.localecompare
  localeCompare(that) {
    if (this === null || this === undefined) {
      throw new TypeError(
        'Cannot localeCompare with null or undefined "this" value',
      );
    }
    const s = `${this}`;
    that = `${that}`;
    if (s < that) {
      return -1;
    }
    if (s > that) {
      return 1;
    }
    assert(s === that, d`expected ${q(s)} and ${q(that)} to compare`);
    return 0;
  },
};

const nonLocaleCompare = tamedMethods.localeCompare;

export default function tameLocaleMethods(intrinsics, localeTaming = 'safe') {
  if (localeTaming !== 'safe' && localeTaming !== 'unsafe') {
    throw new Error(`unrecognized dateTaming ${localeTaming}`);
  }
  if (localeTaming === 'unsafe') {
    return;
  }

  defineProperty(String.prototype, 'localeCompare', {
    value: nonLocaleCompare,
  });

  for (const intrinsicName of getOwnPropertyNames(intrinsics)) {
    const intrinsic = intrinsics[intrinsicName];
    if (intrinsic === Object(intrinsic)) {
      for (const methodName of getOwnPropertyNames(intrinsic)) {
        const match = localePattern.exec(methodName);
        if (match) {
          assert(
            typeof intrinsic[methodName] === 'function',
            d`expected ${q(methodName)} to be a function`,
          );
          const nonLocaleMethodName = `${match[1]}${match[2]}`;
          const method = intrinsic[nonLocaleMethodName];
          assert(
            typeof method === 'function',
            d`function ${q(nonLocaleMethodName)} not found`,
          );
          defineProperty(intrinsic, methodName, { value: method });
        }
      }
    }
  }
}
