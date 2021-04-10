import test from 'ava';
import 'ses/lockdown';

lockdown();

test('nested realms should work at all', t => {
  const c1 = new Compartment();
  const c2 = c1.evaluate('new Compartment()');
  t.is(c2.evaluate('1+2'), 3);
  const c3 = c2.evaluate('new Compartment()');
  t.is(c3.evaluate('1+2'), 3);
});
