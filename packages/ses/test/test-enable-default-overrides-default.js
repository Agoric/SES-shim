import 'ses/lockdown';
import test from 'ava';

lockdown();

// See https://github.com/endojs/endo/issues/616#issuecomment-800733101

test('enable default overrides of Uint8Array', t => {
  t.notThrows(() => {
    function Buffer(_arg, _encodingOrOffset, _length) {}
    Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer, Uint8Array);
    Buffer.prototype.toLocaleString = Buffer.prototype.toString;
  });
});
