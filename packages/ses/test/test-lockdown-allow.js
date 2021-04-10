import test from 'ava';
import 'ses/lockdown';

test('lockdown returns boolean or throws in downgraded SES', t => {
  t.plan(6);

  t.truthy(
    lockdown({
      dateTaming: 'unsafe',
      errorTaming: 'unsafe',
      mathTaming: 'unsafe',
      regExpTaming: 'unsafe',
    }),
    undefined,
    'return true when called from JS with options',
  );

  t.falsy(
    lockdown({
      dateTaming: 'unsafe',
      errorTaming: 'unsafe',
      mathTaming: 'unsafe',
      regExpTaming: 'unsafe',
    }),
    undefined,
    'return false when called from SES with the same options',
  );

  t.throws(
    () =>
      lockdown({
        dateTaming: 'safe',
      }),
    undefined,
    'throws when attempting to tame Date',
  );

  t.throws(
    () =>
      lockdown({
        errorTaming: 'safe',
      }),
    undefined,
    'throws when attempting to tame Error',
  );

  t.throws(
    () =>
      lockdown({
        mathTaming: 'safe',
      }),
    undefined,
    'throws when attempting to tame Math',
  );

  t.throws(
    () =>
      lockdown({
        regExpTaming: 'safe',
      }),
    undefined,
    'throws when attempting to tame RegExp',
  );
});
