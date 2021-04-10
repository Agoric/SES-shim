import 'ses/lockdown';
import test from 'ava';
import { overrideTester } from './override-tester.js';

lockdown({ overrideTaming: 'min' });

test('enablePropertyOverrides - on', t => {
  overrideTester(t, 'Object', {}, ['toString']);
  overrideTester(t, 'Function', () => {}, ['toString']);
  overrideTester(t, 'Error', new Error(), ['name']);
});
