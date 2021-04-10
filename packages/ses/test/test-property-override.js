/* eslint max-classes-per-file: "off" */
import test from 'ava';
import 'ses/lockdown';

lockdown({ overrideTaming: 'moderate' });

test('Can assign "toString" of constructor prototype', t => {
  const c = new Compartment();

  const testContent = `(
  function testContent() {
    function Animal() {}
    Animal.prototype.toString = () => 'moo';
    const animal = new Animal();
    return animal.toString();
  }
  )`;

  const result = c.evaluate(testContent)();
  t.is(result, 'moo');
});

test('Can assign "toString" of class prototype', t => {
  const c = new Compartment();

  const testContent = `(
  function testContent() {
    class Animal {}
    Animal.prototype.toString = () => 'moo';
    const animal = new Animal();
    return animal.toString();
  }
  )`;

  const result = c.evaluate(testContent)();
  t.is(result, 'moo');
});

test('packages in-the-wild', t => {
  const c = new Compartment();

  const testContent0 = `(
  function testContent0() {
    function* X() {
      // empty
    }
    X.constructor = function XConstructor() {};
  }
  )`;

  t.notThrows(
    () => c.evaluate(testContent0)(),
    'generator function constructor',
  );

  const testContent1 = `(
  function testContent1() {
    function X() {
      // empty
    }
    X.constructor = function XConstructor() {};
  }
  )`;

  t.notThrows(
    () => c.evaluate(testContent1)(),
    'regenerator-runtime: generator function constructor',
  );

  const testContent2 = `(
  function testContent2() {
    function IllegalArgumentError(message) {
      Error.call(this, message);
      this.message = message;
    }

    // These are the semantics of util.inherits according to
    // https://nodejs.org/docs/latest/api/util.html#util_util_inherits_constructor_superconstructor
    Object.setPrototypeOf(IllegalArgumentError.prototype, Error.prototype);
    // eslint-disable-next-line no-underscore-dangle
    IllegalArgumentError.super_ = Error;
    IllegalArgumentError.prototype.name = 'IllegalArgumentError';
  }
  )`;

  t.notThrows(() => c.evaluate(testContent2)(), 'precond error subclass name');

  const testContent3 = `(
  function testContent3() {
    const err = Error();
    err.constructor = function ErrConstructor() {};
  }
  )`;
  t.notThrows(
    () => c.evaluate(testContent3)(),
    'fast-json-patch error instance constructor',
  );

  const testContent4 = `(
  function testContent4() {
    function fn() {}
    fn.bind = function empty() {};
  }
  )`;
  t.notThrows(
    () => c.evaluate(testContent4)(),
    'underscore function instance bind',
  );

  const testContent5 = `(
  function testContent5() {
    const p = new Promise(() => {});
    p.constructor = function PConstructor() {};
  }
  )`;
  t.notThrows(
    () => c.evaluate(testContent5)(),
    'core-js promise instance constructor',
  );

  const testContent6 = `(
  function testContent6() {
    const list = [];
    list.push = function newPush() {};
  }
  )`;
  t.notThrows(() => c.evaluate(testContent6)(), 'list push override');
});
