import test from 'ava';
import { objectHasOwnProperty } from '../src/commons.js';
import { createScopeHandler } from '../src/scope-handler.js';

// Pollute the object prototype such to trick 'value' in propertyDescriptor.
// eslint-disable-next-line no-extend-native
Object.prototype.value = null;

test('scopeHandler - defends against prototype pollution of property descriptors', t => {
  // This verifies that in the face of a polluted 'value' property on
  // Object.prototype, the scope handler is sensitive only to an owned 'value'
  // property on a property-descriptor to behave correctly.
  // The globalLexicals object should not leak to the receiver on the
  // globalLexicals getter or setter.

  const globalObject = {};
  let gotcha;
  let receiver;

  const globalLexicals = {
    get gotcha() {
      receiver = this;
      return gotcha;
    },
    set gotcha(value) {
      receiver = this;
      gotcha = value;
    },
  };

  // Verify our assumptions.
  t.assert('value' in {});
  const prop = Object.getOwnPropertyDescriptor(globalLexicals, 'gotcha');
  t.assert(objectHasOwnProperty(prop, 'get'));
  t.assert(objectHasOwnProperty(prop, 'set'));
  t.assert(!objectHasOwnProperty(prop, 'value'));
  t.assert('value' in prop); // Due to pollution

  const { scopeHandler: handler } = createScopeHandler(
    globalObject,
    globalLexicals,
  );

  handler.set(globalObject, 'gotcha', 42);
  t.is(globalObject, receiver);

  t.is(42, handler.get(globalObject, 'gotcha'));
  t.is(globalObject, receiver);

  t.is(42, gotcha);
  t.is(undefined, globalObject.gotcha);
});
