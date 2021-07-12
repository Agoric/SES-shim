// @ts-check

/**
 * @typedef {(...args: unknown[]) => void} Logger
 */

/**
 * @callback LogCallError
 *
 * Calls `func(...args)` passing back approximately its outcome, but first
 * logging any erroneous outcome to the `logger`, which defaults to
 * `console.log`.
 *
 * If func returns a non-promise, silently return it.
 * If func throws, log what was thrown and then rethrow it.
 * If func returns a promise, immediately return a new unresolved promise.
 * If the first promise fulfills, silently fulfill the returned promise even if
 * the fulfillment was an error.
 * If the first promise rejects, log the rejection reason and then reject the
 * returned promise with the same reason.
 * The delayed rejection of the returned promise is an observable difference
 * from directly calling `func(...args)` but will be equivalent enough for most
 * purposes.
 *
 * TODO This function is useful independent of ava, so consider moving it
 * somewhere and exporting it for general reuse.
 *
 * @param {(...unknown) => unknown} func
 * @param {unknown[]} args
 * @param {string} name
 * @param {Logger=} logger
 */

/**
 * Simplified form of ava's types.
 * TODO perhaps just import ava's type declarations instead
 * See https://github.com/avajs/ava/blob/main/index.d.ts
 * TODO reconcile also with types and API defined in avaAssertXS.js
 *
 * @typedef {Object} Assertions
 * @property {(actual: unknown, message?: string) => void} assert
 * @property {(message?: string) => void} fail
 * @property {(fn: () => any, message?: string) => void} notThrows
 * @property {(
 *   fn: () => PromiseLike<any>,
 *   message?: string
 * ) => Promise<void>} notThrowsAsync
 * // TODO is, deepEqual, truthy, falsy, etc...
 */

/**
 * @callback BaseImplFunc
 * This is the function that invariably starts `t => {`.
 * Ava's types call this `Implementation`, but that's just too confusing.
 *
 * @param {Assertions} t
 * @returns {unknown}
 *
 * @typedef {BaseImplFunc | Object} ImplFunc
 * @property {(...unknown) => string} [title]
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
