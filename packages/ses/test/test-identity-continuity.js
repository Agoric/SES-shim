import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

// Array is a shared global
test('identity Array', t => {
  t.plan(7);

  const c1 = new Compartment();
  const c2 = new c1.globalThis.Compartment();

  t.is(c1.evaluate('Array'), Array);
  t.is(c1.evaluate('Array'), c1.evaluate('Array'));
  t.is(c1.evaluate('Array'), c2.evaluate('Array'));
  t.is(c1.evaluate('Array'), c2.evaluate('(0,eval)("Array")'));

  const a2 = c2.evaluate('[]');
  t.truthy(a2 instanceof Array);
  t.truthy(a2 instanceof c1.globalThis.Array);
  t.truthy(a2 instanceof c2.globalThis.Array);
});

// Compartment is a shared global
test('identity Compartment', t => {
  t.plan(8);

  const c1 = new Compartment();
  const c2 = new c1.globalThis.Compartment();

  t.not(c1.evaluate('Compartment'), Compartment);
  t.is(c1.evaluate('Compartment'), c1.evaluate('Compartment'));
  t.not(c1.evaluate('Compartment'), c2.evaluate('Compartment'));
  t.is(c1.evaluate('Compartment'), c1.evaluate('(0,eval)("Compartment")'));
  t.not(c1.evaluate('Compartment'), c2.evaluate('(0,eval)("Compartment")'));

  const e3 = c2.evaluate('(new Compartment())');
  t.truthy(e3 instanceof Compartment);
  t.truthy(e3 instanceof c1.globalThis.Compartment);
  t.truthy(e3 instanceof c2.globalThis.Compartment);
});

// eval is evaluator-specific
test('identity eval', t => {
  t.plan(8);

  const c1 = new Compartment();
  const c2 = new c1.globalThis.Compartment();

  t.truthy(c2.evaluate('eval') instanceof Function);
  t.truthy(c2.evaluate('eval') instanceof Object);
  t.truthy(c2.evaluate('eval instanceof Function'));
  t.truthy(c2.evaluate('eval instanceof Object'));
  t.truthy(c2.evaluate('eval') instanceof c1.evaluate('Function'));
  t.truthy(c2.evaluate('eval') instanceof c1.evaluate('Object'));

  // eslint-disable-next-line no-eval
  t.not(c2.evaluate('eval'), eval);
  t.not(c2.evaluate('eval'), c1.evaluate('eval'));
});

// Function is evaluator-specific
test('identity Function', t => {
  t.plan(11);

  const c1 = new Compartment();
  const c2 = new c1.globalThis.Compartment();
  const c3 = new c2.globalThis.Compartment();

  t.truthy(c2.evaluate('Function') instanceof Function);
  t.truthy(c2.evaluate('Function') instanceof Object);
  t.truthy(c2.evaluate('Function instanceof Function'));
  t.truthy(c2.evaluate('Function instanceof Object'));
  t.truthy(c2.evaluate('Function') instanceof c1.evaluate('Function'));
  t.truthy(c2.evaluate('Function') instanceof c1.evaluate('Object'));

  t.not(c2.evaluate('Function'), Function);
  t.not(c2.evaluate('Function'), c1.evaluate('Function'));

  const f2 = c2.evaluate('function x(a, b) { return a+b; }; x');
  t.truthy(f2 instanceof c1.globalThis.Function);
  t.truthy(f2 instanceof c2.globalThis.Function);
  t.truthy(f2 instanceof c3.globalThis.Function);
});
