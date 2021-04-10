// @ts-check
import { createHash } from 'crypto';
import { pipeline } from 'stream';
import { createGzip, createGunzip } from 'zlib';
import { assert, details as d } from '@agoric/assert';
import { promisify } from 'util';

const pipe = promisify(pipeline);

const { freeze } = Object;

/**
 * @param {string} root
 * @param {{
 *   tmpName: typeof import('tmp').tmpName,
 *   existsSync: typeof import('fs').existsSync
 *   createReadStream: typeof import('fs').createReadStream,
 *   createWriteStream: typeof import('fs').createWriteStream,
 *   resolve: typeof import('path').resolve,
 *   rename: typeof import('fs').promises.rename,
 *   unlink: typeof import('fs').promises.unlink,
 * }} io
 */
export function makeSnapstore(
  root,
  {
    tmpName,
    existsSync,
    createReadStream,
    createWriteStream,
    resolve,
    rename,
    unlink,
  },
) {
  /** @type {(opts: unknown) => Promise<string>} */
  const ptmpName = promisify(tmpName);
  const tmpOpts = { tmpdir: root, template: 'tmp-XXXXXX.xss' };
  /**
   * @param { (name: string) => Promise<T> } thunk
   * @returns { Promise<T> }
   * @template T
   */
  async function withTempName(thunk) {
    const name = await ptmpName(tmpOpts);
    let result;
    try {
      result = await thunk(name);
    } finally {
      try {
        await unlink(name);
      } catch (ignore) {
        // ignore
      }
    }
    return result;
  }

  /**
   * @param {string} dest
   * @param { (name: string) => Promise<T> } thunk
   * @returns { Promise<T> }
   * @template T
   */
  async function atomicWrite(dest, thunk) {
    const tmp = await ptmpName(tmpOpts);
    let result;
    try {
      result = await thunk(tmp);
      await rename(tmp, resolve(root, dest));
    } finally {
      try {
        await unlink(tmp);
      } catch (ignore) {
        // ignore
      }
    }
    return result;
  }

  /** @type {(input: string, f: NodeJS.ReadWriteStream, output: string) => Promise<void>} */
  async function filter(input, f, output) {
    const source = createReadStream(input);
    const destination = createWriteStream(output);
    await pipe(source, f, destination);
  }

  /** @type {(filename: string) => Promise<string>} */
  async function fileHash(filename) {
    const hash = createHash('sha256');
    const input = createReadStream(filename);
    await pipe(input, hash);
    return hash.digest('hex');
  }

  /**
   * @param {(fn: string) => Promise<void>} saveRaw
   * @returns { Promise<string> } sha256 hash of (uncompressed) snapshot
   */
  async function save(saveRaw) {
    return withTempName(async snapFile => {
      await saveRaw(snapFile);
      const h = await fileHash(snapFile);
      if (existsSync(`${h}.gz`)) return h;
      await atomicWrite(`${h}.gz`, gztmp =>
        filter(snapFile, createGzip(), gztmp),
      );
      return h;
    });
  }

  /**
   * @param {string} hash
   * @param {(fn: string) => Promise<T>} loadRaw
   * @template T
   */
  async function load(hash, loadRaw) {
    return withTempName(async raw => {
      await filter(resolve(root, `${hash}.gz`), createGunzip(), raw);
      const actual = await fileHash(raw);
      assert(actual === hash, d`actual hash ${actual} !== expected ${hash}`);
      // be sure to await loadRaw before exiting withTempName
      const result = await loadRaw(raw);
      return result;
    });
  }

  return freeze({ load, save });
}
