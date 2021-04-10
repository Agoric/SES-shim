import test from 'ava';
import 'ses/lockdown';

lockdown();

test('Compartment class', t => {
  t.plan(8);

  t.is(typeof Compartment, 'function', 'typeof');
  t.truthy(Compartment instanceof Function, 'instanceof');
  t.is(Compartment.name, 'Compartment', 'Constructor "name" property');

  t.is(Compartment.toString(), 'function Compartment() { [native code] }');
  t.is(
    Compartment[Symbol.toStringTag],
    undefined,
    '"Symbol.toStringTag" property',
  );

  t.deepEqual(
    Reflect.ownKeys(Compartment).sort(),
    ['length', 'name', 'prototype'].sort(),
    'static properties',
  );

  t.throws(
    () => Compartment(),
    { instanceOf: TypeError },
    'Compartment must not support the [[Call]] method',
  );
  t.notThrows(
    () => new Compartment(),
    'Compartment must support the [[Construct]] method',
  );
});
