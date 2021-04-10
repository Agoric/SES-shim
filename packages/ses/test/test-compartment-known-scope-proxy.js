/* eslint-disable no-underscore-dangle */
import test from 'ava';
import 'ses/lockdown';

lockdown();

function leakScopeProxy() {
  return this;
}

test('SES compartment recognizes its own scopeProxies', t => {
  const c = new Compartment({ leakScopeProxy });
  const scopeProxy1 = c.evaluate('leakScopeProxy()');
  const scopeProxy2 = c.evaluate('leakScopeProxy()');
  t.is(1, 1);
  t.not(scopeProxy1, scopeProxy2);
  t.is(typeof scopeProxy1, 'object');
  t.is(typeof scopeProxy2, 'object');
  t.is(c.__isKnownScopeProxy__(scopeProxy1), true);
  t.is(c.__isKnownScopeProxy__(scopeProxy2), true);
  t.is(c.__isKnownScopeProxy__({}), false);
});

test('SES compartment does not recognize other scopeProxies', t => {
  const c1 = new Compartment({ leakScopeProxy });
  const c2 = new Compartment({ leakScopeProxy });
  const scopeProxy1 = c1.evaluate('leakScopeProxy()');
  const scopeProxy2 = c2.evaluate('leakScopeProxy()');
  t.is(1, 1);
  t.not(scopeProxy1, scopeProxy2);
  t.is(typeof scopeProxy1, 'object');
  t.is(typeof scopeProxy2, 'object');
  t.is(c1.__isKnownScopeProxy__(scopeProxy1), true);
  t.is(c2.__isKnownScopeProxy__(scopeProxy2), true);
  t.is(c1.__isKnownScopeProxy__(scopeProxy2), false);
  t.is(c2.__isKnownScopeProxy__(scopeProxy1), false);
});

test('scope proxy leak workaround usecase', t => {
  function createFunctionWrapper(sourceValue, unwrapTest, unwrapTo) {
    const newValue = function functionWrapper(...args) {
      if (new.target) {
        // handle constructor calls
        return Reflect.construct(sourceValue, args, new.target);
      } else {
        // handle function calls
        // replace the "this" value if the unwrapTest returns truthy
        const thisRef = unwrapTest(this) ? unwrapTo : this;
        return Reflect.apply(sourceValue, thisRef, args);
      }
    };
    Object.defineProperties(
      newValue,
      Object.getOwnPropertyDescriptors(sourceValue),
    );
    return newValue;
  }

  function fixProxyLeak(compartment) {
    Object.entries(Object.getOwnPropertyDescriptors(compartment.globalThis))
      // for now, for simplicity, apply only to configurable non-getter function values
      .filter(
        ([_, propDesc]) =>
          'value' in propDesc &&
          typeof propDesc.value === 'function' &&
          propDesc.configurable,
      )
      // redefine with workaround
      .forEach(([key, propDesc]) => {
        const newFn = createFunctionWrapper(
          propDesc.value,
          /* eslint-disable-next-line no-underscore-dangle */
          value => compartment.__isKnownScopeProxy__(value),
          compartment.globalThis,
        );
        const newPropDesc = { ...propDesc, value: newFn };
        Reflect.defineProperty(compartment.globalThis, key, newPropDesc);
      });
  }

  function getThisValue() {
    return this;
  }

  const compartment = new Compartment({ getThisValue });
  const valueBeforeFix = compartment.evaluate('getThisValue()');
  fixProxyLeak(compartment);
  const valueAfterFix = compartment.evaluate('getThisValue()');

  t.not(valueBeforeFix, compartment.globalThis);
  t.is(valueAfterFix, compartment.globalThis);
});
