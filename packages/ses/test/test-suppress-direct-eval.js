import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

const opt = harden({ __rejectSomeDirectEvalExpressions__: false });

test('evade direct eval expressions in evaluate', t => {
  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const obvious = `const a = eval('evil')`;
  const whitespace = `const a = eval ('evil')`;
  const newline = `const a = eval\n('evil')`;
  const multiline = `\neval('a')\neval('b')`;

  t.notThrows(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.notThrows(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.notThrows(() => c.evaluate(wrap(newline), opt), 'newline');
  t.notThrows(() => c.evaluate(wrap(multiline), opt), 'newline');
});

test('evade direct eval expressions in Function', t => {
  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const obvious = `const a = eval('evil')`;
  const whitespace = `const a = eval ('evil')`;
  const newline = `const a = eval\n('evil')`;
  const multiline = `\neval('a')\neval('b')`;

  t.notThrows(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.notThrows(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.notThrows(() => c.evaluate(wrap(newline), opt), 'newline');
  t.notThrows(() => c.evaluate(wrap(multiline), opt), 'newline');
});
