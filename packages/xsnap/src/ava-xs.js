#!/usr/bin/env node

// We use cjs / require style because -r esm doesn't fit on the #! line.
// https://unix.stackexchange.com/questions/399690/multiple-arguments-in-shebang

/* global require, module */
// @ts-check
// eslint-disable-next-line no-global-assign
require = require('esm')(module);
require('@agoric/install-ses');
const process = require('process');
const { spawn } = require('child_process');
const { type: osType } = require('os');
const { promises: fsp } = require('fs');
const path = require('path');
const glob = require('glob');
const bundleSource = require('@agoric/bundle-source').default;

const { main, makeBundleResolve } = require('./avaXS');

Promise.resolve()
  .then(_ =>
    main(process.argv.slice(2), {
      bundleSource,
      spawn,
      osType,
      readFile: fsp.readFile,
      resolve: makeBundleResolve(path),
      dirname: path.dirname,
      basename: path.basename,
      glob,
    }),
  )
  .then(status => {
    process.exit(status);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
