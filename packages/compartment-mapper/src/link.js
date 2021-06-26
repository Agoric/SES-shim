// @ts-check

/** @typedef {import('ses').ModuleMapHook} ModuleMapHook */
/** @typedef {import('ses').ResolveHook} ResolveHook */
/** @typedef {import('./types.js').ParseFn} ParseFn */
/** @typedef {import('./types.js').ModuleTransforms} ModuleTransforms */
/** @typedef {import('./types.js').Language} Language */
/** @typedef {import('./types.js').ModuleDescriptor} ModuleDescriptor */
/** @typedef {import('./types.js').CompartmentMapDescriptor} CompartmentMapDescriptor */
/** @typedef {import('./types.js').LinkOptions} LinkOptions */

import { resolve } from './node-module-specifier.js';
import { parseExtension } from './extension.js';

const { entries, fromEntries, freeze } = Object;
const { hasOwnProperty } = Object.prototype;
const { apply } = Reflect;

const inertStaticModuleRecord = {
  imports: [],
  exports: [],
  execute() {
    throw new Error(
      `Assertion failed: compartment graphs built for archives cannot be initialized`,
    );
  },
};

const inertModuleNamespace = new Compartment(
  {},
  {},
  {
    resolveHook() {
      return '';
    },
    async importHook() {
      return inertStaticModuleRecord;
    },
  },
).module('');

const defaultCompartment = Compartment;

// q, as in quote, for strings in error messages.
const q = JSON.stringify;

/**
 * @template {string | number} Key
 * @template Value
 * @param {Record<Key, Value>} object
 * @param {Key} key
 * @returns {boolean}
 */
const has = (object, key) => apply(hasOwnProperty, object, [key]);

/**
 * `makeExtensionParser` produces a `parser` that parses the content of a
 * module according to the corresponding module language, given the extension
 * of the module specifier and the configuration of the containing compartment.
 * We do not yet support import assertions and we do not have a mechanism
 * for validating the MIME type of the module content against the
 * language implied by the extension or file name.
 *
 * @param {Record<string, string>} languageForExtension - maps a file extension
 * to the corresponding language.
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case,
 * the type of a module is implied by package.json and should not be inferred
 * from its extension.
 * @param {Record<string, ParseFn>} parserForLanguage
 * @param {ModuleTransforms} transforms
 * @returns {ParseFn}
 */
const makeExtensionParser = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  transforms,
) => {
  return async (bytes, specifier, location, packageLocation) => {
    let language;
    if (has(languageForModuleSpecifier, specifier)) {
      language = languageForModuleSpecifier[specifier];
    } else {
      const extension = parseExtension(location);
      if (!has(languageForExtension, extension)) {
        throw new Error(
          `Cannot parse module ${specifier} at ${location}, no parser configured for extension ${extension}`,
        );
      }
      language = languageForExtension[extension];
    }

    if (has(transforms, language)) {
      ({ bytes, parser: language } = await transforms[language](
        bytes,
        specifier,
        location,
        packageLocation,
      ));
    }

    if (!has(parserForLanguage, language)) {
      throw new Error(
        `Cannot parse module ${specifier} at ${location}, no parser configured for the language ${language}`,
      );
    }
    const parse = parserForLanguage[language];
    return parse(bytes, specifier, location, packageLocation);
  };
};

/**
 * @param {Record<string, Language>} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @param {Record<string, ParseFn>} parserForLanguage
 * @param {ModuleTransforms} transforms
 * @returns {ParseFn}
 */
export const mapParsers = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  transforms = {},
) => {
  const languageForExtensionEntries = [];
  const problems = [];
  for (const [extension, language] of entries(languageForExtension)) {
    if (has(parserForLanguage, language)) {
      languageForExtensionEntries.push([extension, language]);
    } else {
      problems.push(`${q(language)} for extension ${q(extension)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`No parser available for language: ${problems.join(', ')}`);
  }
  return makeExtensionParser(
    fromEntries(languageForExtensionEntries),
    languageForModuleSpecifier,
    parserForLanguage,
    transforms,
  );
};

/**
 * For a full, absolute module specifier like "dependency",
 * produce the module specifier in the dependency, like ".".
 * For a deeper path like "@org/dep/aux" and a prefix like "@org/dep", produce
 * "./aux".
 *
 * @param {string} moduleSpecifier
 * @param {string} prefix
 * @returns {string=}
 */
const trimModuleSpecifierPrefix = (moduleSpecifier, prefix) => {
  if (moduleSpecifier === prefix) {
    return '.';
  }
  if (moduleSpecifier.startsWith(`${prefix}/`)) {
    return `./${moduleSpecifier.slice(prefix.length + 1)}`;
  }
  return undefined;
};

/**
 * `makeModuleMapHook` generates a `moduleMapHook` for the `Compartment`
 * constructor, suitable for Node.js style packages where any module in the
 * package might be imported.
 * Since searching for all of these modules up front is either needlessly
 * costly (on a file system) or impossible (from a web service), we
 * let the import graph guide our search.
 * Any module specifier with an absolute prefix should be captured by
 * the `moduleMap` or `moduleMapHook`.
 *
 * @param {Record<string, Compartment>} compartments
 * @param {string} compartmentName
 * @param {Record<string, ModuleDescriptor>} moduleDescriptors
 * @param {Record<string, ModuleDescriptor>} scopeDescriptors
 * @param {Record<string, string>} exitModules
 * @param {boolean} archiveOnly
 * @returns {ModuleMapHook | undefined}
 */
const makeModuleMapHook = (
  compartments,
  compartmentName,
  moduleDescriptors,
  scopeDescriptors,
  exitModules,
  archiveOnly,
) => {
  /**
   * @param {string} moduleSpecifier
   * @returns {string | Object | undefined}
   */
  const moduleMapHook = moduleSpecifier => {
    const moduleDescriptor = moduleDescriptors[moduleSpecifier];
    if (moduleDescriptor !== undefined) {
      const {
        compartment: foreignCompartmentName = compartmentName,
        module: foreignModuleSpecifier,
        exit,
      } = moduleDescriptor;
      if (exit !== undefined) {
        // TODO Currenly, every package can connect to built-in modules.
        // Policies should be able to allow third-party modules to exit to
        // built-ins explicitly, or have built-ins subverted by modules from
        // specific compartments.
        const module = exitModules[exit];
        if (module === undefined) {
          throw new Error(
            `Cannot import missing external module ${q(
              exit,
            )}, may be missing from ${compartmentName} package.json`,
          );
        }
        if (archiveOnly) {
          return inertModuleNamespace;
        } else {
          return module;
        }
      }
      if (foreignModuleSpecifier !== undefined) {
        const foreignCompartment = compartments[foreignCompartmentName];
        if (foreignCompartment === undefined) {
          throw new Error(
            `Cannot import from missing compartment ${q(
              foreignCompartmentName,
            )}`,
          );
        }
        return foreignCompartment.module(foreignModuleSpecifier);
      }
    } else if (has(exitModules, moduleSpecifier)) {
      // When linking off the filesystem as with `importLocation`,
      // there isn't a module descriptor for every module.
      // TODO grant access to built-in modules contingent on a policy in the
      // application's entry package descriptor.
      moduleDescriptors[moduleSpecifier] = { exit: moduleSpecifier };
      if (archiveOnly) {
        return inertModuleNamespace;
      } else {
        return exitModules[moduleSpecifier];
      }
    }

    // Search for a scope that shares a prefix with the requested module
    // specifier.
    // This might be better with a trie, but only a benchmark on real-world
    // data would tell us whether the additional complexity would translate to
    // better performance, so this is left readable and presumed slow for now.
    for (const [scopePrefix, scopeDescriptor] of entries(scopeDescriptors)) {
      const foreignModuleSpecifier = trimModuleSpecifierPrefix(
        moduleSpecifier,
        scopePrefix,
      );

      if (foreignModuleSpecifier !== undefined) {
        const { compartment: foreignCompartmentName } = scopeDescriptor;
        if (foreignCompartmentName === undefined) {
          throw new Error(
            `Cannot import from scope ${scopePrefix} due to missing "compartment" property`,
          );
        }
        const foreignCompartment = compartments[foreignCompartmentName];
        if (foreignCompartment === undefined) {
          throw new Error(
            `Cannot import from missing compartment ${q(
              foreignCompartmentName,
            )}`,
          );
        }

        // The following line is weird.
        // Information is flowing backward.
        // This moduleMapHook writes back to the `modules` descriptor, from the
        // original compartment map.
        // So the compartment map that was used to create the compartment
        // assembly, can then be captured in an archive, obviating the need for
        // a moduleMapHook when we assemble compartments from the resulting
        // archiev.
        moduleDescriptors[moduleSpecifier] = {
          compartment: foreignCompartmentName,
          module: foreignModuleSpecifier,
        };
        return foreignCompartment.module(foreignModuleSpecifier);
      }
    }

    // No entry in the module map.
    // Compartments will fall through to their `importHook`.
    return undefined;
  };

  return moduleMapHook;
};

/**
 * Assemble a DAG of compartments as declared in a compartment map starting at
 * the named compartment and building all compartments that it depends upon,
 * recursively threading the modules exported by one compartment into the
 * compartment that imports them.
 * Returns the root of the compartment DAG.
 * Does not load or execute any modules.
 * Uses makeImportHook with the given "location" string of each compartment in
 * the DAG.
 * Passes the given globals and external modules into the root compartment
 * only.
 *
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {LinkOptions} options
 */
export const link = (
  { entry, compartments: compartmentDescriptors },
  {
    makeImportHook,
    parserForLanguage,
    globals = {},
    globalLexicals = {},
    transforms = [],
    moduleTransforms = {},
    __shimTransforms__ = [],
    modules: exitModules = {},
    archiveOnly = false,
    Compartment = defaultCompartment,
  },
) => {
  const { compartment: entryCompartmentName } = entry;

  /** @type {Record<string, Compartment>} */
  const compartments = {};
  /** @type {Record<string, ResolveHook>} */
  const resolvers = {};
  for (const [compartmentName, compartmentDescriptor] of entries(
    compartmentDescriptors,
  )) {
    const {
      location,
      modules = {},
      parsers: languageForExtension = {},
      types: languageForModuleSpecifier = {},
      scopes = {},
    } = compartmentDescriptor;

    // Capture the default.
    // The `moduleMapHook` writes back to the compartment map.
    compartmentDescriptor.modules = modules;

    const parse = mapParsers(
      languageForExtension,
      languageForModuleSpecifier,
      parserForLanguage,
      moduleTransforms,
    );
    const importHook = makeImportHook(location, parse, exitModules);
    const moduleMapHook = makeModuleMapHook(
      compartments,
      compartmentName,
      modules,
      scopes,
      exitModules,
      archiveOnly,
    );
    const resolveHook = resolve;
    resolvers[compartmentName] = resolve;

    // TODO also thread powers selectively.
    const compartment = new Compartment(globals, undefined, {
      resolveHook,
      importHook,
      moduleMapHook,
      transforms,
      __shimTransforms__,
      globalLexicals,
      name: location,
    });

    freeze(compartment.globalThis);

    compartments[compartmentName] = compartment;
  }

  const compartment = compartments[entryCompartmentName];
  if (compartment === undefined) {
    throw new Error(
      `Cannot assemble compartment graph because the root compartment named ${q(
        entryCompartmentName,
      )} is missing from the compartment map`,
    );
  }

  return {
    compartment,
    compartments,
    resolvers,
  };
};

/**
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {LinkOptions} options
 */
export const assemble = (compartmentMap, options) =>
  link(compartmentMap, options).compartment;
