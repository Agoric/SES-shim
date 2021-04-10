import test from 'ava';
import * as childProcess from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { xsnap } from '../src/xsnap';

const importModuleUrl = `file://${__filename}`;

const asset = async (...segments) =>
  fs.promises.readFile(
    path.join(importModuleUrl.replace('file:/', ''), '..', ...segments),
    'utf-8',
  );

const decoder = new TextDecoder();

const xsnapOptions = {
  spawn: childProcess.spawn,
  os: os.type(),
};

function options() {
  const messages = [];
  async function handleCommand(message) {
    messages.push(decoder.decode(message));
    return new Uint8Array();
  }
  return { ...xsnapOptions, handleCommand, messages };
}

test('bootstrap to SES lockdown', async t => {
  const bootScript = await asset('..', 'dist', 'bundle-ses-boot.umd.js');
  const opts = options();
  const name = 'SES lockdown worker';
  const vat = xsnap({ ...opts, name });
  await vat.evaluate(bootScript);
  t.deepEqual([], opts.messages);

  await vat.evaluate(`
    const encoder = new TextEncoder();
    globalThis.send = msg => issueCommand(encoder.encode(JSON.stringify(msg)).buffer);
  `);
  await vat.evaluate(`
    send([ typeof harden, typeof Compartment, typeof HandledPromise ]);
  `);
  await vat.close();
  t.deepEqual(['["function","function","function"]'], opts.messages);
});

test('child compartment cannot access start powers', async t => {
  const bootScript = await asset('..', 'dist', 'bundle-ses-boot.umd.js');
  const opts = options();
  const vat = xsnap(opts);
  await vat.evaluate(bootScript);

  const script = await asset('escapeCompartment.js');
  await vat.evaluate(script);
  await vat.close();

  t.deepEqual(opts.messages, ['err was TypeError: Not available']);
});

test('SES deep stacks work on xsnap', async t => {
  const bootScript = await asset('..', 'dist', 'bundle-ses-boot.umd.js');
  const opts = options();
  const vat = xsnap(opts);
  await vat.evaluate(bootScript);
  await vat.evaluate(`
    const encoder = new TextEncoder();
    const send = msg => issueCommand(encoder.encode(JSON.stringify(msg)).buffer);

    const err = Error('msg');
    send('stack' in err);
    const msg = getStackString(err);
    send(msg);
  `);
  const [stackInErr, msg] = opts.messages.map(JSON.parse);
  t.assert(!stackInErr);
  t.is(typeof msg, 'string');
  t.assert(msg.length >= 1);
});
