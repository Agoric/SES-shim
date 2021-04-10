import test from 'ava';
import 'ses/lockdown';
import { getOwnPropertyDescriptor } from '../src/commons.js';

test('check if override-protected primordials are frozen', t => {
  lockdown();

  // After removing the detachedProperties mechanism and without
  // the originalValue mechanism, this test failed.
  t.truthy(Object.isFrozen(Object.prototype.toString));

  const desc = getOwnPropertyDescriptor(Object.prototype, 'toString');
  t.is(desc.get.originalValue, Object.prototype.toString);
});
