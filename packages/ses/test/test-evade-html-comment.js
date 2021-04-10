import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

const opt = harden({ __evadeHtmlCommentTest__: true });

test('evade html comment expressions in evaluate', t => {
  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const htmlOpenComment1 = `const a = foo <!-- hah\n('evil')`;
  const htmlCloseComment1 = `const a = foo --> hah\n('evil')`;
  const htmlOpenComment2 = `const a = eval <!-- hah\n('evil')`;

  t.notThrows(() => c.evaluate(wrap(htmlOpenComment1), opt), 'htmlOpenComment');
  t.notThrows(
    () => c.evaluate(wrap(htmlCloseComment1), opt),
    'htmlCloseComment',
  );

  t.notThrows(() => c.evaluate(wrap(htmlOpenComment2), opt), 'htmlOpenComment');
});

test('evade html comment expressions in Function', t => {
  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const htmlOpenComment1 = `const a = foo <!-- hah\n('evil')`;
  const htmlCloseComment1 = `const a = foo --> hah\n('evil')`;
  const htmlOpenComment2 = `const a = eval <!-- hah\n('evil')`;

  t.notThrows(() => c.evaluate(wrap(htmlOpenComment1), opt), 'htmlOpenComment');
  t.notThrows(
    () => c.evaluate(wrap(htmlCloseComment1), opt),
    'htmlCloseComment',
  );

  t.notThrows(() => c.evaluate(wrap(htmlOpenComment2), opt), 'htmlOpenComment');
});
