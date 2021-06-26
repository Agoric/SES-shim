// @ts-check
/// <reference types="ses"/>

export const moduleJSDocTypes = true;

/** @typedef {import('ses').FinalStaticModuleType} FinalStaticModuleType */
/** @typedef {import('ses').ImportHook} ImportHook */
/** @typedef {import('ses').StaticModuleType} StaticModuleType */
/** @typedef {import('ses').Transform} Transform */

// /////////////////////////////////////////////////////////////////////////////

// The schema of a compartment map JSON file:

/**
 * A compartment map describes how to construct an application as a graph of
 * Compartments, each corresponding to Node.js style packaged modules.
 *
 * @typedef {Object} CompartmentMapDescriptor
 * @property {Array<string>} tags
 * @property {EntryDescriptor} entry
 * @property {Record<string, CompartmentDescriptor>} compartments
 */

/**
 * The entry descriptor of a compartment map denotes the root module of an
 * application and the compartment that contains it.
 *
 * @typedef {Object} EntryDescriptor
 * @property {string} compartment
 * @property {string} module
 */

/**
 * A compartment descriptor corresponds to a single Compartment
 * of an assembled Application and describes how to construct
 * one for a given library or application package.json.
 *
 * @typedef {Object} CompartmentDescriptor
 * @property {string} label
 * @property {string} location
 * @property {Record<string, ModuleDescriptor>} modules
 * @property {Record<string, ScopeDescriptor>} scopes
 * @property {Record<string, Language>} parsers - language for extension
 * @property {Record<string, Language>} types - language for module specifier
 */

/**
 * For every module explicitly mentioned in an `exports` field of a
 * package.json, there is a corresponding module descriptor.
 *
 * @typedef {Object} ModuleDescriptor
 * @property {string=} [compartment]
 * @property {string} [module]
 * @property {string} [location]
 * @property {Language} [parser]
 * @property {string} [sha512] in base 16, hex
 * @property {string} [exit]
 */

/**
 * Scope descriptors link all names under a prefix to modules in another
 * compartment, like a wildcard.
 * These are employed to link any module not explicitly mentioned
 * in a package.json file, when that package.json file does not have
 * an explicit `exports` map.
 *
 * @typedef {Object} ScopeDescriptor
 * @property {string} compartment
 * @property {string} [module]
 */

/**
 * @typedef {'mjs' | 'cjs' | 'json' | 'pre-mjs-json' | 'pre-cjs-json'} Language
 */

// /////////////////////////////////////////////////////////////////////////////

// IO capabilities and archives:

/**
 * @typedef {Object} ArchiveWriter
 * @property {WriteFn} write
 * @property {SnapshotFn} snapshot
 */

/**
 * @callback WriteFn
 * @param {string} location
 * @param {Uint8Array} bytes
 * @returns {Promise<void>}
 */

/**
 * @typedef {Object} ArchiveReader
 * @property {ReadFn} read
 */

/**
 * @callback ReadFn
 * @param {string} location
 * @returns {Promise<Uint8Array>} bytes
 */

/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path.
 * Must return the given logical location if the real location does not exist.
 *
 * @callback CanonicalFn
 * @param {string} location
 * @returns {Promise<string>} canonical location
 */

/**
 * @callback HashFn
 * @param {Uint8Array} bytes
 * @returns {string} hash
 */

/**
 * @typedef {Object} Application
 * @property {ExecuteFn} import
 * @property {string} [sha512]
 */

/**
 * @callback ExecuteFn
 * @param {ExecuteOptions} [options]
 * @returns {Promise<Object>}
 */

/**
 * @callback SnapshotFn
 * @returns {Promise<Uint8Array>}
 */

/**
 * @typedef {Object} ReadPowers
 * @property {ReadFn} read
 * @property {CanonicalFn} canonical
 * @property {HashFn} [computeSha512]
 */

/**
 * @typedef {Object} HashPowers
 * @property {ReadFn} read
 * @property {CanonicalFn} canonical
 * @property {HashFn} computeSha512
 */

/**
 * @typedef {Object} WritePowers
 * @property {WriteFn} write
 */

// /////////////////////////////////////////////////////////////////////////////

// Shared machinery for assembling applications:

/**
 * @callback ResolveHook
 * @param {string} importSpecifier
 * @param {string} referrerSpecifier
 * @returns {string} moduleSpecifier
 */

/**
 * @callback ImportHookMaker
 * @param {string} packageLocation
 * @param {ParseFn} parse
 * @param {Record<string, Object>} exitModules
 * @returns {ImportHook}
 */

/**
 * @callback ParseFn
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @returns {Promise<{
 *   bytes: Uint8Array,
 *   parser: Language,
 *   record: FinalStaticModuleType,
 * }>}
 */

/**
 * @typedef {Object} ExecuteOptions
 * @property {Object} [globals]
 * @property {Object} [globalLexicals]
 * @property {Array<Transform>} [transforms]
 * @property {Array<Transform>} [__shimTransforms__]
 * @property {Record<string, Object>} [modules]
 * @property {typeof Compartment.prototype.constructor} [Compartment]
 */

/**
 * @typedef {Record<string, ParseFn>} ParserForLanguage
 */

/**
 * @typedef {ExecuteOptions & Object} LinkOptions
 * @property {AssembleImportHook} makeImportHook
 * @property {ParserForLanguage} parserForLanguage
 * @property {ModuleTransforms} [moduleTransforms]
 * @property {boolean} [archiveOnly]
 */

/**
 * @typedef {Record<string, ModuleTransform>} ModuleTransforms
 */

/**
 * @callback ModuleTransform
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @returns {Promise<{bytes: Uint8Array, parser: Language}>}
 */

// /////////////////////////////////////////////////////////////////////////////

// Communicating source files from an archive snapshot, from archive.js to
// import-hook.js:

/**
 * @typedef {Record<string, CompartmentSources>} Sources
 */

/**
 * @typedef {Record<string, ModuleSource>} CompartmentSources
 */

/**
 * @typedef {Object} ModuleSource
 * @property {string} [location]
 * @property {Uint8Array} [bytes]
 * @property {string} [sha512] in base16, hex
 * @property {Language} [parser]
 * @property {string} [exit]
 * @property {StaticModuleType} [record]
 */

/**
 * @typedef {Object} Artifact
 * @property {Uint8Array} bytes
 * @property {Language} parser
 */

/**
 * @typedef {Object} ArchiveOptions
 * @property {ModuleTransforms} [moduleTransforms]
 * @property {Record<string, never>} [modules]
 * @property {boolean} [dev]
 */
