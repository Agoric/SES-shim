// @ts-check
/* eslint no-shadow: "off" */

/** @typedef {import('./types.js').Application} Application */
/** @typedef {import('./types.js').ArchiveOptions} ArchiveOptions */
/** @typedef {import('./types.js').ExecuteFn} ExecuteFn */
/** @typedef {import('./types.js').ExecuteOptions} ExecuteOptions */
/** @typedef {import('./types.js').ParseFn} ParseFn */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */

import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import { makeImportHookMaker } from './import-hook.js';
import { parseJson } from './parse-json.js';
import { parseCjs } from './parse-cjs.js';
import { parseMjs } from './parse-mjs.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';

/** @type {Record<string, ParseFn>} */
export const parserForLanguage = {
  mjs: parseMjs,
  cjs: parseCjs,
  json: parseJson,
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadLocation = async (readPowers, moduleLocation, options) => {
  const { moduleTransforms = {}, dev = false } = options || {};

  const { read } = unpackReadPowers(readPowers);

  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  /** @type {Set<string>} */
  const tags = new Set();
  const compartmentMap = await compartmentMapForNodeModules(
    readPowers,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
    { dev },
  );

  /** @type {ExecuteFn} */
  const execute = async (options = {}) => {
    const {
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    } = options;
    const makeImportHook = makeImportHookMaker(read, packageLocation);
    const { compartment } = link(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      globals,
      globalLexicals,
      modules,
      transforms,
      moduleTransforms,
      __shimTransforms__,
      Compartment,
    });
    return compartment.import(moduleSpecifier);
  };

  return { import: execute };
};

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {ExecuteOptions & ArchiveOptions} [options]
 * @returns {Promise<Object>} the object of the imported modules exported
 * names.
 */
export const importLocation = async (read, moduleLocation, options = {}) => {
  const application = await loadLocation(read, moduleLocation, options);
  return application.import(options);
};
