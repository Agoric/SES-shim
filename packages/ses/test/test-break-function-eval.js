import 'ses/lockdown';
import './lockdown-safe.js';
import test from 'ava';

test('function-no-body', t => {
  t.plan(2);

  const c = new Compartment();
  const f1 = new c.globalThis.Function();
  const src = f1.toString();

  t.falsy(src.includes('undefined'));
  t.is(f1(), undefined);
});

test('function-injection', t => {
  t.plan(3);

  const goodFunc = 'return a+1';
  const c = new Compartment();
  const f1 = new c.globalThis.Function('a', goodFunc);
  t.is(f1(5), 6);

  // the naive expansion is: '(function(a) {'  +  evilFunc  +  '})'
  // c.g. `(function(a) { ${evilFunc} })`

  // we want to trick that into defining one function and evaluating
  // something else (which is evil)
  // like: '(function(a) {'  +  '}, this.haha = 666, {'  +  '})'
  // which becomes: (function(a) {}, this.haha = 666, {})

  const evilFunc = '}, this.haha = 666, {';
  t.throws(() => new c.globalThis.Function('a', evilFunc), {
    instanceOf: c.globalThis.SyntaxError,
  });
  t.is(c.globalThis.haha, undefined);
});

test('function-injection-2', t => {
  t.plan(20);

  const c = new Compartment();
  let flag = false;
  // eslint-disable-next-line func-names
  c.globalThis.target = function() {
    flag = true;
  };
  function check(...args) {
    t.throws(
      () => c.globalThis.Function(...args),
      { instanceOf: c.globalThis.SyntaxError },
      args[0],
    );
    t.is(flag, false);
  }

  // test cases from https://code.google.com/archive/p/google-caja/issues/1616
  check('}), target(), (function(){');
  check('})); }); target(); (function(){ ((function(){ ');

  // and from https://bugs.chromium.org/p/v8/issues/detail?id=2470
  check('/*', '*/){');
  check('', '});(function(){');
  check('', "});print('1+1=' + (1+1));(function(){");

  // and from https://bugs.webkit.org/show_bug.cgi?id=106160
  check('){});(function(', '');
  check('', '});(function(){');
  check('/*', '*/){');
  check('}}; 1 * {a:{');

  // bug from Matt Austin: this is surprising but doesn't allow new access
  check('arg=`', '/*body`){});({x: this/**/');
  // a naive evaluation might do this:
  //     (function(arg=`){
  //      /*body`){});({x: this/**/
  //     })

  // TODO: review the limitations previously described below.
  // In which the backtick in arg= eats both the )} that we add and the /*
  // that the body adds, allowing the body to terminate the function
  // definition. Then the body defines a new expression, which creates an
  // object with a property named "x" which captures the same 'this' you
  // could have gotten with plain safe eval.

  // markm tried to protect against this by injecting an extra trailing
  // block comment to the end of the arguments, creating a body like this

  //     (function(arg=`
  //     /*``*/){
  //      /*body`){});({x: this/**/
  //     })

  // In this version, the backtick from arg= eats the first part of the
  // injected block comment, and the backtick from the body matches the
  // second part of the injected block comment. That yields a
  // syntactically-valid but semantically-invalid default argument with a
  // value of `\n/*``*/){\n/*body` , in which the first template literal
  // (`\n/*`) evaluates to a string ("\n/*") which is then used as the
  // template-literal-tag for the second template literal. This is
  // semantically invalid because strings cannot be called as functions, but
  // the syntax is still valid. The constructed function is bypassed, so its
  // default argument is never evaluated, so this invalidity doesn't matter.

  // To protect against this, we'll just forbid everything except simple
  // identifiers in Function constructor calls: no default arguments ("=")
  // and no pattern matching expressions ("[a,b]"). You can still use complex
  // arguments in function definitions, just not in calls to the Function
  // constructor.
});

test('function-paren-default', t => {
  t.plan(1);

  const c = new Compartment();
  t.is(c.globalThis.Function('foo, a = new Date(0)', 'return foo')(99), 99);
});

test('function-default-parameters', t => {
  t.plan(1);

  const c = new Compartment();
  t.is(c.globalThis.Function('a=1', 'return a+1')(), 2);
});

test('function-rest-parameter', t => {
  t.plan(1);

  const c = new Compartment();
  t.is(c.globalThis.Function('...rest', 'return rest[1]')(1, 2, 3), 2);
});

test('function-destructuring-parameters', t => {
  t.plan(1);

  const c = new Compartment();
  t.is(c.globalThis.Function('{foo, bar}, baz', 'return bar')({ bar: 99 }), 99);
});

test('function-legitimate-but-weird-parameters', t => {
  t.plan(2);

  const c = new Compartment();
  const f1 = c.globalThis.Function('foo, bar', 'baz', 'return foo + bar + baz');
  t.is(f1(1, 2, 3), 6);

  const f2 = c.globalThis.Function(
    'foo, bar = [1',
    '2]',
    'return foo + bar[0] + bar[1]',
  );
  t.is(f2(1), 4);
});

test('degenerate-pattern-match-argument', t => {
  t.plan(1);

  const c = new Compartment();
  // This syntax is also rejected by the normal JS parser.
  t.throws(() => new c.globalThis.Function('3', 'return foo + bar + baz'), {
    instanceOf: c.globalThis.SyntaxError,
  });
});

test('frozen-eval', t => {
  t.plan(1);

  const c = new Compartment();

  Object.defineProperty(c.globalThis, 'eval', {
    value: c.globalThis.eval,
    writable: false,
    configurable: false,
  });

  c.globalThis.foo = 77;
  globalThis.foo = 88;

  t.is(c.evaluate('(0,eval)("foo")'), 77);

  delete globalThis.foo;
});
