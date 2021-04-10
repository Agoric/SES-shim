import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

test('reject direct eval expressions in evaluate', t => {
  t.plan(10);

  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const safe = 'const a = 1';
  const safe2 = "const a = noteval('evil')";
  const safe3 = "const a = evalnot('evil')";

  // "bogus" is actually direct eval syntax which ideally we could
  // reject. However, it escapes our regexp, which we allow because
  // accepting it is a future compat issue, not a security issue.
  const bogus = "const a = (eval)('evil')";

  const obvious = "const a = eval('evil')";
  const whitespace = "const a = eval ('evil')";
  const comment = "const a = eval/*hah*/('evil')";
  const doubleSlashComment = "const a = eval // hah\n('evil')";
  const newline = "const a = eval\n('evil')";
  const multiline = "\neval('a')\neval('b')";

  t.notThrows(() => c.evaluate(wrap(safe)), 'safe');
  t.notThrows(() => c.evaluate(wrap(safe2)), 'safe2');
  t.notThrows(() => c.evaluate(wrap(safe3)), 'safe3');

  t.notThrows(() => c.evaluate(wrap(bogus)), 'bogus');

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
  t.notThrows(() => c.evaluate(wrap(comment)), 'comment');
  t.notThrows(() => c.evaluate(wrap(doubleSlashComment)), 'doubleSlashComment');
  t.throws(
    () => c.evaluate(wrap(newline)),
    { instanceOf: SyntaxError },
    'newline',
  );
  t.throws(
    () => c.evaluate(wrap(multiline)),
    { instanceOf: SyntaxError },
    'newline',
  );
});

test('reject direct eval expressions in Function', t => {
  t.plan(10);

  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const safe = 'const a = 1';
  const safe2 = "const a = noteval('evil')";
  const safe3 = "const a = evalnot('evil')";

  // "bogus" is actually direct eval syntax which ideally we could
  // reject. However, it escapes our regexp, which we allow because
  // accepting it is a future compat issue, not a security issue.
  const bogus = "const a = (eval)('evil')";

  const obvious = "const a = eval('evil')";
  const whitespace = "const a = eval ('evil')";
  const comment = "const a = eval/*hah*/('evil')";
  const doubleSlashComment = "const a = eval // hah\n('evil')";
  const newline = "const a = eval\n('evil')";
  const multiline = "\neval('a')\neval('b')";

  t.notThrows(() => c.evaluate(wrap(safe)), 'safe');
  t.notThrows(() => c.evaluate(wrap(safe2)), 'safe2');
  t.notThrows(() => c.evaluate(wrap(safe3)), 'safe3');

  t.notThrows(() => c.evaluate(wrap(bogus)), 'bogus');

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
  t.notThrows(() => c.evaluate(wrap(comment)), 'comment');
  t.notThrows(() => c.evaluate(wrap(doubleSlashComment)), 'doubleSlashComment');
  t.throws(
    () => c.evaluate(wrap(newline)),
    { instanceOf: SyntaxError },
    'newline',
  );
  t.throws(
    () => c.evaluate(wrap(multiline)),
    { instanceOf: SyntaxError },
    'newline',
  );
});

test('reject direct eval expressions with name', t => {
  t.plan(2);

  const c = new Compartment();

  t.throws(
    () => c.evaluate('eval("evil")'),
    {
      name: 'SyntaxError',
      message: /Possible direct eval expression rejected at <unknown>:1/,
    },
    'newline with name',
  );

  t.throws(
    () =>
      c.evaluate(
        'eval("evil") /* #sourceURL=contrived://example */ // @sourceMapURL=ignore/me.json',
      ),
    {
      name: 'SyntaxError',
      message: /Possible direct eval expression rejected at contrived:\/\/example:1/,
    },
    'newline with name',
  );
});
