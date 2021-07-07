// Adapted from SES/Caja - Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric

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

// based upon:
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js
// then copied from proposal-frozen-realms deep-freeze.js
// then copied from SES/src/bundle/deepFreeze.js

// @ts-check

import {
  Set,
  String,
  TypeError,
  WeakMap,
  WeakSet,
  arrayForEach,
  freeze,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  isObject,
  objectHasOwnProperty,
  ownKeys,
  setAdd,
  setForEach,
  setHas,
  weakmapGet,
  weakmapSet,
  weaksetAdd,
  weaksetHas,
} from './commons.js';

/**
 * @typedef {import('../index.js').Harden} Harden
 */

/**
 * Create a `harden` function.
 *
 * @returns {Harden}
 */
export const makeHardener = () => {
  const hardened = new WeakSet();

  const { harden } = {
    /**
     * @template T
     * @param {T} root
     * @returns {T}
     */
    harden(root) {
      const toFreeze = new Set();
      const paths = new WeakMap();

      // If val is something we should be freezing but aren't yet,
      // add it to toFreeze.
      /**
       * @param {any} val
       * @param {string} [path]
       */
      function enqueue(val, path = undefined) {
        if (!isObject(val)) {
          // ignore primitives
          return;
        }
        const type = typeof val;
        if (type !== 'object' && type !== 'function') {
          // future proof: break until someone figures out what it should do
          throw new TypeError(`Unexpected typeof: ${type}`);
        }
        if (weaksetHas(hardened, val) || setHas(toFreeze, val)) {
          // Ignore if this is an exit, or we've already visited it
          return;
        }
        // console.log(`adding ${val} to toFreeze`, val);
        setAdd(toFreeze, val);
        weakmapSet(paths, val, path);
      }

      /**
       * @param {any} obj
       */
      function freezeAndTraverse(obj) {
        // Now freeze the object to ensure reactive
        // objects such as proxies won't add properties
        // during traversal, before they get frozen.

        // Object are verified before being enqueued,
        // therefore this is a valid candidate.
        // Throws if this fails (strict mode).
        freeze(obj);

        // we rely upon certain commitments of Object.freeze and proxies here

        // get stable/immutable outbound links before a Proxy has a chance to do
        // something sneaky.
        const path = weakmapGet(paths, obj) || 'unknown';
        const descs = getOwnPropertyDescriptors(obj);
        const proto = getPrototypeOf(obj);
        enqueue(proto, `${path}.__proto__`);

        arrayForEach(ownKeys(descs), (/** @type {string | symbol} */ name) => {
          const pathname = `${path}.${String(name)}`;
          // The 'name' may be a symbol, and TypeScript doesn't like us to
          // index arbitrary symbols on objects, so we pretend they're just
          // strings.
          const desc = descs[/** @type {string} */ (name)];
          // getOwnPropertyDescriptors is guaranteed to return well-formed
          // descriptors, but they still inherit from Object.prototype. If
          // someone has poisoned Object.prototype to add 'value' or 'get'
          // properties, then a simple 'if ("value" in desc)' or 'desc.value'
          // test could be confused. We use hasOwnProperty to be sure about
          // whether 'value' is present or not, which tells us for sure that
          // this is a data property.
          if (objectHasOwnProperty(desc, 'value')) {
            enqueue(desc.value, `${pathname}`);
          } else {
            enqueue(desc.get, `${pathname}(get)`);
            enqueue(desc.set, `${pathname}(set)`);
          }
        });
      }

      function dequeue() {
        // New values added before forEach() has finished will be visited.
        setForEach(toFreeze, freezeAndTraverse);
      }

      /** @param {any} value */
      function markHardened(value) {
        weaksetAdd(hardened, value);
      }

      function commit() {
        setForEach(toFreeze, markHardened);
      }

      enqueue(root);
      dequeue();
      // console.log("toFreeze set:", toFreeze);
      commit();

      return root;
    },
  };

  return harden;
};
