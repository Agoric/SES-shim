
// alas '-r esm' vs (native) ESM means we can't import real modules if we
// start with '-r esm', so import the built distfile. Don't forget to rebuild
// this file (cd packages/ses && yarn build) after any changes to the SES
// source files.
//import { lockdown } from '../packages/ses/src/main.js';
import { lockdown } from '../packages/ses/dist/ses.cjs';

lockdown();
// We are now in the "Start Compartment". Our global has all the same
// powerful things it had before, but the primordials have changed to make
// them safe to use in the arguments of API calls we make into more limited
// compartments. 'Compartment' and 'harden' are now present in our global
// scope.
