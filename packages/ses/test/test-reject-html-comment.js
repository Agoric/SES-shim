import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

test('reject HTML comment expressions in evaluate', t => {
  t.plan(6);

  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const htmlOpenComment1 = "const a = foo <!-- hah\n('evil')";
  const htmlCloseComment1 = "const a = foo --> hah\n('evil')";
  const htmlOpenComment2 = "const a = eval <!-- hah\n('evil')";
  const htmlCloseComment2 = "const a = eval --> hah\n('evil')";
  const htmlOpenComment3 = "const a = import <!-- hah\n('evil')";
  const htmlCloseComment3 = "const a = import --> hah\n('evil')";

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment1)),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment1)),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment2)),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment2)),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment3)),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment3)),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );
});

test('reject HTML comment expressions in Function', t => {
  t.plan(6);

  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const htmlOpenComment1 = "const a = foo <!-- hah\n('evil')";
  const htmlCloseComment1 = "const a = foo --> hah\n('evil')";
  const htmlOpenComment2 = "const a = eval <!-- hah\n('evil')";
  const htmlCloseComment2 = "const a = eval --> hah\n('evil')";
  const htmlOpenComment3 = "const a = import <!-- hah\n('evil')";
  const htmlCloseComment3 = "const a = import --> hah\n('evil')";

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment1)),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment1)),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment2)),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment2)),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment3)),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment3)),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );
});

test('reject HTML comment expressions with name', t => {
  t.plan(2);

  const c = new Compartment();

  t.throws(
    () => c.evaluate('\n<!-- -->'),
    {
      name: 'SyntaxError',
      message: /Possible HTML comment rejected at <unknown>:2/,
    },
    'htmlCloseComment without name',
  );

  t.throws(
    () =>
      c.evaluate(
        '\n\n<!-- stuff -->/* @sourceURL=bogus://contrived\n*/ // #sourceMap=ignore/me',
      ),
    {
      name: 'SyntaxError',
      message: /Possible HTML comment rejected at bogus:\/\/contrived:3/,
    },
    'htmlCloseComment with name',
  );
});
