import test from 'ava';
import 'ses/lockdown';

test('endowments own properties are mentionable', t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const whom = compartment.evaluate('hello');
  t.is(whom, 'World!');
});

test('endowments own properties are enumerable', t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, ['hello']);
});

test('endowments prototypically inherited properties are not mentionable', t => {
  t.plan(1);

  const endowments = { __proto__: { hello: 'World!' } };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  t.throws(() => compartment.evaluate('hello'), {
    message: /hello/,
    instanceOf: ReferenceError,
  });
});

test('endowments prototypically inherited properties are not enumerable', t => {
  t.plan(1);

  const endowments = { __proto__: { hello: 'World!' } };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});

test('global lexicals are mentionable', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const whom = compartment.evaluate('hello');
  t.is(whom, 'World!');
});

test('global lexicals are not enumerable from global object', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});

test('global lexicals are not reachable from global object', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const notHello = compartment.evaluate('globalThis.hello');
  t.is(notHello, undefined);
});

test('global lexicals prototypically inherited properties are not mentionable', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { __proto__: { hello: 'World!' } };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  t.throws(() => compartment.evaluate('hello'), {
    message: /hello/,
    instanceOf: ReferenceError,
  });
});

test('global lexicals prototypically inherited properties are not reachable from global object', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { __proto__: { hello: 'World!' } };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const notHello = compartment.evaluate('globalThis.hello');
  t.is(notHello, undefined);
});

test('global lexicals prototypically inherited properties are not enumerable', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { __proto__: { hello: 'World!' } };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});

test('global lexicals overshadow global object', t => {
  t.plan(1);

  const endowments = { hello: 'Your name here' };
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const whom = compartment.evaluate('hello');
  t.is(whom, 'World!');
});

test('global lexicals are constant', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  t.throws(() => compartment.evaluate('hello = "Dave."'), {
    message: /const/,
    instanceOf: TypeError,
  });
});

test('global lexicals are captured on construction', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  // Psych!
  globalLexicals.hello = 'Something else';

  const whom = compartment.evaluate('hello');
  t.is(whom, 'World!');
});

test('global lexical accessors are sampled once up front', t => {
  t.plan(2);

  let counter = 0;
  const globalLexicals = {
    get next() {
      const result = counter;
      counter += 1;
      return result;
    },
  };

  const endowments = {};
  const modules = {};
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const zero = compartment.evaluate('next');
  t.is(zero, 0);
  const stillZero = compartment.evaluate('next');
  t.is(stillZero, 0);
});

test('global lexical accessors receive globalThis', t => {
  t.plan(1);

  let receiver;
  const globalLexicals = Object.create(null, {
    hello: {
      get() {
        receiver = this;
      },
      enumerable: true,
      configurable: true,
    },
    goodbye: {
      get() {
        throw new Error('Non-enumerable properties should not be captured');
      },
      enumerable: false,
      configurable: true,
    },
  });

  const endowments = {};
  const modules = {};
  // eslint-disable-next-line no-unused-vars
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  // Capturing globalLexicals.hello is a side-effect of Compartment
  // construction.
  // Code run in the compartment does not need to access the global lexical for
  // it to be captured.
  t.is(receiver, globalLexicals);
});
