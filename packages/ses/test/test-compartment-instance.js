import test from 'ava';
import 'ses/lockdown';

test('Compartment instance', t => {
  t.plan(9);

  const c = new Compartment();

  t.is(typeof c, 'object', 'typeof');
  t.truthy(c instanceof Compartment, 'instanceof');
  t.not(c.constructor, Compartment, 'function Compartment() { [native code] }');

  t.is(
    Object.getPrototypeOf(c),
    Compartment.prototype,
    'Object.getPrototypeOf()',
  );
  t.truthy(
    // eslint-disable-next-line no-prototype-builtins
    Compartment.prototype.isPrototypeOf(c),
    'Compartment.prototype.isPrototypeOf()',
  );

  t.is(c.toString(), '[object Compartment]', 'toString()');
  t.is(c[Symbol.toStringTag], undefined, '"Symbol.toStringTag" property');

  t.deepEqual(Reflect.ownKeys(c), [], 'static properties');
  t.deepEqual(
    Reflect.ownKeys(Object.getPrototypeOf(c)).sort(),
    [
      '__isKnownScopeProxy__',
      'constructor',
      'evaluate',
      'name',
      'globalThis',
      'toString',
    ].sort(),
    'prototype properties',
  );
});
