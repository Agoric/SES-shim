import '../install-ses.js';
import { test } from 'tape';

function parse() {
  throw TypeError('Error parsing');
}

test('parse', t => {
  t.ok(true);
  t.throws(parse, /Error parsing/, 'expected failure');
  t.end();
});
