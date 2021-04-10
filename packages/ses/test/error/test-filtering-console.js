import test from 'ava';
import 'ses/lockdown';
import { filterConsole } from '../../src/error/console.js';
import { assertLogs } from './throws-and-logs.js';

lockdown();

test('filtering console', t => {
  assertLogs(
    t,
    () => {
      // sampled inside the thunk, in the environment set up by
      // assertLogs
      const testingConsole = console;
      let filterFlag = true;
      const filter = { canLog: _severity => filterFlag };
      const filteringConsole = filterConsole(testingConsole, filter);
      filteringConsole.log('foo');
      filterFlag = false;
      filteringConsole.log('bar');
      filterFlag = true;
      filteringConsole.log('baz');
    },
    [
      ['log', 'foo'],
      ['log', 'baz'],
    ],
  );
});
