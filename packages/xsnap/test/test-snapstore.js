/* global __dirname, __filename */
// @ts-check

import '@agoric/install-ses';
import { spawn } from 'child_process';
import { type as osType } from 'os';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';
// eslint-disable-next-line import/no-extraneous-dependencies
import tmp from 'tmp';
import { xsnap } from '../src/xsnap';
import { makeSnapstore } from '../src/snapStore';

const importModuleUrl = `file://${__filename}`;

const asset = async (...segments) =>
  fs.promises.readFile(
    path.join(importModuleUrl.replace('file:/', ''), '..', ...segments),
    'utf-8',
  );

/**
 * @param {string} name
 * @param {(request:Uint8Array) => Promise<Uint8Array>} handleCommand
 */
async function bootWorker(name, handleCommand) {
  const worker = xsnap({
    os: osType(),
    spawn,
    handleCommand,
    name,
    stdout: 'inherit',
    stderr: 'inherit',
    // debug: !!env.XSNAP_DEBUG,
  });

  const bootScript = await asset('..', 'dist', 'bundle-ses-boot.umd.js');
  await worker.evaluate(bootScript);
  return worker;
}

test('build temp file; compress to cache file', async t => {
  const pool = path.resolve(__dirname, './fixture-snap-pool/');
  await fs.promises.mkdir(pool, { recursive: true });
  const store = makeSnapstore(pool, {
    ...tmp,
    ...path,
    ...fs,
    ...fs.promises,
  });
  let keepTmp = '';
  const hash = await store.save(async fn => {
    t.falsy(fs.existsSync(fn));
    fs.writeFileSync(fn, 'abc');
    keepTmp = fn;
  });
  t.is(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    hash,
  );
  t.falsy(
    fs.existsSync(keepTmp),
    'temp file should have been deleted after withTempName',
  );
  const dest = path.resolve(pool, `${hash}.gz`);
  t.truthy(fs.existsSync(dest));
  const gz = fs.readFileSync(dest);
  t.is(gz.toString('hex'), '1f8b08000000000000034b4c4a0600c241243503000000');
});

test('bootstrap, save, compress', async t => {
  const vat = await bootWorker('ses-boot1', async m => m);
  t.teardown(() => vat.close());

  const pool = path.resolve(__dirname, './fixture-snap-pool/');
  await fs.promises.mkdir(pool, { recursive: true });

  const store = makeSnapstore(pool, {
    ...tmp,
    ...path,
    ...fs,
    ...fs.promises,
  });

  await vat.evaluate('globalThis.x = harden({a: 1})');

  /** @type {(fn: string) => number} */
  const Kb = fn => Math.round(fs.statSync(fn).size / 1024);
  /** @type {(fn: string, fullSize: number) => number} */
  const relativeSize = (fn, fullSize) =>
    Math.round((fs.statSync(fn).size / 1024 / fullSize) * 10) / 10;

  const snapSize = {
    raw: 857,
    compression: 0.1,
  };

  const h = await store.save(async snapFile => {
    await vat.snapshot(snapFile);
    t.is(snapSize.raw, Kb(snapFile), 'raw snapshots are large-ish');
  });

  const zfile = path.resolve(pool, `${h}.gz`);
  t.is(
    relativeSize(zfile, snapSize.raw),
    snapSize.compression,
    'compressed snapshots are smaller',
  );
});

test('create, save, restore, resume', async t => {
  const pool = path.resolve(__dirname, './fixture-snap-pool/');
  await fs.promises.mkdir(pool, { recursive: true });

  const store = makeSnapstore(pool, {
    ...tmp,
    ...path,
    ...fs,
    ...fs.promises,
  });

  const vat0 = await bootWorker('ses-boot2', async m => m);
  t.teardown(() => vat0.close());
  await vat0.evaluate('globalThis.x = harden({a: 1})');
  const h = await store.save(vat0.snapshot);

  const worker = await store.load(h, async snapshot => {
    const xs = xsnap({ name: 'ses-resume', snapshot, os: osType(), spawn });
    await xs.evaluate('0');
    return xs;
  });
  t.teardown(() => worker.close());
  await worker.evaluate('x.a');
  t.pass();
});

// see https://github.com/Agoric/agoric-sdk/issues/2776
test.failing('xs snapshots should be deterministic', t => {
  const h = 'abc';
  t.is('66244b4bfe92ae9138d24a9b50b492d231f6a346db0cf63543d200860b423724', h);
});
