import path from "path";
import os from "path";
import fs from "fs";
import zlib from "zlib";
import findCacheDir from "find-cache-dir";

import CACHE_KEY from "./_cache-key";

export default function pluginFsCache(api, options, dirname) {
  const { directory } = options;
  if (directory !== undefined && typeof directory !== "string") {
    throw new Error(`.directory must be a string, or undefined`);
  }

  let cacheDir;
  if (directory === ":tmp:") cacheDir = os.tmpdir();
  if (directory === undefined) {
    cacheDir = findCacheDir({
      name: "babel-plugin-fs-cache",
      cwd: dirname,
      create: true,
    });

    if (!cacheDir) {
      throw new Error(
        `Unable to find cache directory relative to "${dirname}"`,
      );
    }
  } else {
    cacheDir = path.resolve(dirname, directory);
  }

  /**
   * Format a filename for the cache. By default prefixes cache entries with
   * the filename to since you never know when it might be nice to be able
   * to delete items from the cache manually based on the name.
   *
   * e.g.
   *
   *   foo.js => foo.abcdef12345
   */
  const getFilepath = (key: string) => {
    // Slicing to '32' so that we don't create super long filenames.
    return path.resolve(cacheDir, `${key.slice(0, 32)}.json.gz`);
  };

  return {
    cacheKey: CACHE_KEY,
    loadFromCache(key: string): string | null {
      let content;
      try {
        content = zlib.gunzipSync(fs.readFileSync(getFilepath(key))).toString();
      } catch (err) {
        // Catch file doesn't exist errors, re-throw the rest?
        return;
      }

      // Since we slice the filename, it's possible that there is a collision,
      // so we validate that the cached content matches the key.
      return content.slice(0, key.length) === key
        ? content.slice(key.length)
        : null;
    },
    saveToCache(key: string, filename: string | void, data: string): void {
      const content = key + data;

      // Are there any errors this could throw that we'd want to catch?
      fs.writeFileSync(getFilepath(key), zlib.gzipSync(content));
    },
  };
}
