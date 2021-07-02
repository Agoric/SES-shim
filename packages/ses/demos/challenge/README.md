# SES Demo

This directory contains a brief online demonstration of how SES enables safe
interaction between mutually suspicious code. Visit
https://ses-demo.agoric.app/demos/challenge/ to run it.

To avoid relying upon a third party for security, your production applications
should publish and reference their own copy of `ses.umd.js`.

For local testing, after making a change, run ``yarn build`` to build the
generated files. Then, ensure that the demo is pointing towards your generated
file (i.e.``<script src="../../dist/ses.umd.js"></script> ``). Next, run a web
server and serve the entire git tree.  (the demo accesses the generated
``ROOT/dist/ses.umd.js`` file, so serving just this ``demos/challenge/``
directory is not enough). 

## Would You Like To Play A Game?

Remember the scene from [WarGames](https://www.imdb.com/title/tt0086567/)
where the computer is trying to guess the launch codes? Here, you get to play
the computer.

## Attacker

You provide the attacker's program by pasting its source code into the box
and pressing the Execute button. The attack program is confined in an SES
environment (shared with the defender), which means it is limited to
``strict`` mode and has access to the usual ECMAScript intrinsics (Object,
String, Array, Math, Map, Date (but see below), and so on). But it does not
have access to platform objects (``window``, ``document``, or ``XHR`` on a
web browser, or ``require`` on Node.js).

In addition to the intrinsics, the attacker's program gets access to two
endowments: ``guess(code)`` and ``log(message)``. These are provided by the
defender.

This source code must evaluate to a generator function (starting with
`function*` and ending with a closing curly brace), which will be called once
to produce a generator. That generator will be iterated again and again until
it exits or the secret code is guessed correctly.

```js
function* guessZeros() {
  guess('0000000000');
}
```

The attacker uses ``guess()`` to try and guess the launch code. This guess is
displayed on the bottom panel. When the guess matches the code on the top
panel, the attacker wins and the game is over. The codes are ten characters
long, and each character is a capital letter from A to Z, or a digit from 0
to 9. There are ``36**10`` possibilities (about three quadrillion, or about
``2**51``, which also happens to be roughly how many ants are alive on Earth
at any given moment). It takes at least a few milliseconds to check each one,
so brute-force guessing would take thousands of years to try all possible
combinations.

We use a generator function, rather than an ordinary function, as a
concession to make the demo look more interesting. In a more realistic setup,
the attacker code would do all its work during its singular evaluation (it
could make as many calls to guess() as it liked), with something like this:

```js
for (let i = 0; true; i++) {
  let guessedCode = i.toString(36).toUpperCase();
  while (guessedCode.length < 10) {
    guessedCode = '0' + guessedCode; // pad to 10 characters
  }
  guess(guessedCode);
}
```

But in a single-threaded browser context, that wouldn't give the framework an
opportunity to update the UI. In addition, the web browser would pop a "this
script is taking too long" dialog box after maybe 15 seconds of constant
execution, since it is effectively stuck in an infinite loop.

By using a generator, we can update the UI once per iteration. Thus the
attack function should call ``guess()`` once, then yield from the generator,
then loop back around if it wants to make more guesses. The above program
should be rewritten like this:

```js
function* counter() {
  for (let i = 0; true; i++) {
    let guessedCode = i.toString(36).toUpperCase();
    while (guessedCode.length < 10) {
      guessedCode = '0' + guessedCode; // pad to 10 characters
    }
    guess(guessedCode);
    yield;
}
```

Despite this quirk, the attacker's program is still essentially being
evaluated as purely transformational code: the way we load the attacker isn't
quite as important as the way we allow it to call ``guess()``.

## Defender

The defender in this game has slightly more power than the attacker: it is
SES-confined as well, but it gets additional endowments from the setup code.
One of these is a form of ``getRandomValues`` so it can select a random
target code: SES programs are normally denied access to non-determinism, so
it would have no way of choosing a different code on each pageload. A few
more endowments provide control over the DOM: ``setMacguffinText`` sets the
target code in the top box, ``setAttackerGuess`` sets the guessed code in the
bottom box, ``setLaunch`` changes the CSS class of the bottom box to change
the text color when the guess is correct. Note that, for this demo, none of
these endowments are particularly defensive: the defender code could use them
to break out of the SES sandbox.

``refreshUI`` returns a Promise that resolves after a ``setTimeout(0)``. This
yields control back to the browser's UI event queue, giving it a chance to
repaint the screen with the updated codes. ``log`` simply delivers its
arguments to the browser's usual ``console.log``.

``delayMS`` performs a busy-wait for the given number of milliseconds by
polling ``Date.now`` until it reaches some target value.

We use ``delayMS()`` to introduce an egregious timing-channel vulnerability
into the defender's ``guess()`` function: it checks the attacker's guess one
character at a time, waiting a full 10ms between each test, and returns
immediately upon the first incorrect failure. If the attacker can measure how
long ``guess()`` takes to run, they can mount a classic timing-oracle attack
which runs in linear (rather than exponential) time. A safer form of
``guess()`` would do a constant-time comparison (for which the most practical
approach is to just hash both sides and compare the hashes). Our vulnerable
``guess()`` looks like this:

```js
function guess(guessedCode) {
  guessedCode = `${guessedCode}`; // force into a String
  setAttackerGuess(guessedCode);
  for (let i=0; i < 10; i++) {
    if (secretCode.slice(i, i+1) !== guessedCode.slice(i, i+1)) {
      return false;
    }
    delayMS(10);
  }
  // they guessed correctly
  enableAttacker = false;
  setLaunch(true);
  return true;
}
```

The defender creates the ``guess()`` function, then provides it (and ``log``)
as endowments to the attacker. It invokes ``SES.confine`` to evaluate the
attacker's code with the endowments as the second argument:

```js
function attackerLog(...args) {
  log(...args);
}
const attacker = SES.confine(program, { guess: guess, log: attackerLog });
```

The defender then invokes the attacker in a loop, using ``refreshUI()`` to
delay each pass until the UI had a chance to be updated, with something like
this:

```js
      program = `(${program})`; // turn it into an expression
      const attacker = SES.confine(program, { guess: guess, log: attackerLog });
      const attackGen = attacker(); // build the generator
      function nextGuess() {
        // give the attacker another chance to run
        if (attackGen.next().done) {
          return; // attacker gave up, so stop asking
        }
        // now let the UI refresh before we call attacker again
        refreshUI().then(nextGuess);
      }
      nextGuess();
```

(some additional lines exist to stop the loop if/when the attacker gets the
code right).


## Taming Date.now

The SES environment normally replaces ``Date.now()`` with a function that
only returns ``NaN``. But ``Date.now()`` can be re-enabled by setting a
configuration option named ``dateNowMode`` to ``allow``.

(Note that this API is still in flux, and we might change it in the future.
One interesting option might be to set ``Date.now`` to return a constant,
pre-selected value, enabling more code to run mostly-correctly, while still
limiting its use as an attack vector)

SES replaces the ``new Date()`` constructor with a tamed version that acts as
if you wrote ``new Date(NaN)``. It does not currently have an option to
change this behavior, but that will probably change too.

By prohibiting access to a clock, we can prevent the attacker code from
sensing timing-based covert channel. Fully-deterministic execution cannot
sense any covert channel, since the output must be a strict function of the
declared input, and the covert channel is (by definition) not part of the
input arguments.

However we must be careful to not inadvertently provide access to a clock.
[Fantastic Timers and Where to Find
Them](https://gruss.cc/files/fantastictimers.pdf) (by Schwarz, Maurice,
Gruss, and Mangard) enumerates a variety of surprising clocks that might be
available to Javascript code. They all depend upon forms of non-determinism,
such as:

* shared-state mutability: a ``WebWorker`` writes sequential integers to a
  shared ``ArrayBuffer`` as fast as it can, while a second thread simply
  reads from that location when desired
* platform-provided UI features: initiate a CSS animation and monitor its
  progress
* message-passing: two separate frames exchange ``postMessage`` calls and
  compare their arrival order with ones sent to themselves
* explicit platform features: the ``performance.now()`` call offers
  microsecond-level timing

SES omits all platform features, which removes all the timers listed in this
paper. However it is easy to accidentally reintroduce some through
endowments. For example you might give the confined code the ability to send
messages to a remote system (which itself has access to a clock). When
multiple sources send messages to a common recipient, those messages will be
interleaved in some nondeterminisic fashion that depends upon the arrival
times: that ordering can also be used as a clock.

The demo page has two flavors: by changing the URL slightly, the attacker can
be allowed or denied access to ``Date.now()``. This makes it easy to
demonstrate the success or failure of a timing-based attack.

The first version of this demo implemented ``delayMS()`` with a Promise that
resolved at some point in the future (via a ``setTimeout()`` callback). In
that version, ``guess()`` returned a Promise. Richard Gibson exploited this
in a [clever attack](https://github.com/endojs/endo/issues/8) that submitted
multiple guesses in parallel and sensed the order of their resolution: it
didn't reveal exactly how long ``guess()`` took, but knowing which guess took
the longest was enough to mount the attack. We thought we were only using
``setTimeout()`` for internal purposes, but by exposing a function that used
it, we accidentally gave the attacker code enough tools to build a clock of
their own.

The lesson is to be careful when building endowments, especially if you build
them from powerful components that live outside the SES environment.
