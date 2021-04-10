// @ts-check

/**
 * @template T
 * @template U
 * @template V
 * @typedef {import('./stream.js').Stream<T, U, V>} Stream
 */

const COLON = ':'.charCodeAt(0);
const COMMA = ','.charCodeAt(0);

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * @param {AsyncIterable<Uint8Array>} input
 * @param {string=} name
 * @param {number=} capacity
 * @returns {AsyncGenerator<Uint8Array, Uint8Array, unknown>} input
 */
export async function* reader(input, name = '<unknown>', capacity = 1024) {
  let length = 0;
  let buffer = new Uint8Array(capacity);
  let offset = 0;

  for await (const chunk of input) {
    if (length + chunk.byteLength >= capacity) {
      while (length + chunk.byteLength >= capacity) {
        capacity *= 2;
      }
      const replacement = new Uint8Array(capacity);
      replacement.set(buffer, 0);
      buffer = replacement;
    }
    buffer.set(chunk, length);
    length += chunk.byteLength;

    let drained = false;
    while (!drained && length > 0) {
      const colon = buffer.indexOf(COLON);
      if (colon === 0) {
        throw new Error(
          `Expected number before colon at offset ${offset} of ${name}`,
        );
      } else if (colon > 0) {
        const prefixBytes = buffer.subarray(0, colon);
        const prefixString = decoder.decode(prefixBytes);
        const contentLength = +prefixString;
        if (Number.isNaN(contentLength)) {
          throw new Error(
            `Invalid netstring prefix length ${prefixString} at offset ${offset} of ${name}`,
          );
        }
        const messageLength = colon + contentLength + 2;
        if (messageLength <= length) {
          yield buffer.subarray(colon + 1, colon + 1 + contentLength);
          buffer.copyWithin(0, messageLength);
          length -= messageLength;
          offset += messageLength;
        } else {
          drained = true;
        }
      } else {
        drained = true;
      }
    }
  }

  if (length > 0) {
    throw new Error(
      `Unexpected dangling message at offset ${offset} of ${name}`,
    );
  }
  return new Uint8Array(0);
}

/**
 * @param {Stream<void, Uint8Array, void>} output
 * @returns {Stream<void, Uint8Array, void>}
 */
export function writer(output) {
  const scratch = new Uint8Array(8);

  return {
    async next(message) {
      const { written: length = 0 } = encoder.encodeInto(
        `${message.byteLength}`,
        scratch,
      );
      scratch[length] = COLON;

      const { done: done1 } = await output.next(
        scratch.subarray(0, length + 1),
      );
      if (done1) {
        return output.return();
      }

      const { done: done2 } = await output.next(message);
      if (done2) {
        return output.return();
      }

      scratch[0] = COMMA;
      return output.next(scratch.subarray(0, 1));
    },
    async return() {
      return output.return();
    },
    async throw(error) {
      return output.throw(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
