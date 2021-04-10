import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

test('globalObject properties', t => {
  t.plan(10);

  const c = new Compartment();

  t.not(c.globalThis, this);
  t.not(c.globalThis, globalThis);
  t.is(c.globalThis.globalThis, c.globalThis);

  t.is(c.globalThis.Array, Array);
  t.is(c.globalThis.Array, globalThis.Array);

  // eslint-disable-next-line no-eval
  t.not(c.globalThis.eval, eval);
  // eslint-disable-next-line no-eval
  t.not(c.globalThis.eval, globalThis.eval);

  t.not(c.globalThis.Function, Function);
  t.not(c.globalThis.Function, globalThis.Function);

  t.not(c.globalThis.Compartment, Compartment);
});
