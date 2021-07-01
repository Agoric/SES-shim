// @ts-check
/* eslint no-shadow: "off" */

/** @typedef {import('ses').ImportHook} ImportHook */
/** @typedef {import('./types.js').ParseFn} ParseFn */
/** @typedef {import('./types.js').ArchiveReader} ArchiveReader */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').Application} Application */
/** @typedef {import('./types.js').CompartmentMapDescriptor} CompartmentMapDescriptor */
/** @typedef {import('./types.js').ExecuteFn} ExecuteFn */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */
/** @typedef {import('./types.js').HashFn} HashFn */
/** @typedef {import('./types.js').ExecuteOptions} ExecuteOptions */

import { readZip } from '@endo/zip';
import { link } from './link.js';
import { parsePreCjs } from './parse-pre-cjs.js';
import { parseJson } from './parse-json.js';
import { parsePreMjs } from './parse-pre-mjs.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';

// q as in quote for strings in error messages.
const q = JSON.stringify;

const textDecoder = new TextDecoder();

/** @type {Record<string, ParseFn>} */
const parserForLanguage = {
  'pre-cjs-json': parsePreCjs,
  'pre-mjs-json': parsePreMjs,
  json: parseJson,
};

/**
 * @callback ArchiveImportHookMaker
 * @param {string} packageLocation
 * @returns {ImportHook}
 */

/**
 * @param {ArchiveReader} archive
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {string} archiveLocation
 * @param {HashFn} [computeSha512]
 * @returns {ArchiveImportHookMaker}
 */
const makeArchiveImportHookMaker = (
  archive,
  compartments,
  archiveLocation,
  computeSha512,
) => {
  // per-assembly:
  /** @type {ArchiveImportHookMaker} */
  const makeImportHook = packageLocation => {
    // per-compartment:
    const { modules } = compartments[packageLocation];
    /** @type {ImportHook} */
    const importHook = async moduleSpecifier => {
      // per-module:
      const module = modules[moduleSpecifier];
      if (module.parser === undefined) {
        throw new Error(
          `Cannot parse module ${q(moduleSpecifier)} in package ${q(
            packageLocation,
          )} in archive ${q(archiveLocation)}`,
        );
      }
      const parse = parserForLanguage[module.parser];
      if (parse === undefined) {
        throw new Error(
          `Cannot parse ${q(module.parser)} module ${q(
            moduleSpecifier,
          )} in package ${q(packageLocation)} in archive ${q(archiveLocation)}`,
        );
      }
      const moduleLocation = `${packageLocation}/${module.location}`;
      const moduleBytes = await archive.read(moduleLocation);

      if (computeSha512 !== undefined) {
        if (module.sha512 !== undefined) {
          const sha512 = computeSha512(moduleBytes);
          if (sha512 !== module.sha512) {
            throw new Error(
              `Module ${q(module.location)} of package ${q(
                packageLocation,
              )} in archive ${q(
                archiveLocation,
              )} failed a SHA-512 integrity check`,
            );
          }
        } else {
          throw new Error(
            `Module ${q(module.location)} of package ${q(
              packageLocation,
            )} in archive ${q(
              archiveLocation,
            )} does not present a SHA-512 consistent hash as is required when instantiating an archive with a computeSha512 capability`,
          );
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const { record } = await parse(
        moduleBytes,
        moduleSpecifier,
        `file:///${moduleLocation}`,
        packageLocation,
      );
      return record;
    };
    return importHook;
  };
  return makeImportHook;
};

/**
 * @param {Uint8Array} archiveBytes
 * @param {string} [archiveLocation]
 * @param {Object} [options]
 * @param {HashFn} [options.computeSha512]
 * @returns {Promise<Application>}
 */
export const parseArchive = async (
  archiveBytes,
  archiveLocation = '<unknown>',
  options = {},
) => {
  const { computeSha512 = undefined } = options;

  const archive = await readZip(archiveBytes, archiveLocation);

  const compartmentMapBytes = await archive.read('compartment-map.json');
  const compartmentMapText = textDecoder.decode(compartmentMapBytes);
  const compartmentMap = /** @type {CompartmentMapDescriptor} */ (parseLocatedJson(
    compartmentMapText,
    'compartment-map.json',
  ));

  // TODO validate compartmentMap instead of leaning hard on the above type
  // assertion.

  let sha512;
  if (computeSha512 !== undefined) {
    sha512 = computeSha512(compartmentMapBytes);
  }

  /** @type {ExecuteFn} */
  const execute = options => {
    const {
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    } = options || {};
    const {
      compartments,
      entry: { module: moduleSpecifier },
    } = compartmentMap;
    const makeImportHook = makeArchiveImportHookMaker(
      archive,
      compartments,
      archiveLocation,
      computeSha512,
    );
    const { compartment } = link(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    });
    return compartment.import(moduleSpecifier);
  };

  return { import: execute, sha512 };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @returns {Promise<Application>}
 */
export const loadArchive = async (readPowers, archiveLocation) => {
  const { read, computeSha512 } = unpackReadPowers(readPowers);
  const archiveBytes = await read(archiveLocation);
  return parseArchive(archiveBytes, archiveLocation, { computeSha512 });
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {ExecuteOptions} options
 * @returns {Promise<Object>}
 */
export const importArchive = async (readPowers, archiveLocation, options) => {
  const archive = await loadArchive(readPowers, archiveLocation);
  return archive.import(options);
};
