User-visible changes to the compartment mapper:

# Next release

- Adds a support for consistent hashing (SHA-512) of applications:
  - `nodeReadPowers(fs, crypto)` produces the necessary capabilities for
    hashing, when passed the Node.js `crypto` module.
  - `writeArchive` and `makeArchive` accept a `computeSha512` capability and
    use it to populate the `compartment-map.json` included within the archive
    with the SHA-512 of every module in the archive.  This ensures that the
    hash of `compartment-map.json` in a pair of archives is consistent only if
    every file is consistent.
  - `importArchive`, `loadArchive`, and `parseArchive` all optionally accept a
    `computeSha512` capability, use it to verify the integrity of the archive
    and provide the hash of the contained `compartment-map.json` so the caller
    can verify the archive against a known hash.  `importArchive` and
    `loadArchive` receive the hash function as a read power.  `parseArchive`
    receives the hash function as an option.
  - `hashLocation` produces the hash of an application off the filesystem,
    suitable for validating that an archive with the same hash was generated
    from identical files.
- Also adds `mapLocation`, which produces the compartment map that _would_ be
  in the corresponding archive for a package.
- Ensures that IO errors on Node.js include a meaningful stack trace.

# 0.4.1 (2021-16-19)

- Fixes internal type references.

# 0.4.0 (2021-06-16)

- *BREAKING*: When constructing an archive, the creator must provide a record
  of exit modules. Unlike import functions, the values of the exit module
  record are ignored.
  Any omitted exit module will cause an exception during archive creation.
- Adds a `dev` option to archive and import workflows to include the
  `devDependencies` of the entry package (but not other packages).
- Fixes a missing file in the published assets for
  `@endo/compartment-mapper/node-powers.js`.

# 0.3.2 (2021-06-14)

- Follows Node.js packages through symbolic links, but requires an additional
  read power to do this. Some functions now accept `{ read, canonical }` powers
  in places only `read` was accepted previously, specifically
  `compartmentMapFromNodeModules`, `makeArchive`, `writeArchive`, and
  `loadLocation`.
- Adds an `"@endo/compartment-mapper/node-powers.js"` entry point utility
  module that exports `makeNodeReadPowers` and `makeNodeWritePowers` that adapt
  the Node.js `fs` module to the promise and URL oriented interfaces expected
  by compartment mapper functions.

# 0.3.0 (2021-06-01)

- Reenables CommonJS support with a fast lexer and without a dependency on
  Babel.
- The Compartment Mapper now produces archives containing SES-shim
  pre-compiled StaticModuleRecords for ESM instead of the source.
- The Compartment Mapper can now produce bundles of concatenated modules but
  without Compartments and only supporting ESM but not supporting live
  bindings.
- Adds entrypoint modules `import.js`, `archive.js`, and `import-archive.js`
  to capture narrower dependency subgraphs.
- *BREAKING*: Removes CommonJS and UMD downgrade compatibility.
  Supporting both Node.js ESM and the `node -r esm` shim requires the main
  entry point module to be ESM regardless of environment.
  UMD and CommonJS facets will likely return after all dependees have migrated
  away from depending upon the `esm` JavaScript module emulator.
- *BREAKING*: Archives created for the previous version will no longer work.
  The `importArchive` feature only supports pre-compiled ESM and CJS.
- *BREAKING*: This release parallels a breaking upgrade for SES to version
  0.13. This entails the removal of `StaticModuleRecord` from SES, and the
  removal of the `ses/lockdown` light layering (there is no heavy layer to
  distinguish as the weight has shifted to the `@endo/static-module-record`
  package).
- Archives are now deterministic.

# 0.2.4 (2021-03-30)

- Applications may now have asynchronous module transforms, per language.
  When applied to archive creation, the transformed sources appear in the
  archive.
- Every compartment's `globalThis` is frozen.

# 0.2.3 (2020-11-05)

- Embellishes all calls to methods named `import` to work around SES-shim
  `Compartment` censoring for dynamic import, using properties instead
  of parentheses, since the syntax transformation tools at hand do not
  currently simplify these.

# 0.2.2 (2020-11-05)

- Embellishes all calls to methods named `import` to work around SES-shim
  `Compartment` censoring for dynamic import.

# 0.2.1 (2020-11-04)

- Changes all private fields to internal weak maps to Compartment Mapper
  can be read by parsers that do not yet support private fields.

# 0.2.0 (2020-11-03)

- *BREAKING*: All `import` methods now take an options bag that may contain
  `globals` and `modules` options if present, instead of these as positional
  arguments.
- *BREAKING*: Support for CommonJS is temporarily withdrawn to relieve a
  dependency on Node.js built-ins entrained by Babel that in turn make
  Compartment Mapper unusable with a combination of `-r esm` and Rollup.
  CommonJS support should be restored with an alternate implementation in
  a future version.
- The `import` options bag now also accepts `globalLexicals`, `transforms`, and
  `__shimTransforms__`, passing these without alteration to each `Compartment`.
- The `import` options bag now also accepts a `Compartment` constructor, to use
  instead of the one assumed to be present globally.

#  0.1.0 (2020-09-21)

- This initial relase supports importing, archiving, and importing archives
  with the same authorities delegated to every compartment in an application.
  Future releases will support the attenuation of authority per-compartment,
  broaden support for Node.js module conventions, address the issue
  of shimming, and orchestrate SES lockdown.
