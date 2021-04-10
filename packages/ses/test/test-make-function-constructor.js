import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';
import { makeFunctionConstructor } from '../src/make-function-constructor.js';

test('functionConstructor', t => {
  t.plan(12);

  const globalObject = Object.create(
    {},
    {
      foo: { value: 1 },
      bar: { value: 2, writable: true },
    },
  );
  const safeFunction = makeFunctionConstructor(globalObject);

  t.is(safeFunction('return foo')(), 1);
  t.is(safeFunction('return bar')(), 2);
  // t.is(safeFunction('return this.foo')(), 1);
  // t.is(safeFunction('return this.bar')(), 2);

  t.throws(() => safeFunction('foo = 3')(), { instanceOf: TypeError });
  t.notThrows(() => safeFunction('bar = 4')());

  t.is(safeFunction('return foo')(), 1);
  t.is(safeFunction('return bar')(), 4);
  // t.is(safeFunction('return this.foo')(), 1);
  // t.is(safeFunction('return this.bar')(), 4);

  const fnFoo = safeFunction('foo', 'return foo');
  t.is(fnFoo(5), 5);
  t.is(fnFoo(6, 7), 6);

  const fnBar = safeFunction('foo, bar', 'return bar');
  t.is(fnBar(5), undefined);
  t.is(fnBar(6, 7), 7);

  const fnThisFoo = safeFunction('foo', 'return this.foo');
  t.throws(() => fnThisFoo.call(undefined, 9), { instanceOf: TypeError });
  t.is(fnThisFoo.call({ foo: 8 }, 9), 8);
});
