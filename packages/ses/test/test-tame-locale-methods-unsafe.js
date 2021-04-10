import test from 'ava';
import 'ses/lockdown';

lockdown({ localeTaming: 'unsafe' });

test('tame locale methods', t => {
  t.not(Object.prototype.toString, Object.prototype.toLocaleString);
  t.not(Number.prototype.toString, Number.prototype.toLocaleString);
  t.not(BigInt.prototype.toString, BigInt.prototype.toLocaleString);
  t.not(Date.prototype.toDateString, Date.prototype.toLocaleDateString);
  t.not(Date.prototype.toString, Date.prototype.toLocaleString);
  t.not(Date.prototype.toTimeString, Date.prototype.toLocaleTimeString);
  t.not(String.prototype.toLowerCase, String.prototype.toLocaleLowerCase);
  t.not(String.prototype.toUpperCase, String.prototype.toLocaleUpperCase);
  t.not(Array.prototype.toString, Array.prototype.toLocaleString);

  const TypedArray = Reflect.getPrototypeOf(Uint8Array);
  t.not(TypedArray.prototype.toString, TypedArray.prototype.toLocaleString);

  t.is(typeof String.prototype.localeCompare, 'function');
  t.truthy(`${String.prototype.localeCompare}`.includes('[native code]'));
});
