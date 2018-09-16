// @flow

import path from "path";
import fs from "fs";
import { sync as mkdirpSync } from "mkdirp";
import homeOrTmp from "home-or-tmp";
import { version, getEnv } from "@babel/core";
import findCacheDir from "find-cache-dir";

const DEFAULT_CACHE_DIR =
  findCacheDir({ name: "@babel/register" }) || homeOrTmp;
const DEFAULT_FILENAME = path.join(
  DEFAULT_CACHE_DIR,
  `.babel.${version}.${getEnv()}.json`,
);
const FILENAME: string = process.env.BABEL_CACHE_PATH || DEFAULT_FILENAME;
let data: Object = {};

/**
 * Write stringified cache to disk.
 */
export function save() {
  let serialised: string = "{}";

  try {
    serialised = JSON.stringify(data, null, "  ");
  } catch (err) {
    if (err.message === "Invalid string length") {
      err.message = "Cache too large so it's been cleared.";
      console.error(err.stack);
    } else {
      throw err;
    }
  }

  mkdirpSync(path.dirname(FILENAME));
  fs.writeFileSync(FILENAME, serialised);
}

/**
 * Load cache from disk and parse.
 */
export function load() {
  if (process.env.BABEL_DISABLE_CACHE) return;

  process.on("exit", save);
  process.nextTick(save);

  if (!fs.existsSync(FILENAME)) return;

  try {
    const cacheContent: string = fs.readFileSync(FILENAME, "utf8");
    let result: mixed = JSON.parse(cacheContent);
    if (typeof result !== "object" || !result) result = {};
    data = result;
  } catch (err) {}
}

/**
 * Retrieve data from cache.
 */
export function get(): Object {
  return data;
}

/**
 * Clear the cache object.
 */
export function clear() {
  data = {};
}
