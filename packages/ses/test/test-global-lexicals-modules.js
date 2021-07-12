import '../index.js';
import test from 'ava';
import { resolveNode, makeNodeImporter } from './node.js';

const makeCompartment = (endowments, globalLexicals) => {
  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/example/main.js': `
      export const whom = hello;
      export const whomElse = hello;
      export const keys = Object.keys(globalThis);
      export const globalHello = globalThis.hello;
    `,
    'https://example.com/packages/example/immutability.js': `
      hello = 'Please throw';
    `,
    'https://example.com/packages/example/collision.js': `
      import { whom } from './main.js';
      export default whom;
    `,
  });
  const compartment = new Compartment(
    endowments,
    /* modules: */ {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/example'),
      globalLexicals,
    },
  );
  return compartment;
};

test('endowments own properties are mentionable', async t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const compartment = makeCompartment(endowments);

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.is(whom, 'World!');
});

test('endowments own properties are enumerable', async t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const compartment = makeCompartment(endowments);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, ['hello']);
});

test('endowments prototypically inherited properties are not mentionable', async t => {
  t.plan(1);

  const endowments = { __proto__: { hello: 'World!' } };
  const compartment = makeCompartment(endowments);

  const moduleNS = await compartment.import('./main.js');
  t.is(moduleNS.whom, undefined);
});

test('endowments prototypically inherited properties are not enumerable', async t => {
  t.plan(1);

  const endowments = {
    __proto__: { bye: 'Friend!' },
    hello: 'World!',
  };
  const compartment = makeCompartment(endowments);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, ['hello']);
});

test('global lexicals are mentionable', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.is(whom, 'World!');
});

test('global lexicals are not enumerable from global object', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, []);
});

test('global lexicals are not reachable from global object', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { globalHello } = namespace;
  t.is(globalHello, undefined);
});

test('global lexicals prototypically inherited properties are not reachable from global object', async t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const globalLexicals = { __proto__: { hello: 'Other World!' } };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { globalHello } = namespace;
  t.is(globalHello, 'World!');
});

test('global lexicals prototypically inherited properties are not enumerable', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = {
    __proto__: {
      bye: 'So long and thanks for all the fish',
    },
    hello: 'World!',
  };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, []);
});

test('global lexicals overshadow global object', async t => {
  t.plan(1);

  const endowments = { hello: 'Your name here' };
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.is(whom, 'World!');
});

test('global lexicals are constant', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  try {
    await compartment.import('./immutability.js');
  } catch (error) {
    t.truthy(true);
  }
});

test('global lexicals are captured on construction', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  // Psych!
  globalLexicals.hello = 'Something else';

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.is(whom, 'World!');
});

test('global lexical accessors are sampled once up front', async t => {
  t.plan(2);

  let counter = 0;
  const globalLexicals = {
    get hello() {
      const result = counter;
      counter += 1;
      return result;
    },
  };

  const endowments = {};
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { whom, whomElse } = namespace;
  t.is(whom, 0);
  t.is(whomElse, 0);
});

test('global lexical overshadowed by imported name', async t => {
  t.plan(1);

  const endowments = {};
  // Freezing the given lexicals should not prevent overshadowing.
  // The mechanism that allows this is the shallow copy of the
  // globalLexicals performed in the compartment constructor.
  const globalLexicals = Object.freeze({
    hello: 'World!',
    whom: 'Ignore me!',
  });
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./collision.js');
  t.is(namespace.default, 'World!');
});
