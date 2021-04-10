import test from 'ava';
import { keys, seal, isExtensible } from '../src/commons.js';
import { deferExports } from '../src/module-proxy.js';

test('proxied exports keys are readable', t => {
  t.plan(2);
  const { proxiedExports, exportsProxy, activate } = deferExports();
  t.throws(
    () => {
      keys(exportsProxy);
    },
    { message: /^Cannot enumerate keys/ },
    'keys fails for inactive module',
  );
  proxiedExports.a = 10;
  proxiedExports.b = 20;
  activate();
  t.deepEqual(keys(exportsProxy), ['a', 'b']);
});

test('proxied exports is not extensible', t => {
  t.plan(1);
  const { proxiedExports, exportsProxy, activate } = deferExports();
  seal(proxiedExports);
  activate();
  t.truthy(
    !isExtensible(exportsProxy),
    'sealed module means sealed proxied exports',
  );
});

test('proxied exports has own keys', t => {
  t.plan(3);
  const { proxiedExports, exportsProxy, activate } = deferExports();
  t.throws(
    () => {
      'irrelevant' in exportsProxy;
    },
    { message: /^Cannot check property/ },
    'module must throw error for owns trap before it begins executing',
  );
  proxiedExports.present = 'here';
  activate(seal());
  t.truthy('present' in exportsProxy, 'module has key');
  t.truthy(!('absent' in exportsProxy), 'module does not have key');
});

test('proxied exports set/get round-trip', t => {
  t.plan(3);
  const { proxiedExports, exportsProxy, activate } = deferExports();
  t.throws(
    () => {
      exportsProxy.ceciNEstPasUnePipe;
    },
    { message: /^Cannot get property/ },
    'properties must not be known until execution begins',
  );
  t.throws(
    () => {
      exportsProxy.ceciNEstPasUnePipe = 'pipe';
    },
    { message: /^Cannot set property/ },
    'properties must not be mutable',
  );

  proxiedExports.ceciNEstPasUnePipe = 'pipe';
  seal(proxiedExports);
  activate();

  t.throws(
    () => {
      exportsProxy.ceciNEstPasUnePipe = 'not a pipe';
    },
    { message: /^Cannot set property/ },
    'properties must not be mutable, even after activation',
  );
});

test('proxied exports delete', t => {
  t.plan(2);
  const { exportsProxy, activate } = deferExports();
  t.throws(
    () => {
      delete exportsProxy.existentialDread;
    },
    { message: /^Cannot delete property/ },
    'deleting before existing throws',
  );
  activate();
  t.throws(
    () => {
      delete exportsProxy.cogitoErgoSum;
    },
    { message: /^Cannot delete property/ },
    'deleting from a sealed proxy',
  );
});

test('proxied exports prototype', t => {
  t.plan(1);
  const { exportsProxy } = deferExports();
  t.is(
    Object.getPrototypeOf(exportsProxy),
    null,
    'prototype of module exports namespace must be null',
  );
});

test('proxied exports is not a function', t => {
  t.plan(1);
  const { exportsProxy } = deferExports();
  t.throws(
    () => {
      exportsProxy();
    },
    { message: /is not a function$/ },
    'proxied exports must not be callable',
  );
});

test('proxied exports is not a constructor', t => {
  t.plan(1);
  const { exportsProxy } = deferExports();
  t.throws(
    () => {
      const Constructor = exportsProxy;
      return new Constructor();
    },
    { message: /constructor/ },
    'proxied exports must not be constructable',
  );
});
