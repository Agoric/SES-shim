import test from 'ava';
import 'ses/lockdown';

lockdown({
  __allowUnsafeMonkeyPatching__: 'unsafe',
  overrideTaming: 'min',
});

test('Unsafe kludge for monkey patching', t => {
  t.false(Object.isFrozen(Object.prototype));

  const x = {};
  x.toString = () => 'foo';
  x.constructor = 'Foo';
  t.is(`${x}`, 'foo');
  t.is(x.constructor, 'Foo');

  harden(x);
  // Because harden is tranisitively contagious up inheritance chain,
  // hardening x also hardens Object.prototype and other primordials
  // reachable from it.
  for (const reachable of [
    Object.prototype,
    Object,
    Function.prototype,
    Function.prototype.constructor,
    Function.prototype.apply,
  ]) {
    t.true(Object.isFrozen(reachable));
  }
  for (const unreachable of [
    Function,
    // eslint-disable-next-line no-eval
    eval,
    globalThis,
    Reflect,
    Reflect.apply,
  ]) {
    t.false(Object.isFrozen(unreachable));
  }

  const y = {};
  // Under even the 'min' override taming, we still enable
  // Object.prototype.toString to be overridden by assignment.
  y.toString = () => 'bar';
  t.throws(
    () => {
      // At the 'min' override taming, we do not enable
      // Object.prototype.constructor to be overridden by
      // assignment. This did not matter before hardening
      // x because the override mistake only applies to
      // non-writable properties and Object.prototype had
      // not yet been frozen.
      y.constructor = 'Bar';
    },
    undefined,
    'Override should not be enabled for "constructor".',
  );
  t.is(`${y}`, 'bar');
  t.is(y.constructor, Object);
});
