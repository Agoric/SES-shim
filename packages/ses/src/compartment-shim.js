// @ts-check
/* eslint-disable no-underscore-dangle */
/// <reference types="ses">

import {
  Error,
  Map,
  ReferenceError,
  TypeError,
  WeakMap,
  WeakSet,
  assign,
  create,
  defineProperties,
  entries,
  freeze,
  getOwnPropertyDescriptors,
  getOwnPropertyNames,
  weakmapGet,
  weakmapSet,
  weaksetHas,
} from './commons.js';
import { initGlobalObject } from './global-object.js';
import { performEval } from './evaluate.js';
import { isValidIdentifierName } from './scope-constants.js';
import { sharedGlobalPropertyNames } from './whitelist.js';
import {
  evadeHtmlCommentTest,
  evadeImportExpressionTest,
  rejectSomeDirectEvalExpressions,
} from './transforms.js';
import { load } from './module-load.js';
import { link } from './module-link.js';
import { getDeferredExports } from './module-proxy.js';
import { assert } from './error/assert.js';

const { quote: q } = assert;

// moduleAliases associates every public module exports namespace with its
// corresponding compartment and specifier so they can be used to link modules
// across compartments.
// The mechanism to thread an alias is to use the compartment.module function
// to obtain the exports namespace of a foreign module and pass it into another
// compartment's moduleMap constructor option.
const moduleAliases = new WeakMap();

// privateFields captures the private state for each compartment.
const privateFields = new WeakMap();

/**
 * @typedef {(source: string) => string} Transform
 */

// Compartments do not need an importHook or resolveHook to be useful
// as a vessel for evaluating programs.
// However, any method that operates the module system will throw an exception
// if these hooks are not available.
const assertModuleHooks = compartment => {
  const { importHook, resolveHook } = weakmapGet(privateFields, compartment);
  if (typeof importHook !== 'function' || typeof resolveHook !== 'function') {
    throw new TypeError(
      'Compartment must be constructed with an importHook and a resolveHook for it to be able to load modules',
    );
  }
};

export const InertCompartment = function Compartment(
  _endowments = {},
  _modules = {},
  _options = {},
) {
  throw new TypeError(
    'Compartment.prototype.constructor is not a valid constructor.',
  );
};

export const CompartmentPrototype = {
  constructor: InertCompartment,

  get globalThis() {
    return weakmapGet(privateFields, this).globalObject;
  },

  get name() {
    return weakmapGet(privateFields, this).name;
  },

  /**
   * @param {string} source is a JavaScript program grammar construction.
   * @param {Object} [options]
   * @param {Array<Transform>} [options.transforms]
   * @param {boolean} [options.sloppyGlobalsMode]
   * @param {Object} [options.__moduleShimLexicals__]
   * @param {boolean} [options.__evadeHtmlCommentTest__]
   * @param {boolean} [options.__evadeImportExpressionTest__]
   * @param {boolean} [options.__rejectSomeDirectEvalExpressions__]
   */
  evaluate(source, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    // TODO Maybe relax string check and coerce instead:
    // https://github.com/tc39/proposal-dynamic-code-brand-checks
    if (typeof source !== 'string') {
      throw new TypeError('first argument of evaluate() must be a string');
    }

    // Extract options, and shallow-clone transforms.
    const {
      transforms = [],
      sloppyGlobalsMode = false,
      __moduleShimLexicals__ = undefined,
      __evadeHtmlCommentTest__ = false,
      __evadeImportExpressionTest__ = false,
      __rejectSomeDirectEvalExpressions__ = true, // Note default on
    } = options;
    const localTransforms = [...transforms];
    if (__evadeHtmlCommentTest__ === true) {
      localTransforms.push(evadeHtmlCommentTest);
    }
    if (__evadeImportExpressionTest__ === true) {
      localTransforms.push(evadeImportExpressionTest);
    }
    if (__rejectSomeDirectEvalExpressions__ === true) {
      localTransforms.push(rejectSomeDirectEvalExpressions);
    }

    const compartmentFields = weakmapGet(privateFields, this);
    let { globalTransforms } = compartmentFields;
    const {
      globalObject,
      globalLexicals,
      knownScopeProxies,
    } = compartmentFields;

    let localObject = globalLexicals;
    if (__moduleShimLexicals__ !== undefined) {
      // When using `evaluate` for ESM modules, as should only occur from the
      // module-shim's module-instance.js, we do not reveal the SES-shim's
      // module-to-program translation, as this is not standardizable behavior.
      // However, the `localTransforms` will come from the `__shimTransforms__`
      // Compartment option in this case, which is a non-standardizable escape
      // hatch so programs designed specifically for the SES-shim
      // implementation may opt-in to use the same transforms for `evaluate`
      // and `import`, at the expense of being tightly coupled to SES-shim.
      globalTransforms = undefined;

      localObject = create(null, getOwnPropertyDescriptors(globalLexicals));
      defineProperties(
        localObject,
        getOwnPropertyDescriptors(__moduleShimLexicals__),
      );
    }

    return performEval(source, globalObject, localObject, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
      knownScopeProxies,
    });
  },

  toString() {
    return '[object Compartment]';
  },

  /* eslint-disable-next-line no-underscore-dangle */
  __isKnownScopeProxy__(value) {
    const { knownScopeProxies } = weakmapGet(privateFields, this);
    return weaksetHas(knownScopeProxies, value);
  },

  module(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of module() must be a string');
    }

    assertModuleHooks(this);

    const { exportsProxy } = getDeferredExports(
      this,
      weakmapGet(privateFields, this),
      moduleAliases,
      specifier,
    );

    return exportsProxy;
  },

  async import(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of import() must be a string');
    }

    assertModuleHooks(this);

    return load(privateFields, moduleAliases, this, specifier).then(() => {
      // The namespace box is a contentious design and likely to be a breaking
      // change in an appropriately numbered future version.
      const namespace = this.importNow(specifier);
      return { namespace };
    });
  },

  async load(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of load() must be a string');
    }

    assertModuleHooks(this);

    return load(privateFields, moduleAliases, this, specifier);
  },

  importNow(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of importNow() must be a string');
    }

    assertModuleHooks(this);

    const moduleInstance = link(privateFields, moduleAliases, this, specifier);
    moduleInstance.execute();
    return moduleInstance.exportsProxy;
  },
};

defineProperties(InertCompartment, {
  prototype: { value: CompartmentPrototype },
});

/**
 * @callback MakeCompartmentConstructor
 * @param {MakeCompartmentConstructor} targetMakeCompartmentConstructor
 * @param {Record<string, any>} intrinsics
 * @param {(object: Object) => void} markVirtualizedNativeFunction
 * @returns {Compartment['constructor']}
 */

/** @type {MakeCompartmentConstructor} */
export const makeCompartmentConstructor = (
  targetMakeCompartmentConstructor,
  intrinsics,
  markVirtualizedNativeFunction,
) => {
  function Compartment(endowments = {}, moduleMap = {}, options = {}) {
    if (new.target === undefined) {
      throw new TypeError(
        "Class constructor Compartment cannot be invoked without 'new'",
      );
    }

    // Extract options, and shallow-clone transforms.
    const {
      name = '<unknown>',
      transforms = [],
      __shimTransforms__ = [],
      globalLexicals = {},
      resolveHook,
      importHook,
      moduleMapHook,
    } = options;
    const globalTransforms = [...transforms, ...__shimTransforms__];

    // Map<FullSpecifier, ModuleCompartmentRecord>
    const moduleRecords = new Map();
    // Map<FullSpecifier, ModuleInstance>
    const instances = new Map();
    // Map<FullSpecifier, {ExportsProxy, ProxiedExports, activate()}>
    const deferredExports = new Map();

    // Validate given moduleMap.
    // The module map gets translated on-demand in module-load.js and the
    // moduleMap can be invalid in ways that cannot be detected in the
    // constructor, but these checks allow us to throw early for a better
    // developer experience.
    for (const [specifier, aliasNamespace] of entries(moduleMap || {})) {
      if (typeof aliasNamespace === 'string') {
        // TODO implement parent module record retrieval.
        throw new TypeError(
          `Cannot map module ${q(specifier)} to ${q(
            aliasNamespace,
          )} in parent compartment`,
        );
      } else if (weakmapGet(moduleAliases, aliasNamespace) === undefined) {
        // TODO create and link a synthetic module instance from the given
        // namespace object.
        throw ReferenceError(
          `Cannot map module ${q(
            specifier,
          )} because it has no known compartment in this realm`,
        );
      }
    }

    const globalObject = {};
    initGlobalObject(
      globalObject,
      intrinsics,
      sharedGlobalPropertyNames,
      targetMakeCompartmentConstructor,
      this.constructor.prototype,
      {
        globalTransforms,
        markVirtualizedNativeFunction,
      },
    );

    assign(globalObject, endowments);

    const invalidNames = getOwnPropertyNames(globalLexicals).filter(
      identifier => !isValidIdentifierName(identifier),
    );
    if (invalidNames.length) {
      throw new Error(
        `Cannot create compartment with invalid names for global lexicals: ${invalidNames.join(
          ', ',
        )}; these names would not be lexically mentionable`,
      );
    }

    const knownScopeProxies = new WeakSet();

    weakmapSet(privateFields, this, {
      name,
      globalTransforms,
      globalObject,
      knownScopeProxies,
      // The caller continues to own the globalLexicals object they passed to
      // the compartment constructor, but the compartment only respects the
      // original values and they are constants in the scope of evaluated
      // programs and executed modules.
      // This shallow copy captures only the values of enumerable own
      // properties, erasing accessors.
      // The snapshot is frozen to ensure that the properties are immutable
      // when transferred-by-property-descriptor onto local scope objects.
      globalLexicals: freeze({ ...globalLexicals }),
      resolveHook,
      importHook,
      moduleMap,
      moduleMapHook,
      moduleRecords,
      __shimTransforms__,
      deferredExports,
      instances,
    });
  }

  Compartment.prototype = CompartmentPrototype;

  return Compartment;
};
