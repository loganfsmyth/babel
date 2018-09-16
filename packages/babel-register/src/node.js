// @flow
import deepClone from "lodash/cloneDeep";
import sourceMapSupport from "source-map-support";
import * as registerCache from "./cache";
import escapeRegExp from "lodash/escapeRegExp";
import * as babel from "@babel/core";
import { OptionManager, DEFAULT_EXTENSIONS } from "@babel/core";
import { addHook } from "pirates";
import fs from "fs";
import path from "path";

const maps: {
  [string]: Object,
} = {};
let transformOpts: babel.Options = {};
let piratesRevert = null;

function installSourceMapSupport() {
  sourceMapSupport.install({
    handleUncaughtExceptions: false,
    environment: "node",
    retrieveSourceMap(source: string) {
      const map = maps && maps[source];
      if (map) {
        return {
          url: null,
          map: map,
        };
      }
      return null;
    },
  });
}

let cache: ?{
  [string]: {
    result: {
      code: string,
      map: ?Object,
    } | null,
    mtime: number,
  },
};

function mtime(filename: string): number {
  return +fs.statSync(filename).mtime;
}

function compile(code: string, filename: string): string {
  // merge in base options and resolve all the plugins and presets relative to this file
  const opts = new OptionManager().init(
    // sourceRoot can be overwritten
    {
      sourceRoot: path.dirname(filename),
      ...deepClone(transformOpts),
      filename,
    },
  );

  // Bail out ASAP if the file has been ignored.
  if (opts === null) return code;

  let cacheKey = `${JSON.stringify(opts)}:${babel.version}`;

  const env = babel.getEnv();

  if (env) cacheKey += `:${env}`;

  const mtimeKey = cache ? mtime(filename) : 0;
  const cached = cache ? cache[cacheKey] : null;

  let result = null;
  if (cached && cached.mtime === mtimeKey) {
    result = cached.result;
  } else {
    const output = babel.transformSync(code, {
      ...opts,
      sourceMaps: opts.sourceMaps === undefined ? "both" : opts.sourceMaps,
      ast: false,
    });
    if (output) {
      if (typeof output.code !== "string") {
        throw new Error("Assertion failure - expected output code");
      }
      result = {
        code: output.code,
        map: output.map,
      };
    }
  }

  if (cache) {
    cache[cacheKey] = {
      result,
      mtime: mtimeKey,
    };
  }

  if (result && result.map) {
    if (Object.keys(maps).length === 0) {
      installSourceMapSupport();
    }
    maps[filename] = result.map;
  }

  return result ? result.code : code;
}

let compiling = false;

function compileHook(code: string, filename: string): string {
  if (compiling) return code;

  try {
    compiling = true;
    return compile(code, filename);
  } finally {
    compiling = false;
  }
}

function hookExtensions(exts: Array<string>) {
  if (piratesRevert) piratesRevert();
  piratesRevert = addHook(compileHook, { exts, ignoreNodeModules: false });
}

export function revert() {
  if (piratesRevert) piratesRevert();
}

register();

type Options = babel.Options & {
  extensions?: ?Array<string>,
  cache?: boolean,
};

export default function register(opts?: Options = {}) {
  const { extensions, cache: cacheEnabled, ...babelOptions } = opts;

  hookExtensions(extensions || DEFAULT_EXTENSIONS);

  if (cacheEnabled === false && cache) {
    registerCache.clear();
    cache = null;
  } else if (cacheEnabled !== false && !cache) {
    registerCache.load();
    cache = registerCache.get();
  }

  // Ensure that the working directory is resolved up front so that
  // things don't break if it changes later.
  const cwd = path.resolve(
    babelOptions.cwd === undefined ? "." : babelOptions.cwd,
  );

  babelOptions.cwd = cwd;
  babelOptions.caller = {
    name: "@babel/register",
    ...(babelOptions.caller || {}),
  };

  if (babelOptions.ignore === undefined && babelOptions.only === undefined) {
    babelOptions.only = [
      // Only compile things inside the current working directory.
      new RegExp("^" + escapeRegExp(cwd), "i"),
    ];
    babelOptions.ignore = [
      // Ignore any node_modules inside the current working directory.
      new RegExp(
        "^" +
          escapeRegExp(cwd) +
          "(?:" +
          path.sep +
          ".*)?" +
          escapeRegExp(path.sep + "node_modules" + path.sep),
        "i",
      ),
    ];
  }

  transformOpts = babelOptions;
}
