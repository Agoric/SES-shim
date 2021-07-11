// Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// This module removes all non-whitelisted properties found by recursively and
// reflectively walking own property chains.
//
// The prototype properties are type checked.
//
// In addition, it verifies that the `prototype`, `__proto__`, and
// `constructor` properties do point to their whitelisted values.
//
// Typically, this module will not be used directly, but via the
// [lockdown-shim] which handles all necessary repairs and taming in SES.
//
// In the whitelist, the `prototype`, `__proto__`, and `constructor` must be
// specified and point to top level entries in the map. For example,
// `Object.__proto__` leads to `FunctionPrototype` which is a top level entry
// in the map.
//
// The permit value must be
//    * the typeof name of a primitive for type-checking (for example,
//      `Error.stackTraceLimit` leads to 'number'),
//    * the name of an intrinsic,
//    * an internal constant(for example, `eval` leads to `fn` which
//      is an alias for `FunctionInstance`, a record that whitelist all
//      properties allowed on such instance).
//    * false, a property to be removed that we know about.
//
// All unlisted properties are also removed. But for the ones that are removed
// because they are unlisted, as opposed to `false`, we also print their
// name to the console as a useful diagnostic, possibly provoking an expansion
// of the whitelist.

import { whitelist, FunctionInstance, isAccessorPermit } from './whitelist.js';
import {
  Error,
  TypeError,
  arrayIncludes,
  getOwnPropertyDescriptor,
  getPrototypeOf,
  isObject,
  objectHasOwnProperty,
  ownKeys,
} from './commons.js';

/**
 * asStringPropertyName()
 *
 * @param {string} path
 * @param {string | symbol} prop
 */
function asStringPropertyName(path, prop) {
  if (typeof prop === 'string') {
    return prop;
  }

  if (typeof prop === 'symbol') {
    return `@@${prop.toString().slice(14, -1)}`;
  }

  throw new TypeError(`Unexpected property name type ${path} ${prop}`);
}

/**
 * whitelistIntrinsics()
 * Removes all non-whitelisted properties found by recursively and
 * reflectively walking own property chains.
 *
 * @param {Object} intrinsics
 * @param {(Object) => void} markVirtualizedNativeFunction
 */
export default function whitelistIntrinsics(
  intrinsics,
  markVirtualizedNativeFunction,
) {
  // These primities are allowed allowed for permits.
  const primitives = ['undefined', 'boolean', 'number', 'string', 'symbol'];

  /*
   * whitelistPrototype()
   * Validate the object's [[prototype]] against a permit.
   */
  function whitelistPrototype(path, obj, protoName) {
    if (!isObject(obj)) {
      throw new TypeError(`Object expected: ${path}, ${obj}, ${protoName}`);
    }
    const proto = getPrototypeOf(obj);

    // Null prototype.
    if (proto === null && protoName === null) {
      return;
    }

    // Assert: protoName, if provided, is a string.
    if (protoName !== undefined && typeof protoName !== 'string') {
      throw new TypeError(`Malformed whitelist permit ${path}.__proto__`);
    }

    // If permit not specified, default to Object.prototype.
    if (proto === intrinsics[protoName || '%ObjectPrototype%']) {
      return;
    }

    // We can't clean [[prototype]], therefore abort.
    throw new Error(`Unexpected intrinsic ${path}.__proto__ at ${protoName}`);
  }

  /*
   * isWhitelistPropertyValue()
   * Whitelist a single property value against a permit.
   */
  function isWhitelistPropertyValue(path, value, prop, permit) {
    if (typeof permit === 'object') {
      // eslint-disable-next-line no-use-before-define
      whitelistProperties(path, value, permit);
      // The property is whitelisted.
      return true;
    }

    if (permit === false) {
      // A boolan 'false' permit specifies the removal of a property.
      // We require a more specific permit instead of allowing 'true'.
      return false;
    }

    if (typeof permit === 'string') {
      // A string permit can have one of two meanings:

      if (prop === 'prototype' || prop === 'constructor') {
        // For prototype and constructor value properties, the permit
        // is the name of an intrinsic.
        // Assumption: prototype and constructor cannot be primitives.
        // Assert: the permit is the name of an intrinsic.
        // Assert: the property value is equal to that intrinsic.

        if (objectHasOwnProperty(intrinsics, permit)) {
          if (value !== intrinsics[permit]) {
            throw new TypeError(`Does not match whitelist ${path}`);
          }
          return true;
        }
      } else {
        // For all other properties, the permit is the name of a primitive.
        // Assert: the permit is the name of a primitive.
        // Assert: the property value type is equal to that primitive.

        // eslint-disable-next-line no-lonely-if
        if (arrayIncludes(primitives, permit)) {
          // eslint-disable-next-line valid-typeof
          if (typeof value !== permit) {
            throw new TypeError(
              `At ${path} expected ${permit} not ${typeof value}`,
            );
          }
          return true;
        }
      }
    }

    throw new TypeError(`Unexpected whitelist permit ${permit} at ${path}`);
  }

  /*
   * isWhitelistProperty()
   * Whitelist a single property against a permit.
   */
  function isWhitelistProperty(path, obj, prop, permit) {
    const desc = getOwnPropertyDescriptor(obj, prop);

    // Is this a value property?
    if (objectHasOwnProperty(desc, 'value')) {
      if (isAccessorPermit(permit)) {
        throw new TypeError(`Accessor expected at ${path}`);
      }
      return isWhitelistPropertyValue(path, desc.value, prop, permit);
    }
    if (!isAccessorPermit(permit)) {
      throw new TypeError(`Accessor not expected at ${path}`);
    }
    return (
      isWhitelistPropertyValue(`${path}<get>`, desc.get, prop, permit.get) &&
      isWhitelistPropertyValue(`${path}<set>`, desc.set, prop, permit.set)
    );
  }

  /*
   * getSubPermit()
   */
  function getSubPermit(obj, permit, prop) {
    const permitProp = prop === '__proto__' ? '--proto--' : prop;
    if (objectHasOwnProperty(permit, permitProp)) {
      return permit[permitProp];
    }

    if (typeof obj === 'function') {
      markVirtualizedNativeFunction(obj);
      if (objectHasOwnProperty(FunctionInstance, permitProp)) {
        return FunctionInstance[permitProp];
      }
    }

    return undefined;
  }

  /*
   * whitelistProperties()
   * Whitelist all properties against a permit.
   */
  function whitelistProperties(path, obj, permit) {
    if (obj === undefined) {
      return;
    }

    const protoName = permit['[[Proto]]'];
    whitelistPrototype(path, obj, protoName);

    for (const prop of ownKeys(obj)) {
      const propString = asStringPropertyName(path, prop);
      const subPath = `${path}.${propString}`;
      const subPermit = getSubPermit(obj, permit, propString);

      if (subPermit) {
        // Property has a permit.
        if (isWhitelistProperty(subPath, obj, prop, subPermit)) {
          // Property is whitelisted.
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      if (subPermit !== false) {
        // This call to `console.log` is intentional. It is not a vestige
        // of a debugging attempt. See the comment at top of file for an
        // explanation.
        console.log(`Removing ${subPath}`);
      }
      try {
        delete obj[prop];
      } catch (err) {
        if (prop in obj) {
          console.error(`failed to delete ${subPath}`, err);
        } else {
          console.error(`deleting ${subPath} threw`, err);
        }
        throw err;
      }
    }
  }

  // Start path with 'intrinsics' to clarify that properties are not
  // removed from the global object by the whitelisting operation.
  whitelistProperties('intrinsics', intrinsics, whitelist);
}
