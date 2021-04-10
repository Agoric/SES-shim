// @ts-check

import { defer } from './defer';

/**
 * @template T
 * @typedef {{
 *   put(value: T | Promise<T>): void,
 *   get(): Promise<T>
 * }} AsyncQueue
 */

/**
 * @template T
 * @returns {AsyncQueue<T>}
 */
export function queue() {
  const ends = defer();
  return {
    put(value) {
      const next = defer();
      const promise = next.promise;
      ends.resolve({ value, promise });
      ends.resolve = next.resolve;
    },
    get() {
      const promise = ends.promise.then(next => next.value);
      ends.promise = ends.promise.then(next => next.promise);
      return promise;
    },
  };
}

/**
 * @template T
 * @template U
 * @template V
 * @typedef {{
 *   next(value: U): Promise<IteratorResult<T>>,
 *   return(value: V): Promise<IteratorResult<T>>,
 *   throw(error: Error): Promise<IteratorResult<T>>,
 *   [Symbol.asyncIterator](): Stream<T, U, V>
 * }} Stream
 */

/**
 * @template T
 * @template U
 * @template V
 * @param {AsyncQueue<IteratorResult<T>>} acks
 * @param {AsyncQueue<IteratorResult<U>>} data
 * @returns {Stream<T, U, V>}
 */
export function stream(acks, data) {
  return {
    next(value) {
      data.put({ value, done: false });
      return acks.get();
    },
    return(value) {
      data.put({ value, done: true });
      return acks.get();
    },
    throw(error) {
      data.put(Promise.reject(error));
      return acks.get();
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/**
 * @template T
 * @template U
 * @template TReturn
 * @template UReturn
 * @returns {[Stream<T, U, TReturn>, Stream<U, T, UReturn>]}
 */
export function pipe() {
  const syn = queue();
  const ack = queue();
  const input = stream(syn, ack);
  const output = stream(ack, syn);
  return [input, output];
}
