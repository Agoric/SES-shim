import test from 'ava';
import 'ses/lockdown';

lockdown();

test('indirect eval is possible', t => {
  const c = new Compartment();
  t.is(c.evaluate("(1,eval)('123')"), 123, 'indirect eval succeeds');
});

test('SharedArrayBuffer should be removed because it is not on the whitelist', t => {
  const c = new Compartment();
  // we seem to manage both of these for properties that never existed
  // in the first place
  t.throws(() => c.evaluate('XYZ'), { instanceOf: ReferenceError });
  t.is(c.evaluate('typeof XYZ'), 'undefined');
  const have = typeof SharedArrayBuffer !== 'undefined';
  if (have) {
    // we ideally want both of these, but the realms magic can only
    // manage one at a time (for properties that previously existed but
    // which were removed by the whitelist check)
    // t.throws(() => c.evaluate('SharedArrayBuffer'), ReferenceError);
    t.is(c.evaluate('typeof SharedArrayBuffer'), 'undefined');
  }
});

test('remove RegExp.prototype.compile', t => {
  const c = new Compartment();
  t.is(
    c.evaluate('const r = /./; typeof r.compile'),
    'undefined',
    'should remove RegExp.prototype.compile',
  );
});

test('remove RegExp.$1', t => {
  const c = new Compartment();
  t.is(typeof c.evaluate('RegExp.$1'), 'undefined', 'should remove RegExp.$1');
});

test('remove Intl', t => {
  const c = new Compartment();
  // Always removed, not an intrinsic.
  t.is(c.evaluate('typeof Intl'), 'undefined');
});

test('do not remove Object.prototype.__proto__', t => {
  const c = new Compartment();
  t.is(
    c.evaluate('({}).__proto__'),
    c.globalThis.Object.prototype,
    '({}).__proto__ is accessible',
  );
  t.is(
    c.evaluate('[].__proto__'),
    c.globalThis.Array.prototype,
    '[].__proto__ is accessible',
  );
  t.is(
    c.evaluate(`\
function X () {};
X.prototype.__proto__ = Array.prototype;
const x=new X();
x.slice;
`),
    c.globalThis.Array.prototype.slice,
    'prototype __proto__ inheritance works',
  );
});
