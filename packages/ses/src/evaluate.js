// Portions adapted from V8 - Copyright 2016 the V8 project authors.
// https://github.com/v8/v8/blob/master/src/builtins/builtins-function.cc

import {
  WeakSet,
  apply,
  immutableObject,
  proxyRevocable,
  weaksetAdd,
} from './commons.js';
import { getScopeConstants } from './scope-constants.js';
import { createScopeHandler } from './scope-handler.js';
import { applyTransforms, mandatoryTransforms } from './transforms.js';
import { makeEvaluateFactory } from './make-evaluate-factory.js';
import { assert } from './error/assert.js';

const { details: d } = assert;

/**
 * performEval()
 * The low-level operation used by all evaluators:
 * eval(), Function(), Evalutator.prototype.evaluate().
 *
 * @param {string} source
 * @param {Object} globalObject
 * @param {Objeect} localObject
 * @param {Object} [options]
 * @param {Array<Transform>} [options.localTransforms]
 * @param {Array<Transform>} [options.globalTransforms]
 * @param {bool} [options.sloppyGlobalsMode]
 * @param {WeakSet} [options.knownScopeProxies]
 */
export const performEval = (
  source,
  globalObject,
  localObject = {},
  {
    localTransforms = [],
    globalTransforms = [],
    sloppyGlobalsMode = false,
    knownScopeProxies = new WeakSet(),
  } = {},
) => {
  // Execute the mandatory transforms last to ensure that any rewritten code
  // meets those mandatory requirements.
  source = applyTransforms(source, [
    ...localTransforms,
    ...globalTransforms,
    mandatoryTransforms,
  ]);

  const {
    scopeHandler,
    admitOneUnsafeEvalNext,
    resetOneUnsafeEvalNext,
  } = createScopeHandler(globalObject, localObject, {
    sloppyGlobalsMode,
  });
  const scopeProxyRevocable = proxyRevocable(immutableObject, scopeHandler);

  const constants = getScopeConstants(globalObject, localObject);
  const evaluateFactory = makeEvaluateFactory(constants);
  const evaluate = apply(evaluateFactory, scopeProxyRevocable.proxy, []);

  admitOneUnsafeEvalNext();
  let err;
  try {
    // Ensure that "this" resolves to the safe global.
    weaksetAdd(knownScopeProxies, scopeProxyRevocable.proxy);
    return apply(evaluate, globalObject, [source]);
  } catch (e) {
    // stash the child-code error in hopes of debugging the internal failure
    err = e;
    throw e;
  } finally {
    if (resetOneUnsafeEvalNext()) {
      // Barring a defect in the SES shim, the scope proxy should allow the
      // powerful, unsafe  `eval` to be used by `evaluate` exactly once, as the
      // very first name that it attempts to access from the lexical scope.
      // A defect in the SES shim could throw an exception after our call to
      // `admitOneUnsafeEvalNext()` and before `evaluate` calls `eval`
      // internally.
      // If we get here, SES is very broken.
      // This condition is one where this vat is now hopelessly confused, and
      // the vat as a whole should be aborted.
      // No further code should run.
      // All immediately reachable state should be abandoned.
      // However, that is not yet possible, so we at least prevent further
      // variable resolution via the scopeHandler, and throw an error with
      // diagnostic info including the thrown error if any from evaluating the
      // source code.
      scopeProxyRevocable.revoke();
      // TODO A GOOD PLACE TO PANIC(), i.e., kill the vat incarnation.
      // See https://github.com/Agoric/SES-shim/issues/490
      assert.fail(d`handler did not reset allowNextEvalToBeUnsafe ${err}`);
    }
  }
};
