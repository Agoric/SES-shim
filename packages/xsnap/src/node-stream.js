// @ts-check

/**
 * @template T
 * @template U
 * @template V
 * @typedef {import('./stream.js').Stream<T, U, V>} Stream
 */

/**
 * @template T
 * @typedef {import('./defer.js').Deferred<T>} Deferred
 */
import { defer } from './defer';

const continues = { value: undefined };

/**
 * Adapts a Node.js writable stream to a JavaScript
 * async iterator of Uint8Array data chunks.
 * Back pressure emerges from awaiting on the promise
 * returned by `next` before calling `next` again.
 *
 * @param {NodeJS.WritableStream} output the destination Node.js writer
 * @param {string} [name] a debug name for stream errors
 * @returns {Stream<void, Uint8Array, void>}
 */
export function writer(output, name = '<unnamed stream>') {
  /**
   * @type {Deferred<IteratorResult<void>>}
   */
  let drained = defer();
  drained.resolve(continues);

  output.on('error', err => {
    drained.reject(new Error(`Cannot write ${name}: ${err.message}`));
  });

  output.on('drain', () => {
    drained.resolve(continues);
    drained = defer();
  });

  return {
    /**
     * @param {Uint8Array} [chunk]
     * @returns {Promise<IteratorResult<void>>}
     */
    async next(chunk) {
      if (!chunk) {
        return continues;
      }
      if (!output.write(chunk)) {
        drained = defer();
        return drained.promise;
      }
      return continues;
    },
    async return() {
      output.end();
      return drained.promise;
    },
    async throw() {
      output.end();
      return drained.promise;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
