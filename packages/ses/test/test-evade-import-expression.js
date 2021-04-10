import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

const opt = harden({ __evadeImportExpressionTest__: true });

test('evade import expressions in evaluate', t => {
  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const obvious = `const a = import('evil')`;
  const whitespace = `const a = import ('evil')`;
  const comment = `const a = import/*hah*/('evil')`;
  const doubleSlashComment = `const a = import // hah\n('evil')`;
  const newline = `const a = import\n('evil')`;
  const multiline = `\nimport('a')\nimport('b')`;

  t.notThrows(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.notThrows(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.notThrows(() => c.evaluate(wrap(comment), opt), 'comment');
  t.notThrows(
    () => c.evaluate(wrap(doubleSlashComment), opt),
    'doubleSlashComment',
  );
  t.notThrows(() => c.evaluate(wrap(newline), opt), 'newline');
  t.notThrows(() => c.evaluate(wrap(multiline), opt), 'multiline');
});

test('evade import expressions in Function', t => {
  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const obvious = `const a = import('evil')`;
  const whitespace = `const a = import ('evil')`;
  const comment = `const a = import/*hah*/('evil')`;
  const doubleSlashComment = `const a = import // hah\n('evil')`;
  const newline = `const a = import\n('evil')`;
  const multiline = `\nimport('a')\nimport('b')`;

  t.notThrows(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.notThrows(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.notThrows(() => c.evaluate(wrap(comment), opt), 'comment');
  t.notThrows(
    () => c.evaluate(wrap(doubleSlashComment), opt),
    'doubleSlashComment',
  );
  t.notThrows(() => c.evaluate(wrap(newline), opt), 'newline');
  t.notThrows(() => c.evaluate(wrap(multiline), opt), 'multiline');
});
