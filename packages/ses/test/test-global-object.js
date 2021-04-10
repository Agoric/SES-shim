import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';
import { initGlobalObject } from '../src/global-object.js';
import { sharedGlobalPropertyNames } from '../src/whitelist.js';
import {
  makeCompartmentConstructor,
  CompartmentPrototype,
} from '../src/compartment-shim.js';

test('globalObject', t => {
  const intrinsics = {
    Date: globalThis.Date,
    // eslint-disable-next-line no-eval
    eval: globalThis.eval,
    Function: globalThis.Function,
    globalThis: {},
  };

  const globalObject = {};
  initGlobalObject(
    globalObject,
    intrinsics,
    sharedGlobalPropertyNames,
    makeCompartmentConstructor,
    CompartmentPrototype,
    {
      nativeBrander(_) {},
    },
  );

  t.truthy(globalObject instanceof Object);
  t.is(Object.getPrototypeOf(globalObject), Object.prototype);
  t.truthy(!Object.isFrozen(globalObject));
  t.not(globalObject, globalThis);
  t.is(globalObject.globalThis, globalObject);

  t.is(Object.getOwnPropertyNames(globalObject).length, 7);

  const descs = Object.getOwnPropertyDescriptors(globalObject);
  for (const [name, desc] of Object.entries(descs)) {
    if (name === 'Infinity') {
      // eslint-disable-next-line no-restricted-globals
      t.truthy(!isFinite(desc.value), `${name} should be Infinity`);
    } else if (name === 'NaN') {
      // eslint-disable-next-line no-restricted-globals
      t.truthy(isNaN(desc.value), `${name} should be NaN`);
    } else if (name === 'undefined') {
      t.is(desc.value, undefined, `${name} should be undefined`);
    } else if (['eval', 'Function', 'globalThis'].includes(name)) {
      t.not(
        desc.value,
        intrinsics[name],
        `${name} should not be the intrinsics ${name}`,
      );
      t.not(
        desc.value,
        globalThis[name],
        `${name} should not be the global ${name}`,
      );
    }

    if (['Infinity', 'NaN', 'undefined'].includes(name)) {
      t.falsy(desc.configurable, `${name} should not be configurable`);
      t.falsy(desc.writable, `${name} should not be writable`);
      t.falsy(desc.enumerable, `${name} should not be enumerable`);
    } else {
      t.truthy(desc.configurable, `${name} should be configurable`);
      t.truthy(desc.writable, `${name} should be writable`);
      t.falsy(desc.enumerable, `${name} should not be enumerable`);
    }
  }
});
