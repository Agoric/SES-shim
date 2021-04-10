import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';
import { performEval } from '../src/evaluate.js';

test('performEval - sloppyGlobalsMode', t => {
  t.plan(7);

  const globalObject = {};
  const endowments = { abc: 123 };
  const options = { sloppyGlobalsMode: true };

  t.is(
    performEval('typeof def', globalObject, {}, options),
    'undefined',
    'typeof non declared global',
  );
  t.is(
    performEval('def', globalObject, {}, options),
    undefined,
    'non declared global do not cause a reference error',
  );

  t.is(
    performEval('abc', globalObject, endowments, options),
    123,
    'endowments can be referenced',
  );
  t.is(
    performEval('abc', globalObject, {}, options),
    undefined,
    'endowments do not persit',
  );
  t.is(
    performEval('def = abc + 333', globalObject, endowments, options),
    456,
    'define global',
  );
  t.is(
    performEval('def', globalObject, {}, options),
    456,
    'defined global persists',
  );
  t.is(globalObject.def, 456, 'assigned global uses the global object');
});

test('performEval - transforms - rewrite source', t => {
  t.plan(4);

  const globalObject = {};
  const endowments = { abc: 123, def: 456 };

  const globalTransforms = [
    source => {
      if (source === 'ABC') {
        source = 'abc';
      }
      return source;
    },
  ];

  const localTransforms = [
    source => {
      if (source === 'ABC') {
        return 'def';
      }
      return source;
    },
  ];

  t.is(performEval('abc', globalObject, endowments), 123, 'no rewrite');

  t.is(
    performEval('ABC', globalObject, endowments, {
      globalTransforms,
    }),
    123,
    'globalTransforms rewrite source',
  );
  t.is(
    performEval('ABC', globalObject, endowments, {
      localTransforms,
    }),
    456,
    'localTransforms rewrite source',
  );
  t.is(
    performEval('ABC', globalObject, endowments, {
      localTransforms,
      globalTransforms,
    }),
    456,
    'localTransforms rewrite source first',
  );
});
