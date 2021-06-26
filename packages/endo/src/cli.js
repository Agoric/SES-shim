/* eslint no-shadow: [0] */
import '@agoric/babel-standalone';
import './lockdown.js';
import subprocess from 'child_process';
import {
  writeArchive,
  mapLocation,
  hashLocation,
  loadArchive,
} from '@endo/compartment-mapper';
import {
  makeNodeReadPowers,
  makeNodeWritePowers,
} from '@endo/compartment-mapper/node-powers.js';

const mitmPath = new URL('../mitm', import.meta.url).pathname;

function usage(message) {
  console.error(message);
  return 1;
}

async function noEntryUsage() {
  return usage('expected path to program');
}

async function noArchiveUsage() {
  return usage('expected path for archive');
}

async function subcommand([arg, ...rest], handlers) {
  const keys = Object.keys(handlers);
  if (arg === undefined || !keys.includes(arg)) {
    return usage(`expected one of ${keys.join(', ')}`);
  }
  return handlers[arg](rest);
}

async function parameter(args, handle, usage) {
  const [arg, ...rest] = args;
  if (arg === undefined) {
    return usage('expected an argument');
  }
  if (arg.startsWith('-')) {
    return usage(`unexpected flag: ${arg}`);
  }
  return handle(arg, rest);
}

async function run(
  args,
  { cwd, read, canonical, computeSha512, write, stdout, env },
) {
  const currentLocation = new URL(`${cwd()}/`, 'file:///');

  function locate(path) {
    return new URL(path, currentLocation);
  }

  async function map(args) {
    async function handleEntry(applicationPath, args) {
      if (args.length) {
        return usage(`unexpected arguments: ${JSON.stringify(args)}`);
      }
      const applicationLocation = locate(applicationPath);
      const compartmentMapBytes = await mapLocation(
        { read, canonical, computeSha512 },
        applicationLocation,
      );
      stdout.write(compartmentMapBytes);
      return 0;
    }
    return parameter(args, handleEntry, noEntryUsage);
  }

  async function hash(args) {
    async function handleEntry(applicationPath, args) {
      if (args.length) {
        return usage(`unexpected arguments: ${JSON.stringify(args)}`);
      }
      const applicationLocation = locate(applicationPath);
      const sha512 = await hashLocation(
        { read, canonical, computeSha512 },
        applicationLocation,
      );
      stdout.write(`${sha512}\n`);
      return 0;
    }
    return parameter(args, handleEntry, noEntryUsage);
  }

  async function hashArchive(args) {
    async function handleEntry(archivePath, args) {
      if (args.length) {
        return usage(`unexpected arguments: ${JSON.stringify(args)}`);
      }
      const archiveLocation = locate(archivePath);
      const { sha512 } = await loadArchive(
        { read, canonical, computeSha512 },
        archiveLocation,
      );
      stdout.write(`${sha512}\n`);
      return 0;
    }
    return parameter(args, handleEntry, noEntryUsage);
  }

  async function archive(args) {
    async function handleArchive(archivePath, args) {
      async function handleEntry(applicationPath, args) {
        if (args.length) {
          return usage(`unexpected arguments: ${JSON.stringify(args)}`);
        }
        const archiveLocation = locate(archivePath);
        const applicationLocation = locate(applicationPath);
        await writeArchive(write, read, archiveLocation, applicationLocation);
        return 0;
      }
      return parameter(args, handleEntry, noEntryUsage);
    }
    return parameter(args, handleArchive, noArchiveUsage);
  }

  async function exec([arg, ...args]) {
    const child = subprocess.spawn(arg, args, {
      env: { ...env, PATH: `${mitmPath}:${env.PATH}` },
      stdio: 'inherit',
    });
    return new Promise(resolve => child.on('exit', resolve));
  }

  return subcommand(args, { map, hash, hagar: hashArchive, archive, exec });
}

export async function main(process, modules) {
  const { fs, crypto } = modules;
  const { cwd, stdout, env } = process;

  const readPowers = makeNodeReadPowers(fs, crypto);
  const writePowers = makeNodeWritePowers(fs);

  try {
    process.exitCode = await run(process.argv.slice(2), {
      ...readPowers,
      ...writePowers,
      cwd,
      stdout,
      env,
    });
  } catch (error) {
    process.exitCode = usage(error.stack || error.message);
  }
}
