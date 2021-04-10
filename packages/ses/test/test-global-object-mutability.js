import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

test('globalObject properties mutable', t => {
  t.plan(3);

  const c = new Compartment();

  c.evaluate('Date = function() { return "bogus" }');
  t.is(c.evaluate('Date()'), 'bogus');

  c.evaluate('Compartment = function(opts) { this.extra = "extra" }');
  t.is(c.evaluate('(new Compartment({})).extra'), 'extra');

  c.evaluate('Function = function() { this.extra = "extra" }');
  t.is(c.evaluate('new Function().extra'), 'extra');
});

test('globalObject properties immutable', t => {
  t.plan(6);

  const c = new Compartment();

  t.throws(() => c.evaluate('Infinity = 4'), { instanceOf: TypeError }); // strict mode
  t.is(c.evaluate('Infinity'), Infinity);

  t.throws(() => c.evaluate('NaN = 4'), { instanceOf: TypeError });
  t.not(c.evaluate('NaN'), 4);

  t.throws(() => c.evaluate('undefined = 4'), { instanceOf: TypeError });
  t.is(c.evaluate('undefined'), undefined);
});
