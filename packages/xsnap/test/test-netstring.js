import test from 'ava';
import * as netstring from '../src/netstring';
import { pipe } from '../src/stream';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function read(source) {
  const array = [];
  for await (const chunk of source) {
    // Capture current state, allocating a copy.
    array.push(chunk.slice());
  }
  return array;
}

test('read short messages', async t => {
  const r = netstring.reader([encoder.encode('0:,1:A,')], '<unknown>', 1);
  const array = await read(r);
  t.deepEqual(
    ['', 'A'],
    array.map(chunk => decoder.decode(chunk)),
  );
});

test('read messages divided over chunk boundaries', async t => {
  const r = netstring.reader(
    [encoder.encode('5:hel'), encoder.encode('lo,')],
    '<unknown>',
    1,
  );
  const array = await read(r);
  t.deepEqual(
    ['hello'],
    array.map(chunk => decoder.decode(chunk)),
  );
});

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

test('round-trip short messages', async t => {
  const array = [];
  const w = netstring.writer({
    async next(value) {
      // Provide some back pressure to give the producer an opportunity to make
      // the mistake of overwriting the given slice.
      await delay(10);
      // slice to capture before yielding.
      array.push(value.slice());
      return { done: false };
    },
    async return() {
      return { done: true };
    },
    async throw() {
      return { done: true };
    },
  });
  await w.next(encoder.encode(''));
  await w.next(encoder.encode('A'));
  await w.next(encoder.encode('hello'));
  await w.return();

  t.deepEqual(
    [encoder.encode(''), encoder.encode('A'), encoder.encode('hello')],
    await read(netstring.reader(array)),
  );
});

test('round-trip varying messages', async t => {
  const array = ['', 'A', 'hello'];

  for (let i = 1020; i < 1030; i++) {
    array.push(new Array(i).fill(':').join(''));
  }
  for (let i = 2040; i < 2050; i++) {
    array.push(new Array(i).fill(':').join(''));
  }

  t.plan(array.length);

  const [input, output] = pipe();

  const producer = (async () => {
    const w = netstring.writer(output);
    for (let i = 0; i < array.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await w.next(encoder.encode(array[i]));
      // eslint-disable-next-line no-await-in-loop
      await delay(10);
    }
    await w.return();
  })();

  const consumer = (async () => {
    const r = netstring.reader(input);
    let i = 0;
    for await (const message of r) {
      await delay(10);
      t.is(array[i], decoder.decode(message));
      i += 1;
    }
    t.log('end');
  })();

  await Promise.all([producer, consumer]);
});
