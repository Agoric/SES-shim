// This script regenerates app.agar, an archived application generated
// from the test fixtures.
// This should be done *manually*, *rarely* and *deliberately*.
// The checked-in archive exists to verify that the current archive importer
// can recognize an archive generated with a previous version.
// The archive may need to be regenerated if the test fixture and assertions
// have been changed.

/* global process */

import 'ses';
import fs from 'fs';
import crypto from 'crypto';
import { writeArchive } from '../archive.js';
import { makeNodeReadPowers, makeNodeWritePowers } from '../src/node-powers.js';

const readPowers = makeNodeReadPowers(fs, crypto);
const { write } = makeNodeWritePowers(fs);

const fixture = new URL(
  'fixtures-0/node_modules/app/main.js',
  import.meta.url,
).toString();
const archiveFixture = new URL('app.agar', import.meta.url).toString();

const mitt = err =>
  process.nextTick(() => {
    throw err;
  });

writeArchive(write, readPowers, archiveFixture, fixture, {
  dev: true,
  modules: {
    builtin: true,
  },
}).catch(mitt);
