import {
  assign,
  create,
  defineProperties,
  freeze,
  getOwnPropertyNames,
  getOwnPropertyDescriptors,
} from './commons.js';
import { initGlobalObject } from './global-object.js';
import { performEval } from './evaluate.js';
import { isValidIdentifierName } from './scope-constants.js';
import { sharedGlobalPropertyNames } from './whitelist.js';
import { getGlobalIntrinsics } from './intrinsics.js';
import { tameFunctionToString } from './tame-function-tostring.js';
import { InertCompartment } from './inert.js';

// privateFields captures the private state for each compartment.
const privateFields = new WeakMap();

export const CompartmentPrototype = {
  constructor: InertCompartment,

  get globalThis() {
    return privateFields.get(this).globalObject;
  },

  get name() {
    return privateFields.get(this).name;
  },

  /**
   * @param {string} source is a JavaScript program grammar construction.
   * @param {{
   *   transforms: Array<Transform>,
   *   sloppyGlobalsMode: bool,
   * }} options.
   */
  evaluate(source, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    if (typeof source !== 'string') {
      throw new TypeError('first argument of evaluate() must be a string');
    }

    // Extract options, and shallow-clone transforms.
    const {
      transforms = [],
      localLexicals = undefined,
      sloppyGlobalsMode = false,
    } = options;
    const localTransforms = [...transforms];

    const {
      globalTransforms,
      globalObject,
      globalLexicals,
    } = privateFields.get(this);

    let localObject = globalLexicals;
    if (localLexicals !== undefined) {
      localObject = create(null, getOwnPropertyDescriptors(globalLexicals));
      defineProperties(localObject, getOwnPropertyDescriptors(localLexicals));
    }

    return performEval(source, globalObject, localObject, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
    });
  },

  toString() {
    return '[object Compartment]';
  },
};

defineProperties(InertCompartment, {
  prototype: { value: CompartmentPrototype },
});

export const makeCompartmentConstructor = (
  compartmentPrototype,
  intrinsics,
  nativeBrander,
) => {
  /**
   * Compartment()
   * Each Compartment constructor is a global. A host that wants to execute
   * code in a context bound to a new global creates a new compartment.
   */
  function Compartment(endowments = {}, _moduleMap = {}, options = {}) {
    // Extract options, and shallow-clone transforms.
    const {
      name = '<unknown>',
      transforms = [],
      globalLexicals = {},
    } = options;
    const globalTransforms = [...transforms];

    const globalObject = {};
    initGlobalObject(globalObject, intrinsics, sharedGlobalPropertyNames, {
      globalTransforms,
      nativeBrander,
      makeCompartmentConstructor,
      compartmentPrototype,
    });

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

    privateFields.set(this, {
      name,
      globalTransforms,
      globalObject,
      // The caller continues to own the globalLexicals object they passed to
      // the compartment constructor, but the compartment only respects the
      // original values and they are constants in the scope of evaluated
      // programs and executed modules.
      // This shallow copy captures only the values of enumerable own
      // properties, erasing accessors.
      // The snapshot is frozen to ensure that the properties are immutable
      // when transferred-by-property-descriptor onto local scope objects.
      globalLexicals: freeze({ ...globalLexicals }),
    });
  }

  defineProperties(Compartment, {
    prototype: { value: compartmentPrototype },
  });

  return Compartment;
};

// TODO wasteful to do it twice, once before lockdown and again during
// lockdown. The second is doubly indirect. We should at least flatten that.
const nativeBrander = tameFunctionToString();

export const Compartment = makeCompartmentConstructor(
  CompartmentPrototype,
  getGlobalIntrinsics(globalThis),
  nativeBrander,
);
