/* eslint no-underscore-dangle: ["off"] */

// For brevity, in this file, as in module-load.js, the term "moduleRecord"
// without qualification means "module compartment record".
// This is a super-set of the "static module record", that is reusable between
// compartments with different hooks.
// The "module compartment record" captures the compartment and overlays the
// module's "imports" with the more specific "resolvedImports" as inferred from
// the particular compartment's "resolveHook".

import { assert } from './error/assert.js';
import {
  makeModuleInstance,
  makeThirdPartyModuleInstance,
} from './module-instance.js';
import {
  Error,
  Map,
  ReferenceError,
  entries,
  isArray,
  isObject,
  mapGet,
  mapHas,
  mapSet,
  weakmapGet,
} from './commons.js';

const { quote: q } = assert;

// `link` creates `ModuleInstances` and `ModuleNamespaces` for a module and its
// transitive dependencies and connects their imports and exports.
// After linking, the resulting working set is ready to be executed.
// The linker only concerns itself with module namespaces that are objects with
// property descriptors for their exports, which the Compartment proxies with
// the actual `ModuleNamespace`.
export const link = (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
) => {
  const { moduleRecords } = weakmapGet(compartmentPrivateFields, compartment);

  const moduleRecord = mapGet(moduleRecords, moduleSpecifier);
  if (moduleRecord === undefined) {
    throw new ReferenceError(`Missing link to module ${q(moduleSpecifier)}`);
  }

  // Mutual recursion so there's no confusion about which
  // compartment is in context: the module record may be in another
  // compartment, denoted by moduleRecord.compartment.
  // eslint-disable-next-line no-use-before-define
  return instantiate(compartmentPrivateFields, moduleAliases, moduleRecord);
};

function isPrecompiled(staticModuleRecord) {
  return typeof staticModuleRecord.__syncModuleProgram__ === 'string';
}

function validatePrecompiledStaticModuleRecord(
  staticModuleRecord,
  moduleSpecifier,
) {
  const { __fixedExportMap__, __liveExportMap__ } = staticModuleRecord;
  assert(
    isObject(__fixedExportMap__),
    `Property '__fixedExportMap__' of a precompiled module record must be an object, got ${q(
      __fixedExportMap__,
    )}, for module ${q(moduleSpecifier)}`,
  );
  assert(
    isObject(__liveExportMap__),
    `Property '__liveExportMap__' of a precompiled module record must be an object, got ${q(
      __liveExportMap__,
    )}, for module ${q(moduleSpecifier)}`,
  );
}

function isThirdParty(staticModuleRecord) {
  return typeof staticModuleRecord.execute === 'function';
}

function validateThirdPartyStaticModuleRecord(
  staticModuleRecord,
  moduleSpecifier,
) {
  const { exports } = staticModuleRecord;
  assert(
    isArray(exports),
    `Property 'exports' of a third-party static module record must be an array, got ${q(
      exports,
    )}, for module ${q(moduleSpecifier)}`,
  );
}

function validateStaticModuleRecord(staticModuleRecord, moduleSpecifier) {
  assert(
    isObject(staticModuleRecord),
    `Static module records must be of type object, got ${q(
      staticModuleRecord,
    )}, for module ${q(moduleSpecifier)}`,
  );
  const { imports, exports, reexports = [] } = staticModuleRecord;
  assert(
    isArray(imports),
    `Property 'imports' of a static module record must be an array, got ${q(
      imports,
    )}, for module ${q(moduleSpecifier)}`,
  );
  assert(
    isArray(exports),
    `Property 'exports' of a precompiled module record must be an array, got ${q(
      exports,
    )}, for module ${q(moduleSpecifier)}`,
  );
  assert(
    isArray(reexports),
    `Property 'reexports' of a precompiled module record must be an array if present, got ${q(
      reexports,
    )}, for module ${q(moduleSpecifier)}`,
  );
}

export const instantiate = (
  compartmentPrivateFields,
  moduleAliases,
  moduleRecord,
) => {
  const {
    compartment,
    moduleSpecifier,
    resolvedImports,
    staticModuleRecord,
  } = moduleRecord;
  const { instances } = weakmapGet(compartmentPrivateFields, compartment);

  // Memoize.
  if (mapHas(instances, moduleSpecifier)) {
    return mapGet(instances, moduleSpecifier);
  }

  validateStaticModuleRecord(staticModuleRecord, moduleSpecifier);

  const importedInstances = new Map();
  let moduleInstance;
  if (isPrecompiled(staticModuleRecord)) {
    validatePrecompiledStaticModuleRecord(staticModuleRecord, moduleSpecifier);
    moduleInstance = makeModuleInstance(
      compartmentPrivateFields,
      moduleAliases,
      moduleRecord,
      importedInstances,
    );
  } else if (isThirdParty(staticModuleRecord)) {
    validateThirdPartyStaticModuleRecord(staticModuleRecord, moduleSpecifier);
    moduleInstance = makeThirdPartyModuleInstance(
      compartmentPrivateFields,
      staticModuleRecord,
      compartment,
      moduleAliases,
      moduleSpecifier,
      resolvedImports,
    );
  } else {
    throw new Error(
      `importHook must return a static module record, got ${q(
        staticModuleRecord,
      )}`,
    );
  }

  // Memoize.
  mapSet(instances, moduleSpecifier, moduleInstance);

  // Link dependency modules.
  for (const [importSpecifier, resolvedSpecifier] of entries(resolvedImports)) {
    const importedInstance = link(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      resolvedSpecifier,
    );
    mapSet(importedInstances, importSpecifier, importedInstance);
  }

  return moduleInstance;
};
