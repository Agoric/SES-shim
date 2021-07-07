// Compartments need a mechanism to link a module from one compartment
// to another.
// The procedure is to use `compartment.module(specifier)` to obtain the module
// exports namespace from one compartment, possibly before importing or even
// merely loading module, and threading it into the module map of another
// compartment.
// For this to be possible, it is necessary to model the module exports
// namespace as a proxy that will treat all access to those exported properties
// as reference errors until the properties of the actual module are known.
// This provides the mechanism for modeling the public exports proxy
// and eventually connecting it to to the proxied exports.

import { makeAlias } from './module-load.js';
import {
  Proxy,
  TypeError,
  create,
  freeze,
  ownKeys,
  reflectGet,
  reflectGetOwnPropertyDescriptor,
  reflectHas,
  reflectIsExtensible,
  reflectPreventExtensions,
} from './commons.js';
import { assert } from './error/assert.js';

const { quote: q } = assert;

// `deferExports` creates a module's exports proxy, proxied exports, and
// activator.
// A `Compartment` can create a module for any module specifier, regardless of
// whether it is loadable or executable, and use that object as a token that
// can be fed into another compartment's module map.
// Only after the specified module has been analyzed is it possible for the
// module namespace proxy to behave properly, so it throws exceptions until
// after the compartment has begun executing the module.
// The module instance must freeze the proxied exports and activate the exports
// proxy before executing the module.
//
// The module exports proxy's behavior differs from the ECMAScript 262
// specification for "module namespace exotic objects" only in that according
// to the specification value property descriptors have a non-writable "value"
// and this implementation models all properties with accessors.
//
// https://tc39.es/ecma262/#sec-module-namespace-exotic-objects
//
export const deferExports = () => {
  let active = false;
  const proxiedExports = create(null);
  return freeze({
    activate() {
      active = true;
    },
    proxiedExports,
    exportsProxy: new Proxy(proxiedExports, {
      get(_target, name, receiver) {
        if (!active) {
          throw new TypeError(
            `Cannot get property ${q(
              name,
            )} of module exports namespace, the module has not yet begun to execute`,
          );
        }
        return reflectGet(proxiedExports, name, receiver);
      },
      set(_target, name, _value) {
        throw new TypeError(
          `Cannot set property ${q(name)} of module exports namespace`,
        );
      },
      has(_target, name) {
        if (!active) {
          throw new TypeError(
            `Cannot check property ${q(
              name,
            )}, the module has not yet begun to execute`,
          );
        }
        return reflectHas(proxiedExports, name);
      },
      deleteProperty(_target, name) {
        throw new TypeError(
          `Cannot delete property ${q(name)}s of module exports namespace`,
        );
      },
      ownKeys(_target) {
        if (!active) {
          throw new TypeError(
            'Cannot enumerate keys, the module has not yet begun to execute',
          );
        }
        return ownKeys(proxiedExports);
      },
      getOwnPropertyDescriptor(_target, name) {
        if (!active) {
          throw new TypeError(
            `Cannot get own property descriptor ${q(
              name,
            )}, the module has not yet begun to execute`,
          );
        }
        return reflectGetOwnPropertyDescriptor(proxiedExports, name);
      },
      preventExtensions(_target) {
        if (!active) {
          throw new TypeError(
            'Cannot prevent extensions of module exports namespace, the module has not yet begun to execute',
          );
        }
        return reflectPreventExtensions(proxiedExports);
      },
      isExtensible() {
        if (!active) {
          throw new TypeError(
            'Cannot check extensibility of module exports namespace, the module has not yet begun to execute',
          );
        }
        return reflectIsExtensible(proxiedExports);
      },
      getPrototypeOf(_target) {
        return null;
      },
      setPrototypeOf(_target, _proto) {
        throw new TypeError('Cannot set prototype of module exports namespace');
      },
      defineProperty(_target, name, _descriptor) {
        throw new TypeError(
          `Cannot define property ${q(name)} of module exports namespace`,
        );
      },
      apply(_target, _thisArg, _args) {
        throw new TypeError(
          'Cannot call module exports namespace, it is not a function',
        );
      },
      construct(_target, _args) {
        throw new TypeError(
          'Cannot construct module exports namespace, it is not a constructor',
        );
      },
    }),
  });
};

// `getDeferredExports` memoizes the creation of a deferred module exports
// namespace proxy for any abritrary full specifier in a compartment.
// It also records the compartment and specifier affiliated with that module
// exports namespace proxy so it can be used as an alias into another
// compartment when threaded through a compartment's `moduleMap` argument.
export const getDeferredExports = (
  compartment,
  compartmentPrivateFields,
  moduleAliases,
  specifier,
) => {
  const { deferredExports } = compartmentPrivateFields;
  if (!deferredExports.has(specifier)) {
    const deferred = deferExports();
    moduleAliases.set(deferred.exportsProxy, makeAlias(compartment, specifier));
    deferredExports.set(specifier, deferred);
  }
  return deferredExports.get(specifier);
};
