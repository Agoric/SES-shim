import '../index.js';
import './lockdown-safe.js';
import test from 'ava';

test('backslash-u-varname', t => {
  const c = new Compartment();
  t.is(
    c.evaluate(`
const \\u0069 = 88;
i;`),
    88,
  );
});

test('backslash-u-keyward-as-var-fails', t => {
  const c = new Compartment();
  t.throws(
    () => {
      c.evaluate(`const \\u0069f = 55;`);
    },
    { instanceOf: SyntaxError },
  );
});

test('backslash-u-keyward-fails', t => {
  const c = new Compartment();
  t.is(c.evaluate('if(true){99}'), 99);
  t.throws(
    () => {
      c.evaluate(`u0069f(true){77}`);
    },
    { instanceOf: SyntaxError },
  );
});
