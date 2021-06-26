// @ts-check

/** @typedef {import('./types.js').ReadPowers} ReadPowers */
/** @typedef {import('./types.js').HashFn} HashFn */
/** @typedef {import('./types.js').WritePowers} WritePowers */

/**
 * @param {typeof import('fs')} fs
 * @param {typeof import('crypto')} [crypto]
 * @returns {ReadPowers}
 */
export const makeNodeReadPowers = (fs, crypto = undefined) => {
  /**
   * @param {string} location
   */
  const read = async location => {
    try {
      return await fs.promises.readFile(new URL(location).pathname);
    } catch (error) {
      throw new Error(error.message);
    }
  };

  /**
   * There are two special things about the canonical function the compartment
   * mapper needs. It needs to use URL’s instead of posix paths to avoid
   * bundling up a bunch of cruft when we port this around. It needs to use
   * promises. URL’s can and must logically distinguish a directory from a
   * file, by the final slash, whereas paths must never have a final slash
   * because that implies a blank file name within the enclosing directory. The
   * canonical function must also return the logical path instead of the real
   * path if there is no real path. This is merely a convenience for the
   * compartment mapper because it will fail to read the package.json in the
   * non-existent directory on the next step after canonicalizing the package
   * location.
   *
   * @param {string} location
   */
  const canonical = async location => {
    try {
      if (location.endsWith('/')) {
        const realPath = await fs.promises.realpath(
          new URL(location).pathname.replace(/\/$/, ''),
        );
        return new URL(`${realPath}/`, location).toString();
      } else {
        const realPath = await fs.promises.realpath(new URL(location).pathname);
        return new URL(realPath, location).toString();
      }
    } catch {
      return location;
    }
  };

  /** @type {HashFn=} */
  const computeSha512 = crypto
    ? bytes => {
        const hash = crypto.createHash('sha512');
        hash.update(bytes);
        return hash.digest().toString('hex');
      }
    : undefined;

  return { read, canonical, computeSha512 };
};

/**
 * @param {typeof import('fs')} fs
 * @returns {WritePowers}
 */
export const makeNodeWritePowers = fs => {
  /**
   * @param {string} location
   * @param {Uint8Array} data
   */
  const write = async (location, data) => {
    try {
      return await fs.promises.writeFile(new URL(location).pathname, data);
    } catch (error) {
      throw new Error(error.message);
    }
  };

  return { write };
};
