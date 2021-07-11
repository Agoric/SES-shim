import {
  arrayIncludes,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
  objectHasOwnProperty,
  regexpTest,
} from './commons.js';

/**
 * keywords
 * In JavaScript you cannot use these reserved words as variables.
 * See 11.6.1 Identifier Names
 */
const keywords = [
  // 11.6.2.1 Keywords
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',

  // Also reserved when parsing strict mode code
  'let',
  'static',

  // 11.6.2.2 Future Reserved Words
  'enum',

  // Also reserved when parsing strict mode code
  'implements',
  'package',
  'protected',
  'interface',
  'private',
  'public',

  // Reserved but not mentioned in specs
  'await',

  'null',
  'true',
  'false',

  'this',
  'arguments',
];

/**
 * identifierPattern
 * Simplified validation of indentifier names: may only contain alphanumeric
 * characters (or "$" or "_"), and may not start with a digit. This is safe
 * and does not reduces the compatibility of the shim. The motivation for
 * this limitation was to decrease the complexity of the implementation,
 * and to maintain a resonable level of performance.
 * Note: \w is equivalent [a-zA-Z_0-9]
 * See 11.6.1 Identifier Names
 */
const identifierPattern = /^[a-zA-Z_$][\w$]*$/;

/**
 * isValidIdentifierName()
 * What variable names might it bring into scope? These include all
 * property names which can be variable names, including the names
 * of inherited properties. It excludes symbols and names which are
 * keywords. We drop symbols safely. Currently, this shim refuses
 * service if any of the names are keywords or keyword-like. This is
 * safe and only prevent performance optimization.
 *
 * @param {string} name
 */
export const isValidIdentifierName = name => {
  // Ensure we have a valid identifier. We use regexpTest rather than
  // /../.test() to guard against the case where RegExp has been poisoned.
  return (
    name !== 'eval' &&
    !arrayIncludes(keywords, name) &&
    regexpTest(identifierPattern, name)
  );
};

/*
 * isImmutableDataProperty
 */

function isImmutableDataProperty(obj, name) {
  const desc = getOwnPropertyDescriptor(obj, name);
  return (
    //
    // The getters will not have .writable, don't let the falsyness of
    // 'undefined' trick us: test with === false, not ! . However descriptors
    // inherit from the (potentially poisoned) global object, so we might see
    // extra properties which weren't really there. Accessor properties have
    // 'get/set/enumerable/configurable', while data properties have
    // 'value/writable/enumerable/configurable'.
    desc.configurable === false &&
    desc.writable === false &&
    //
    // Checks for data properties because they're the only ones we can
    // optimize (accessors are most likely non-constant). Descriptors can't
    // can't have accessors and value properties at the same time, therefore
    // this check is sufficient. Using explicit own property deal with the
    // case where Object.prototype has been poisoned.
    objectHasOwnProperty(desc, 'value')
  );
}

/**
 * getScopeConstants()
 * What variable names might it bring into scope? These include all
 * property names which can be variable names, including the names
 * of inherited properties. It excludes symbols and names which are
 * keywords. We drop symbols safely. Currently, this shim refuses
 * service if any of the names are keywords or keyword-like. This is
 * safe and only prevent performance optimization.
 *
 * @param {Object} globalObject
 * @param {Object} localObject
 */
export const getScopeConstants = (globalObject, localObject = {}) => {
  // getOwnPropertyNames() does ignore Symbols so we don't need to
  // filter them out.
  const globalNames = getOwnPropertyNames(globalObject);
  const localNames = getOwnPropertyNames(localObject);

  // Collect all valid & immutable identifiers from the endowments.
  const localConstants = localNames.filter(
    name =>
      isValidIdentifierName(name) && isImmutableDataProperty(localObject, name),
  );

  // Collect all valid & immutable identifiers from the global that
  // are also not present in the endwoments (immutable or not).
  const globalConstants = globalNames.filter(
    name =>
      // Can't define a constant: it would prevent a
      // lookup on the endowments.
      !localNames.includes(name) &&
      isValidIdentifierName(name) &&
      isImmutableDataProperty(globalObject, name),
  );

  return [...globalConstants, ...localConstants];
};
