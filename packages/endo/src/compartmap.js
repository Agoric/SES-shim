/* eslint no-shadow: 0 */

import { inferExports } from "./infer-exports.js";

const { create, keys, entries } = Object;

const decoder = new TextDecoder();

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

const resolve = (rel, abs) => new URL(rel, abs).toString();

const basename = location => {
  const { pathname } = new URL(location);
  const index = pathname.lastIndexOf("/");
  if (index < 0) {
    return pathname;
  }
  return pathname.slice(index + 1);
};

const readDescriptor = async (read, packageLocation) => {
  const descriptorPath = resolve("package.json", packageLocation);
  const descriptorBytes = await read(descriptorPath).catch(_error => undefined);
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = JSON.parse(descriptorText);
  return descriptor;
};

const readDescriptorWithMemo = async (memo, read, packageLocation) => {
  let promise = memo[packageLocation];
  if (promise !== undefined) {
    return promise;
  }
  promise = readDescriptor(read, packageLocation);
  memo[packageLocation] = promise;
  return promise;
};

// findPackage behaves as Node.js to find third-party modules by searching
// parent to ancestor directories for a `node_modules` directory that contains
// the name.
// Node.js does not actually require these to be packages, but in practice,
// these are the locations that pakcage managers drop a package so Node.js can
// find it efficiently.
const findPackage = async (readDescriptor, directory, name) => {
  for (;;) {
    const packageLocation = resolve(`node_modules/${name}/`, directory);
    // eslint-disable-next-line no-await-in-loop
    const packageDescriptor = await readDescriptor(packageLocation);
    if (packageDescriptor !== undefined) {
      return { packageLocation, packageDescriptor };
    }

    const parent = resolve("../", directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;

    const base = basename(directory);
    if (base === "node_modules") {
      directory = resolve("../", directory);
      if (parent === directory) {
        return undefined;
      }
      directory = parent;
    }
  }
};

const commonParsers = { js: "cjs", cjs: "cjs", mjs: "mjs", json: "json" };
const moduleParsers = { js: "mjs", mjs: "mjs", cjs: "cjs", json: "json" };

const inferParsers = (type, location) => {
  if (type === undefined) {
    return commonParsers;
  }
  if (type === "module") {
    return moduleParsers;
  }
  if (type === "commonjs") {
    return commonParsers;
  }
  if (type !== undefined) {
    throw new Error(
      `Cannot infer parser map for package of type ${type} at ${location}`
    );
  }
  return commonParsers;
};

// graphPackage and gatherDependency are mutually recursive functions that
// gather the metadata for a package and its transitive dependencies.
// The keys of the graph are the locations of the package descriptors.
// The metadata include a label (which is informative and not necessarily
// unique), the location of each shallow dependency, and names of the modules
// that the package exports.

const graphPackage = async (
  name = "",
  readDescriptor,
  graph,
  { packageLocation, packageDescriptor },
  tags
) => {
  if (graph[packageLocation] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }

  if (packageDescriptor.name !== name) {
    console.warn(
      `Package named ${q(name)} does not match location ${packageLocation}`
    );
  }

  const result = {};
  graph[packageLocation] = result;

  const dependencies = [];
  const children = [];
  for (const name of keys(packageDescriptor.dependencies || {})) {
    children.push(
      // Mutual recursion ahead:
      // eslint-disable-next-line no-use-before-define
      gatherDependency(
        readDescriptor,
        graph,
        dependencies,
        packageLocation,
        name,
        tags
      )
    );
  }

  const { version = "" } = packageDescriptor;
  result.label = `${name}@${version}`;
  result.dependencies = dependencies;
  result.types = {};
  result.exports = inferExports(packageDescriptor, tags, result.types);
  result.parsers = inferParsers(packageDescriptor.type, packageLocation);

  return Promise.all(children);
};

const gatherDependency = async (
  readDescriptor,
  graph,
  dependencies,
  packageLocation,
  name,
  tags
) => {
  const dependency = await findPackage(readDescriptor, packageLocation, name);
  if (dependency === undefined) {
    throw new Error(`Cannot find dependency ${name} for ${packageLocation}`);
  }
  dependencies.push(dependency.packageLocation);
  await graphPackage(name, readDescriptor, graph, dependency, tags);
};

// graphPackages returns a graph whose keys are nominally URLs, one per
// package, with values that are label: (an informative Compartment name, built
// as ${name}@${version}), dependencies: (a list of URLs), and exports: (an
// object whose keys are the thing being imported, and the values are the names
// of the matching module, relative to the containing package's root, that is,
// the URL that was used as the key of graph).
// The URLs in dependencies will all exist as other keys of graph.
const graphPackages = async (
  read,
  packageLocation,
  tags,
  mainPackageDescriptor
) => {
  const memo = create(null);
  const readDescriptor = packageLocation =>
    readDescriptorWithMemo(memo, read, packageLocation);

  if (mainPackageDescriptor !== undefined) {
    memo[packageLocation] = Promise.resolve(mainPackageDescriptor);
  }

  const packageDescriptor = await readDescriptor(packageLocation);

  tags = new Set(tags || []);
  tags.add("import");
  tags.add("endo");

  if (packageDescriptor === undefined) {
    throw new Error(
      `Cannot find package.json for application at ${packageLocation}`
    );
  }
  const graph = create(null);
  await graphPackage(
    packageDescriptor.name,
    readDescriptor,
    graph,
    {
      packageLocation,
      packageDescriptor
    },
    tags
  );
  return graph;
};

// translateGraph converts the graph returned by graph packages (above) into a
// compartment map.
const translateGraph = (mainPackagePath, graph) => {
  const compartments = {};

  // For each package, build a map of all the external modules the package can
  // import from other packages.
  // The keys of this map are the full specifiers of those modules from the
  // perspective of the importing package.
  // The values are records that name the exporting compartment and the full
  // specifier of the module from the exporting package.
  // The full map includes every exported module from every dependencey
  // package and is a complete list of every external module that the
  // corresponding compartment can import.
  for (const [
    packageLocation,
    { label, parsers, dependencies, types }
  ] of entries(graph)) {
    const modules = {};
    for (const packageLocation of dependencies) {
      const { exports } = graph[packageLocation];
      for (const [exportName, module] of entries(exports)) {
        modules[exportName] = {
          compartment: packageLocation,
          module
        };
      }
    }
    compartments[packageLocation] = {
      label,
      location: packageLocation,
      modules,
      parsers,
      types
    };
  }

  return {
    main: mainPackagePath,
    compartments
  };
};

export const compartmentMapForNodeModules = async (
  read,
  packageLocation,
  tags,
  packageDescriptor
) => {
  const graph = await graphPackages(
    read,
    packageLocation,
    tags,
    packageDescriptor
  );
  return translateGraph(packageLocation, graph);
};
