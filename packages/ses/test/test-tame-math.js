import test from 'ava';
import 'ses/lockdown';

lockdown();

test('lockdown start Math is powerful', t => {
  t.is(typeof Math.random, 'function');
  const random = Math.random();
  t.is(typeof random, 'number');
  t.falsy(Number.isNaN(random));
});

test('lockdown Math from Compartment is powerless', t => {
  const c = new Compartment();
  t.is(c.evaluate('typeof Math.random'), 'undefined');
});

test('lockdown Math from nested Compartment is powerless', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.is(c.evaluate('typeof Math.random'), 'undefined');
});
