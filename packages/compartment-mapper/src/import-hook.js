// @ts-check

/** @typedef {import('ses').ImportHook} ImportHook */
/** @typedef {import('ses').StaticModuleType} StaticModuleType */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').HashFn} HashFn */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').ImportHookMaker} ImportHookMaker */

import { parseExtension } from './extension.js';

// q, as in quote, for quoting strings in error messages.
const q = JSON.stringify;

const { apply } = Reflect;

/**
 * TypeScript cannot be relied upon to deal with the nuances of Readonly, so we
 * borrow the pass-through type definition of harden here.
 *
 * @type {import('ses').Harden}
 */
const freeze = Object.freeze;

const { hasOwnProperty } = Object.prototype;
/**
 * @param {Record<string, never>} haystack
 * @param {string} needle
 */
const has = (haystack, needle) => apply(hasOwnProperty, haystack, [needle]);

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

/**
 * @param {ReadFn} read
 * @param {string} baseLocation
 * @param {Sources} sources
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {Record<string, never>} exitModules
 * @param {HashFn=} computeSha512
 * @returns {ImportHookMaker}
 */
export const makeImportHookMaker = (
  read,
  baseLocation,
  sources = {},
  compartments = {},
  exitModules = {},
  computeSha512 = undefined,
) => {
  // per-assembly:
  /** @type {ImportHookMaker} */
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const packageSources = sources[packageLocation] || {};
    sources[packageLocation] = packageSources;
    const { modules = {} } = compartments[packageLocation] || {};

    /** @type {ImportHook} */
    const importHook = async moduleSpecifier => {
      // per-module:

      // In Node.js, an absolute specifier always indicates a built-in or
      // third-party dependency.
      // The `moduleMapHook` captures all third-party dependencies.
      if (moduleSpecifier !== '.' && !moduleSpecifier.startsWith('./')) {
        if (has(exitModules, moduleSpecifier)) {
          packageSources[moduleSpecifier] = {
            exit: moduleSpecifier,
          };
          // Return a place-holder.
          // Archived compartments are not executed.
          return freeze({ imports: [], exports: [], execute() {} });
        }
        throw new Error(
          `Cannot find external module ${q(
            moduleSpecifier,
          )} in package ${packageLocation}`,
        );
      }

      // Collate candidate locations for the moduleSpecifier per Node.js
      // conventions.
      const candidates = [];
      if (moduleSpecifier === '.') {
        candidates.push('./index.js');
      } else {
        candidates.push(moduleSpecifier);
        if (parseExtension(moduleSpecifier) === '') {
          candidates.push(
            `${moduleSpecifier}.js`,
            `${moduleSpecifier}/index.js`,
          );
        }
      }

      for (const candidateSpecifier of candidates) {
        // Using a specifier as a location.
        // This is not always valid.
        // But, for Node.js, when the specifier is relative and not a directory
        // name, they are usable as URL's.
        const moduleLocation = resolveLocation(
          candidateSpecifier,
          packageLocation,
        );
        // eslint-disable-next-line no-await-in-loop
        const moduleBytes = await read(moduleLocation).catch(
          _error => undefined,
        );
        if (moduleBytes !== undefined) {
          // eslint-disable-next-line no-await-in-loop
          const envelope = await parse(
            moduleBytes,
            candidateSpecifier,
            moduleLocation,
            packageLocation,
          );
          const {
            parser,
            bytes: transformedBytes,
            record: concreteRecord,
          } = envelope;

          let expectedSha512;
          if (modules[moduleSpecifier] !== undefined) {
            ({ sha512: expectedSha512 } = modules[moduleSpecifier]);
          }

          // Facilitate a redirect if the returned record has a different
          // module specifier than the requested one.
          /** @type {StaticModuleType} */
          let record;
          if (candidateSpecifier !== moduleSpecifier) {
            modules[moduleSpecifier] = {
              module: candidateSpecifier,
              compartment: packageLocation,
            };
            record = {
              record: concreteRecord,
              specifier: candidateSpecifier,
            };
          } else {
            record = concreteRecord;
          }

          let sha512;
          if (computeSha512 !== undefined) {
            sha512 = computeSha512(transformedBytes);
            if (expectedSha512 !== undefined && sha512 !== expectedSha512) {
              throw new Error(
                `Module ${q(moduleSpecifier)} in package ${q(
                  packageLocation,
                )} failed integrity check, expecting sha512 ${expectedSha512}, having actual sha512 ${sha512}`,
              );
            }
          }

          const packageRelativeLocation = moduleLocation.slice(
            packageLocation.length,
          );
          packageSources[candidateSpecifier] = {
            location: packageRelativeLocation,
            parser,
            bytes: transformedBytes,
            record,
            sha512,
          };
          return record;
        }
      }

      // TODO offer breadcrumbs in the error message, or how to construct breadcrumbs with another tool.
      throw new Error(
        `Cannot find file for internal module ${q(
          moduleSpecifier,
        )} (with candidates ${candidates
          .map(x => q(x))
          .join(', ')}) in package ${packageLocation}`,
      );
    };
    return importHook;
  };
  return makeImportHook;
};
