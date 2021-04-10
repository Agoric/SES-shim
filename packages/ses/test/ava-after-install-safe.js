import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

// Confirm that tap can be imported after a safe-Error lockdown, and exercise
// enough of tap to make sure the success cases still work. Unfortunately we
// can't exercise the failure cases (e.g. `t.is(1, 2)`) without causing
// the SES test suite to fail, and it is the failure cases that are the most
// interesting. Many of the problems listed in bug #367 are triggered when a
// tap assertion fails, and tap attempts to display the stack trace of the
// failing assertion call. We can, however, at least provoke Error and
// err.stack, which provides *some* coverage.

function boom() {
  throw Error('kaboom');
}

test('ava-after-unsafe-lockdown basic test works', t => {
  t.is(1, 1);
  // boom();
  t.throws(() => boom(), { message: /kaboom/ });
  try {
    boom();
  } catch (e) {
    // eslint-disable-next-line no-unused-vars
    const frames = e.stack;
  }
});
