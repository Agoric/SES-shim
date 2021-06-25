// @ts-check
/* eslint no-shadow: 0 */

/** @typedef {import('./types.js').ArchiveOptions} ArchiveOptions */
/** @typedef {import('./types.js').ArchiveWriter} ArchiveWriter */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').ModuleDescriptor} ModuleDescriptor */
/** @typedef {import('./types.js').ParseFn} ParseFn */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */
/** @typedef {import('./types.js').HashPowers} HashPowers */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').WriteFn} WriteFn */

import { writeZip } from '@endo/zip';
import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './assemble.js';
import { makeImportHookMaker } from './import-hook.js';
import { parseJson } from './parse-json.js';
import { parseArchiveCjs } from './parse-archive-cjs.js';
import { parseArchiveMjs } from './parse-archive-mjs.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';

const textEncoder = new TextEncoder();

/** @type {Record<string, ParseFn>} */
const parserForLanguage = {
  mjs: parseArchiveMjs,
  cjs: parseArchiveCjs,
  json: parseJson,
};

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const { keys, entries, fromEntries } = Object;

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @returns {Record<string, string>} map from old to new compartment names.
 */
const renameCompartments = compartments => {
  /** @type {Record<string, string>} */
  const renames = {};
  let n = 0;
  for (const [name, compartment] of entries(compartments)) {
    const { label } = compartment;
    renames[name] = `${label}-n${n}`;
    n += 1;
  }
  return renames;
};

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {Sources} sources
 * @param {Record<string, string>} renames
 */
const translateCompartmentMap = (compartments, sources, renames) => {
  const result = {};
  for (const name of keys(compartments).sort()) {
    const compartment = compartments[name];
    const { label } = compartment;

    // rename module compartments
    /** @type {Record<string, ModuleDescriptor>} */
    const modules = {};
    const compartmentModules = compartment.modules;
    if (compartment.modules) {
      for (const name of keys(compartmentModules).sort()) {
        const module = compartmentModules[name];
        const compartment = module.compartment
          ? renames[module.compartment]
          : undefined;
        modules[name] = {
          ...module,
          compartment,
        };
      }
    }

    // integrate sources into modules
    const compartmentSources = sources[name];
    if (compartmentSources) {
      for (const name of keys(compartmentSources).sort()) {
        const source = compartmentSources[name];
        const { location, parser, exit, sha512 } = source;
        modules[name] = {
          location,
          parser,
          exit,
          sha512,
        };
      }
    }

    result[renames[name]] = {
      label,
      location: renames[name],
      modules,
      // `scopes`, `types`, and `parsers` are not necessary since every
      // loadable module is captured in `modules`.
    };
  }

  return result;
};

/**
 * @param {Sources} sources
 * @param {Record<string, string>} renames
 * @returns {Sources}
 */
const renameSources = (sources, renames) => {
  return fromEntries(
    entries(sources).map(([name, compartmentSources]) => [
      renames[name],
      compartmentSources,
    ]),
  );
};

/**
 * @param {ArchiveWriter} archive
 * @param {Sources} sources
 */
const addSourcesToArchive = async (archive, sources) => {
  for (const compartment of keys(sources).sort()) {
    const modules = sources[compartment];
    const compartmentLocation = resolveLocation(`${compartment}/`, 'file:///');
    for (const specifier of keys(modules).sort()) {
      const { bytes, location } = modules[specifier];
      if (location !== undefined) {
        const moduleLocation = resolveLocation(location, compartmentLocation);
        const path = new URL(moduleLocation).pathname.slice(1); // elide initial "/"
        if (bytes !== undefined) {
          // eslint-disable-next-line no-await-in-loop
          await archive.write(path, bytes);
        }
      }
    }
  }
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<{archiveSources: Sources, archiveCompartmentMapBytes: Uint8Array}>}
 */
const digestLocation = async (powers, moduleLocation, options) => {
  const { moduleTransforms, modules: exitModules = {}, dev = false } =
    options || {};
  const { read, computeSha512 } = unpackReadPowers(powers);
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  /** @type {Set<string>} */
  const tags = new Set();

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  const compartmentMap = await compartmentMapForNodeModules(
    powers,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
    { dev },
  );

  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;

  /** @type {Sources} */
  const sources = {};

  const makeImportHook = makeImportHookMaker(
    read,
    packageLocation,
    sources,
    compartments,
    exitModules,
    computeSha512,
  );

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment } = link(compartmentMap, {
    resolve,
    modules: exitModules,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
    computeSha512,
    archiveOnly: true,
  });
  await compartment.load(entryModuleSpecifier);

  const renames = renameCompartments(compartments);
  const archiveCompartments = translateCompartmentMap(
    compartments,
    sources,
    renames,
  );
  const archiveEntryCompartmentName = renames[entryCompartmentName];
  const archiveSources = renameSources(sources, renames);

  const archiveCompartmentMap = {
    entry: {
      compartment: archiveEntryCompartmentName,
      module: moduleSpecifier,
    },
    compartments: archiveCompartments,
  };
  const archiveCompartmentMapText = JSON.stringify(
    archiveCompartmentMap,
    null,
    2,
  );
  const archiveCompartmentMapBytes = textEncoder.encode(
    archiveCompartmentMapText,
  );

  return {
    archiveCompartmentMapBytes,
    archiveSources,
  };
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const makeArchive = async (powers, moduleLocation, options) => {
  const { archiveCompartmentMapBytes, archiveSources } = await digestLocation(
    powers,
    moduleLocation,
    options,
  );

  const archive = writeZip();
  await archive.write('compartment-map.json', archiveCompartmentMapBytes);
  await addSourcesToArchive(archive, archiveSources);

  return archive.snapshot();
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const mapLocation = async (powers, moduleLocation, options) => {
  const { archiveCompartmentMapBytes } = await digestLocation(
    powers,
    moduleLocation,
    options,
  );
  return archiveCompartmentMapBytes;
};

/**
 * @param {HashPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<string>}
 */
export const hashLocation = async (powers, moduleLocation, options) => {
  const { archiveCompartmentMapBytes } = await digestLocation(
    powers,
    moduleLocation,
    options,
  );
  const { computeSha512 } = powers;
  return computeSha512(archiveCompartmentMapBytes);
};

/**
 * @param {WriteFn} write
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 */
export const writeArchive = async (
  write,
  readPowers,
  archiveLocation,
  moduleLocation,
  options,
) => {
  const archiveBytes = await makeArchive(readPowers, moduleLocation, options);
  await write(archiveLocation, archiveBytes);
};
