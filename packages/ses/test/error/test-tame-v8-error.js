import test from 'ava';
import 'ses/lockdown';

lockdown();

test('lockdown Error is safe', t => {
  t.is(typeof Error.captureStackTrace, 'function');
  t.is(typeof Error.stackTraceLimit, 'number');
  t.is(typeof new Error().stack, 'string');
});

test('lockdown Error in Compartment is safe', t => {
  const c = new Compartment();
  t.is(c.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.is(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.is(c.evaluate('typeof new Error().stack'), 'string');
});

test('lockdown Error in nested Compartment is safe', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.is(c.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.is(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.is(c.evaluate('typeof new Error().stack'), 'string');
});
