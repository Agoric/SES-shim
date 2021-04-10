import 'ses/lockdown';
import test from 'ava';
import { overrideTester } from './override-tester.js';

lockdown();

test('enablePropertyOverrides - on', t => {
  overrideTester(t, 'Object', {}, ['toString', 'valueOf']);
  // We allow 'length' *not* because it is in enablements; it is not;
  // but because each array instance has its own.
  overrideTester(t, 'Array', [], ['toString', 'length', 'push']);
  // eslint-disable-next-line func-names
  overrideTester(t, 'Function', function() {}, [
    'constructor',
    'bind',
    'toString',
  ]);
  overrideTester(t, 'Error', new Error(), [
    'constructor',
    'message',
    'name',
    'toString',
  ]);
  overrideTester(t, 'TypeError', new TypeError(), [
    'constructor',
    'message',
    'name',
  ]);
  // eslint-disable-next-line func-names
  overrideTester(t, 'Promise', new Promise(function() {}), ['constructor']);
  overrideTester(t, 'JSON', JSON);
});
