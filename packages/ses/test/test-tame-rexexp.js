import test from 'ava';
import 'ses/lockdown';

const allowedProperties = new Set([
  'length',
  'name',
  'prototype',
  Symbol.species,
]);

lockdown();

test('lockdown RegExp from Compartment is powerless', t => {
  const c = new Compartment();

  const properties = c.evaluate('Reflect.ownKeys(RegExp)');
  for (const prop of properties) {
    t.truthy(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }
});

test('lockdown RegExp from nested Compartment powerless', t => {
  const c = new Compartment().evaluate('new Compartment()');

  const properties = c.evaluate('Reflect.ownKeys(RegExp)');
  for (const prop of properties) {
    t.truthy(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }
});
