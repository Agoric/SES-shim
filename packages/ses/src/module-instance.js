import { assert } from './error/assert.js';
import { getDeferredExports } from './module-proxy.js';
import {
  Error,
  ReferenceError,
  SyntaxError,
  TypeError,
  create,
  defineProperty,
  entries,
  freeze,
  isArray,
  keys,
} from './commons.js';

const { quote: q } = assert;

export const makeThirdPartyModuleInstance = (
  compartmentPrivateFields,
  staticModuleRecord,
  compartment,
  moduleAliases,
  moduleSpecifier,
  resolvedImports,
) => {
  const { exportsProxy, proxiedExports, activate } = getDeferredExports(
    compartment,
    compartmentPrivateFields.get(compartment),
    moduleAliases,
    moduleSpecifier,
  );

  const notifiers = create(null);

  if (staticModuleRecord.exports) {
    if (
      !isArray(staticModuleRecord.exports) ||
      staticModuleRecord.exports.some(name => typeof name !== 'string')
    ) {
      throw new TypeError(
        `SES third-party static module record "exports" property must be an array of strings for module ${moduleSpecifier}`,
      );
    }
    staticModuleRecord.exports.forEach(name => {
      let value = proxiedExports[name];
      const updaters = [];

      const get = () => value;

      const set = newValue => {
        value = newValue;
        for (const updater of updaters) {
          updater(newValue);
        }
      };

      defineProperty(proxiedExports, name, {
        get,
        set,
        enumerable: true,
        configurable: false,
      });

      notifiers[name] = update => {
        updaters.push(update);
        update(value);
      };
    });
  }

  let activated = false;
  return freeze({
    notifiers,
    exportsProxy,
    execute() {
      if (!activated) {
        activate();
        activated = true;
        staticModuleRecord.execute(
          proxiedExports,
          compartment,
          resolvedImports,
        );
      }
    },
  });
};

// `makeModuleInstance` takes a module's compartment record, the live import
// namespace, and a global object; and produces a module instance.
// The module instance carries the proxied module exports namespace (the
// "exports"), notifiers to update the module's internal import namespace, and
// an idempotent execute function.
// The module exports namespace is a proxy to the proxied exports namespace
// that the execution of the module instance populates.
export const makeModuleInstance = (
  privateFields,
  moduleAliases,
  moduleRecord,
  importedInstances,
) => {
  const { compartment, moduleSpecifier, staticModuleRecord } = moduleRecord;
  const {
    reexports: exportAlls = [],
    __syncModuleProgram__: functorSource,
    __fixedExportMap__: fixedExportMap = {},
    __liveExportMap__: liveExportMap = {},
  } = staticModuleRecord;

  const compartmentFields = privateFields.get(compartment);

  const { __shimTransforms__ } = compartmentFields;

  const { exportsProxy, proxiedExports, activate } = getDeferredExports(
    compartment,
    compartmentFields,
    moduleAliases,
    moduleSpecifier,
  );

  // {_exportName_: getter} module exports namespace
  // object (eventually proxied).
  const exportsProps = create(null);

  // {_localName_: accessor} proxy traps for globalLexicals and live bindings.
  // The globalLexicals object is frozen and the corresponding properties of
  // localLexicals must be immutable, so we copy the descriptors.
  const localLexicals = create(null);

  // {_localName_: init(initValue) -> initValue} used by the
  // rewritten code to initialize exported fixed bindings.
  const onceVar = create(null);

  // {_localName_: update(newValue)} used by the rewritten code to
  // both initialize and update live bindings.
  const liveVar = create(null);

  // {_localName_: [{get, set, notify}]} used to merge all the export updaters.
  const localGetNotify = create(null);

  // {[importName: string]: notify(update(newValue))} Used by code that imports
  // one of this module's exports, so that their update function will
  // be notified when this binding is initialized or updated.
  const notifiers = create(null);

  entries(fixedExportMap).forEach(([fixedExportName, [localName]]) => {
    let fixedGetNotify = localGetNotify[localName];
    if (!fixedGetNotify) {
      // fixed binding state
      let value;
      let tdz = true;
      let optUpdaters = [];

      // tdz sensitive getter
      const get = () => {
        if (tdz) {
          throw new ReferenceError(
            `binding ${q(localName)} not yet initialized`,
          );
        }
        return value;
      };

      // leave tdz once
      const init = freeze(initValue => {
        // init with initValue of a declared const binding, and return
        // it.
        if (!tdz) {
          throw new Error(
            `Internal: binding ${q(localName)} already initialized`,
          );
        }
        value = initValue;
        const updaters = optUpdaters;
        optUpdaters = null;
        tdz = false;
        for (const updater of updaters) {
          updater(initValue);
        }
        return initValue;
      });

      // If still tdz, register update for notification later.
      // Otherwise, update now.
      const notify = updater => {
        if (updater === init) {
          // Prevent recursion.
          return;
        }
        if (tdz) {
          optUpdaters.push(updater);
        } else {
          updater(value);
        }
      };

      // Need these for additional exports of the local variable.
      fixedGetNotify = {
        get,
        notify,
      };
      localGetNotify[localName] = fixedGetNotify;
      onceVar[localName] = init;
    }

    exportsProps[fixedExportName] = {
      get: fixedGetNotify.get,
      set: undefined,
      enumerable: true,
      configurable: false,
    };

    notifiers[fixedExportName] = fixedGetNotify.notify;
  });

  entries(liveExportMap).forEach(
    ([liveExportName, [localName, setProxyTrap]]) => {
      let liveGetNotify = localGetNotify[localName];
      if (!liveGetNotify) {
        // live binding state
        let value;
        let tdz = true;
        const updaters = [];

        // tdz sensitive getter
        const get = () => {
          if (tdz) {
            throw new ReferenceError(
              `binding ${q(liveExportName)} not yet initialized`,
            );
          }
          return value;
        };

        // This must be usable locally for the translation of initializing
        // a declared local live binding variable.
        //
        // For reexported variable, this is also an update function to
        // register for notification with the downstream import, which we
        // must assume to be live. Thus, it can be called independent of
        // tdz but always leaves tdz. Such reexporting creates a tree of
        // bindings. This lets the tree be hooked up even if the imported
        // module instance isn't initialized yet, as may happen in cycles.
        const update = freeze(newValue => {
          value = newValue;
          tdz = false;
          for (const updater of updaters) {
            updater(newValue);
          }
        });

        // tdz sensitive setter
        const set = newValue => {
          if (tdz) {
            throw new ReferenceError(
              `binding ${q(localName)} not yet initialized`,
            );
          }
          value = newValue;
          for (const updater of updaters) {
            updater(newValue);
          }
        };

        // Always register the updater function.
        // If not in tdz, also update now.
        const notify = updater => {
          if (updater === update) {
            // Prevent recursion.
            return;
          }
          updaters.push(updater);
          if (!tdz) {
            updater(value);
          }
        };

        liveGetNotify = {
          get,
          notify,
        };

        localGetNotify[localName] = liveGetNotify;
        if (setProxyTrap) {
          defineProperty(localLexicals, localName, {
            get,
            set,
            enumerable: true,
            configurable: false,
          });
        }
        liveVar[localName] = update;
      }

      exportsProps[liveExportName] = {
        get: liveGetNotify.get,
        set: undefined,
        enumerable: true,
        configurable: false,
      };

      notifiers[liveExportName] = liveGetNotify.notify;
    },
  );

  const notifyStar = update => {
    update(proxiedExports);
  };
  notifiers['*'] = notifyStar;

  // Per the calling convention for the moduleFunctor generated from
  // an ESM, the `imports` function gets called once up front
  // to populate or arrange the population of imports and reexports.
  // The generated code produces an `updateRecord`: the means for
  // the linker to update the imports and exports of the module.
  // The updateRecord must conform to moduleAnalysis.imports
  // updateRecord = Map<specifier, importUpdaters>
  // importUpdaters = Map<importName, [update(newValue)*]>
  function imports(updateRecord) {
    // By the time imports is called, the importedInstances should already be
    // initialized with module instances that satisfy
    // imports.
    // importedInstances = Map[_specifier_, { notifiers, module, execute }]
    // notifiers = { [importName: string]: notify(update(newValue))}

    // export * cannot export default.
    const candidateAll = create(null);
    candidateAll.default = false;
    for (const [specifier, importUpdaters] of updateRecord) {
      const instance = importedInstances.get(specifier);
      instance.execute(); // bottom up cycle tolerant
      const { notifiers: importNotifiers } = instance;
      for (const [importName, updaters] of importUpdaters) {
        const importNotify = importNotifiers[importName];
        if (!importNotify) {
          throw SyntaxError(
            `The requested module '${specifier}' does not provide an export named '${importName}'`,
          );
        }
        for (const updater of updaters) {
          importNotify(updater);
        }
      }
      if (exportAlls.includes(specifier)) {
        // Make all these imports candidates.
        for (const [importName, importNotify] of entries(importNotifiers)) {
          if (candidateAll[importName] === undefined) {
            candidateAll[importName] = importNotify;
          } else {
            // Already a candidate: remove ambiguity.
            candidateAll[importName] = false;
          }
        }
      }
    }

    for (const [importName, notify] of entries(candidateAll)) {
      if (!notifiers[importName] && notify !== false) {
        notifiers[importName] = notify;

        // exported live binding state
        let value;
        const update = newValue => (value = newValue);
        notify(update);
        exportsProps[importName] = {
          get() {
            return value;
          },
          set: undefined,
          enumerable: true,
          configurable: false,
        };
      }
    }

    // Sort the module exports namespace as per spec.
    // The module exports namespace will be wrapped in a module namespace
    // exports proxy which will serve as a "module exports namespace exotic
    // object".
    // Sorting properties is not generally reliable because some properties may
    // be symbols, and symbols do not have an inherent relative order, but
    // since all properties of the exports namespace must be keyed by a string
    // and the string must correspond to a valid identifier, sorting these
    // properties works for this specific case.
    keys(exportsProps)
      .sort()
      .forEach(k => defineProperty(proxiedExports, k, exportsProps[k]));

    freeze(proxiedExports);
    activate();
  }

  let optFunctor = compartment.evaluate(functorSource, {
    globalObject: compartment.globalThis,
    transforms: __shimTransforms__,
    __moduleShimLexicals__: localLexicals,
  });
  let didThrow = false;
  let thrownError;
  function execute() {
    if (optFunctor) {
      // uninitialized
      const functor = optFunctor;
      optFunctor = null;
      // initializing - call with `this` of `undefined`.
      try {
        functor(
          freeze({
            imports: freeze(imports),
            onceVar: freeze(onceVar),
            liveVar: freeze(liveVar),
          }),
        );
      } catch (e) {
        didThrow = true;
        thrownError = e;
      }
      // initialized
    }
    if (didThrow) {
      throw thrownError;
    }
  }

  return freeze({
    notifiers,
    exportsProxy,
    execute,
  });
};
