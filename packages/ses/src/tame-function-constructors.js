import {
  FERAL_FUNCTION,
  SyntaxError,
  TypeError,
  defineProperties,
  getPrototypeOf,
  setPrototypeOf,
} from './commons.js';

// This module replaces the original `Function` constructor, and the original
// `%GeneratorFunction%`, `%AsyncFunction%` and `%AsyncGeneratorFunction%`,
// with safe replacements that throw if invoked.
//
// These are all reachable via syntax, so it isn't sufficient to just
// replace global properties with safe versions. Our main goal is to prevent
// access to the `Function` constructor through these starting points.
//
// After modules block is done, the originals must no longer be reachable,
// unless a copy has been made, and functions can only be created by syntax
// (using eval) or by invoking a previously saved reference to the originals.
//
// Typically, this module will not be used directly, but via the
// [lockdown - shim] which handles all necessary repairs and taming in SES.
//
// Relation to ECMA specifications
//
// The taming of constructors really wants to be part of the standard, because
// new constructors may be added in the future, reachable from syntax, and this
// list must be updated to match.
//
// In addition, the standard needs to define four new intrinsics for the safe
// replacement functions. See [./whitelist intrinsics].
//
// Adapted from SES/Caja
// Copyright (C) 2011 Google Inc.
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js

/**
 * tameFunctionConstructors()
 * This block replaces the original Function constructor, and the original
 * %GeneratorFunction% %AsyncFunction% and %AsyncGeneratorFunction%, with
 * safe replacements that throw if invoked.
 */
export default function tameFunctionConstructors() {
  try {
    // Verify that the method is not callable.
    FERAL_FUNCTION.prototype.constructor('return 1');
  } catch (ignore) {
    // Throws, no need to patch.
    return {};
  }

  const newIntrinsics = {};

  /*
   * The process to repair constructors:
   * 1. Create an instance of the function by evaluating syntax
   * 2. Obtain the prototype from the instance
   * 3. Create a substitute tamed constructor
   * 4. Replace the original constructor with the tamed constructor
   * 5. Replace tamed constructor prototype property with the original one
   * 6. Replace its [[Prototype]] slot with the tamed constructor of Function
   */
  function repairFunction(name, intrinsicName, declaration) {
    let FunctionInstance;
    try {
      // eslint-disable-next-line no-eval, no-restricted-globals
      FunctionInstance = (0, eval)(declaration);
    } catch (e) {
      if (e instanceof SyntaxError) {
        // Prevent failure on platforms where async and/or generators
        // are not supported.
        return;
      }
      // Re-throw
      throw e;
    }
    const FunctionPrototype = getPrototypeOf(FunctionInstance);

    // Prevents the evaluation of source when calling constructor on the
    // prototype of functions.
    // eslint-disable-next-line func-names
    const InertConstructor = function() {
      throw new TypeError(
        'Function.prototype.constructor is not a valid constructor.',
      );
    };
    defineProperties(InertConstructor, {
      prototype: { value: FunctionPrototype },
      name: {
        value: name,
        writable: false,
        enumerable: false,
        configurable: true,
      },
    });

    defineProperties(FunctionPrototype, {
      constructor: { value: InertConstructor },
    });

    // Reconstructs the inheritance among the new tamed constructors
    // to mirror the original specified in normal JS.
    if (InertConstructor !== FERAL_FUNCTION.prototype.constructor) {
      setPrototypeOf(InertConstructor, FERAL_FUNCTION.prototype.constructor);
    }

    newIntrinsics[intrinsicName] = InertConstructor;
  }

  // Here, the order of operation is important: Function needs to be repaired
  // first since the other repaired constructors need to inherit from the
  // tamed Function function constructor.

  repairFunction('Function', '%InertFunction%', '(function(){})');
  repairFunction(
    'GeneratorFunction',
    '%InertGeneratorFunction%',
    '(function*(){})',
  );
  repairFunction(
    'AsyncFunction',
    '%InertAsyncFunction%',
    '(async function(){})',
  );
  repairFunction(
    'AsyncGeneratorFunction',
    '%InertAsyncGeneratorFunction%',
    '(async function*(){})',
  );

  return newIntrinsics;
}
