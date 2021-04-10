import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

test('reject import expressions in evaluate', t => {
  t.plan(9);

  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const safe = 'const a = 1';
  const safe2 = "const a = notimport('evil')";
  const safe3 = "const a = importnot('evil')";

  const obvious = "const a = import('evil')";
  const whitespace = "const a = import ('evil')";
  const comment = "const a = import/*hah*/('evil')";
  const doubleSlashComment = "const a = import // hah\n('evil')";
  const newline = "const a = import\n('evil')";
  const multiline = "\nimport('a')\nimport('b')";

  t.notThrows(() => c.evaluate(wrap(safe)), 'safe');
  t.notThrows(() => c.evaluate(wrap(safe2)), 'safe2');
  t.notThrows(() => c.evaluate(wrap(safe3)), 'safe3');
  t.throws(
    () => c.evaluate(wrap(obvious)),
    { instanceOf: SyntaxError },
    'obvious',
  );
  t.throws(
    () => c.evaluate(wrap(whitespace)),
    { instanceOf: SyntaxError },
    'whitespace',
  );
  t.throws(
    () => c.evaluate(wrap(comment)),
    { instanceOf: SyntaxError },
    'comment',
  );
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    { instanceOf: SyntaxError },
    'doubleSlashComment',
  );
  t.throws(
    () => c.evaluate(wrap(newline)),
    { instanceOf: SyntaxError },
    'newline',
  );
  t.throws(
    () => c.evaluate(wrap(multiline)),
    { instanceOf: SyntaxError },
    'multiline',
  );
});

test('reject import expressions in Function', t => {
  t.plan(9);

  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const safe = 'const a = 1';
  const safe2 = "const a = notimport('evil')";
  const safe3 = "const a = importnot('evil')";

  const obvious = "const a = import('evil')";
  const whitespace = "const a = import ('evil')";
  const comment = "const a = import/*hah*/('evil')";
  const doubleSlashComment = "const a = import // hah\n('evil')";
  const newline = "const a = import\n('evil')";
  const multiline = "\nimport('a')\nimport('b')";

  t.notThrows(() => c.evaluate(wrap(safe)), 'safe');
  t.notThrows(() => c.evaluate(wrap(safe2)), 'safe2');
  t.notThrows(() => c.evaluate(wrap(safe3)), 'safe3');
  t.throws(
    () => c.evaluate(wrap(obvious)),
    { instanceOf: SyntaxError },
    'obvious',
  );
  t.throws(
    () => c.evaluate(wrap(whitespace)),
    { instanceOf: SyntaxError },
    'whitespace',
  );
  t.throws(
    () => c.evaluate(wrap(comment)),
    { instanceOf: SyntaxError },
    'comment',
  );
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    { instanceOf: SyntaxError },
    'doubleSlashComment',
  );
  t.throws(
    () => c.evaluate(wrap(newline)),
    { instanceOf: SyntaxError },
    'newline',
  );
  t.throws(
    () => c.evaluate(wrap(multiline)),
    { instanceOf: SyntaxError },
    'multiline',
  );
});

test('reject import expressions with error messages', t => {
  t.plan(2);

  const c = new Compartment();
  const code = 'import("attack?exfiltration")';
  t.throws(
    () => c.evaluate(code),
    {
      name: 'SyntaxError',
      message: /Possible import expression rejected at <unknown>:1/,
    },
    'without name',
  );

  t.throws(
    () => c.evaluate(`\n${code}//#sourceURL= never://land`),
    {
      name: 'SyntaxError',
      message: /Possible import expression rejected at never:\/\/land:2/,
    },
    'with name',
  );
});
