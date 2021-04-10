import test from 'ava';
import 'ses/lockdown';

lockdown();

test('tame locale methods', t => {
  t.is(Object.prototype.toString, Object.prototype.toLocaleString);
  t.is(Number.prototype.toString, Number.prototype.toLocaleString);
  t.is(BigInt.prototype.toString, BigInt.prototype.toLocaleString);
  t.is(Date.prototype.toDateString, Date.prototype.toLocaleDateString);
  t.is(Date.prototype.toString, Date.prototype.toLocaleString);
  t.is(Date.prototype.toTimeString, Date.prototype.toLocaleTimeString);
  t.is(String.prototype.toLowerCase, String.prototype.toLocaleLowerCase);
  t.is(String.prototype.toUpperCase, String.prototype.toLocaleUpperCase);
  t.is(Array.prototype.toString, Array.prototype.toLocaleString);

  const TypedArray = Reflect.getPrototypeOf(Uint8Array);
  t.is(TypedArray.prototype.toString, TypedArray.prototype.toLocaleString);

  t.is(typeof String.prototype.localeCompare, 'function');
  t.not(`${String.prototype.localeCompare}`.includes('[native code]'));
});
