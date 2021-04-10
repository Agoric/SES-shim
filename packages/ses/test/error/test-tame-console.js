import test from 'ava';
import 'ses/lockdown';
import { getPrototypeOf } from '../../src/commons.js';

const originalConsole = console;

lockdown();

const { details: d, quote: q } = assert;

test('ava message disclosure default', t => {
  t.throws(() => assert.fail(d`a secret ${666} and a public ${q(777)}`), {
    message: /a secret \(a number\) and a public 777/,
  });
});

test('console', t => {
  t.plan(3);

  t.not(console, originalConsole);

  harden(getPrototypeOf(console));
  harden(console);
  const c1 = new Compartment({ console });
  t.is(console, c1.evaluate('(console)'));

  const fakeConsole = { log: console.log };
  harden(fakeConsole);
  const c2 = new Compartment({ console: fakeConsole });
  t.is(console.log, c2.evaluate('(console.log)'));
});

// `test-assert-log.js` has the interesting automated console tests.
// The following console tests are only a sanity check for eyeballing the
// output. See the following descriptions for what you should expect to
// see for each test case.

// The assert failure both throws an error, and silently remembers
// the hidden details information for the log to display as an enhanced
// `message` for that error.
// The actual thrown error `message` has placeholders for the substitution
// values in the details template literal, like "(a SyntaxError)" and
// "(an object)".
// The corresponding enhanced message remembers the actual substitution values.
// When the thrown error is actually logged, the enhanced message is shown,
// where any error objects are shown with a unique tag like "(SyntaxError#2)"
// followed by simlarly-enhanced information about those errors, recursively.
// The information about these nested errors is shown indented by
// `console.group`, and thus also expanded but collapsible for console
// displays (like some browsers) that support such interaction.
test('assert - safe', t => {
  try {
    const obj = {};
    const fooErr = new SyntaxError('foo');
    assert.fail(d`caused by ${fooErr},${obj}`);
  } catch (barErr) {
    console.error('bar happens', barErr);
  }
  t.pass();
});

// The assert failure both throws an error and silently remembers
// the substitution values from the details as the enhanced message.
// However, if the thrown error is never logged, then neither is the enhanced
// message or any of the errors it carries.
test('assert - unlogged safe', t => {
  t.throws(() => {
    const obj = {};
    const fooErr = new SyntaxError('foo');
    assert.fail(d`caused by ${fooErr},${obj}`);
  });
});

// This shows the annotation-tracking. We instruct the `assert` to
// silently remember the "caused by" details as an annotation on `barErr`.
// Once `barErr` itself is actually logged, we give it a unique tag
// "(URIError#3)", log the error with stack trace in a separate log message
// beginning
// "URIError#3:", and then emit a nested log message for each of `barErr`'s
// annotations and each of the errors in their detail's substitution values.
test('tameConsole - safe', t => {
  const obj = {};
  const fooErr = new SyntaxError('foo');
  const barErr = new URIError('bar');
  assert.note(barErr, d`caused by ${fooErr},${obj}`);
  console.log('bar happens', barErr);
  t.pass();
});

// This shows that annotations on an error (ubarErr) are never seen if the
// annotated error is never logged.
test('tameConsole - unlogged safe', t => {
  const obj = {};
  const ufooErr = new SyntaxError('ufoo');
  const ubarErr = new URIError('ubar');
  assert.note(ubarErr, d`caused by ${ufooErr},${obj}`);
  t.pass();
});
