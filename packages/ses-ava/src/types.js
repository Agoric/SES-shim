// @ts-check
import 'ses';

/**
 * @callback Logger
 * @param {...any} args
 * @returns {void}
 */

/**
 * @callback LogCallError
 *
 * Calls `thunk()` passing back approximately its outcome, but first
 * logging any erroneous outcome to the `logger`, which defaults to
 * `console.log`.
 *
 * If thunk returns a non-promise, silently return it.
 * If thunk throws, log what was thrown and then rethrow it.
 * If thunk returns a promise, immediately return a new unresolved promise.
 * If the first promise fulfills, silently fulfill the returned promise even if
 * the fulfillment was an error.
 * If the first promise rejects, log the rejection reason and then reject the
 * returned promise with the same reason.
 * The delayed rejection of the returned promise is an observable difference
 * from directly calling `thunk()` but will be equivalent enough for most
 * purposes.
 *
 * TODO This function is useful independent of ava, so consider moving it
 * somewhere and exporting it for general reuse.
 *
 * @param {(...any) => any} func
 * @param {any[]} args
 * @param {string} name
 * @param {Logger=} logger
 */

/**
 * Simplified form of ava's types.
 * TODO perhaps just import ava's type declarations instead
 *
 * @typedef {Object} Assertions
 * @property {(actual: any, message?: string) => void} assert
 * // TODO is, deepEqual, truthy, falsy, etc...
 */

/**
 * @callback ImplFunc
 * This is the function that invariably starts `t => {`.
 * Ava's types call this `Implementation`, but that's just too confusing.
 *
 * @param {Assertions} t
 * @returns {any}
 *
 * @callback TesterFunc
 * @param {string} title
 * @param {ImplFunc} implFunc
 * @returns {void}
 *
 * @typedef {TesterFunc} TesterInterface
 * @property {TesterFunc} after
 * @property {TesterFunc} afterEach
 * @property {TesterFunc} before
 * @property {TesterFunc} beforeEach
 * @property {TesterFunc} cb
 * @property {TesterFunc} failing
 * @property {TesterFunc} serial
 * @property {TesterFunc} only
 * @property {TesterFunc} skip
 */
