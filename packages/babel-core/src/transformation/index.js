// @flow
import traverse from "@babel/traverse";
import type { SourceMap } from "convert-source-map";

import isPlainObject from "lodash/isPlainObject";
import isEqual from "lodash/isEqual";
import buildDebug from "debug";
import buildCacheKey from "@babel/helper-caching";

import type { ResolvedConfig, PluginPasses } from "../config";

import { CACHE_KEY } from "../index";

import PluginPass from "./plugin-pass";
import loadBlockHoistPlugin from "./block-hoist-plugin";
import normalizeOptions from "./normalize-opts";
import normalizeFile from "./normalize-file";

import generateCode from "./file/generate";
import type File from "./file/file";

const debug = buildDebug("babel:transformation:index");

export type FileResultCallback = {
  (Error, null): any,
  (null, FileResult | null): any,
};

export type FileResult = {
  metadata: {},
  options: {},
  ast: {} | null,
  code: string | null,
  map: SourceMap | null,
};

type CacheItem = {
  result: FileResult,
  checks: PassesChecks,
};
type PassesChecks = Array<Array<CachePluginChecks>>;
type CachePluginChecks = Array<CacheCheck>;
type CacheCheck = {
  name: string,
  args: Array<mixed>,
  result: mixed,
};

function loadFromCache(
  passes: PluginPasses,
  key: string,
  filename: string | void,
): CacheItem | null {
  for (const pass of passes) {
    for (const plugin of pass) {
      const { loadFromCache } = plugin;
      if (loadFromCache) {
        const result = loadFromCache(key, filename);
        if (result !== undefined) return result;
      }
    }
  }

  return null;
}

function saveToCache(
  passes: PluginPasses,
  key: string,
  filename: string | void,
  cached: CacheItem,
): void {
  for (const pass of passes) {
    for (const plugin of pass) {
      const { saveToCache } = plugin;
      if (saveToCache) {
        saveToCache(key, filename, cached);
      }
    }
  }
}

function hasCachePlugins(passes: PluginPasses) {
  for (const pass of passes) {
    for (const plugin of pass) {
      const { saveToCache, loadFromCache } = plugin;
      if (saveToCache || loadFromCache) return true;
    }
  }
  return false;
}

function runCacheChecks(
  passes: PluginPasses,
  passesChecks: PassesChecks,
): boolean {
  return passesChecks.every((passChecks, passIndex) => {
    const pass = passes[passIndex];

    return passChecks.every((pluginChecks, pluginIndex) => {
      const plugin = pass && pass[pluginIndex];

      return pluginChecks.every(({ name, args, result }) => {
        if (!plugin || !plugin.cached || !plugin.cached[name]) {
          debug(
            `Corrupt cache entry detected for pass ${passIndex} at index ${pluginIndex} with name ${name}`,
          );
          return false;
        }
        const handler = plugin.cached[name];
        const value = handler.apply(undefined, args);

        return isEqual(value, result);
      });
    });
  });
}

export function runAsync(
  config: ResolvedConfig,
  code: string,
  ast: ?(BabelNodeFile | BabelNodeProgram),
  callback: Function,
) {
  let result;
  try {
    result = runSync(config, code, ast);
  } catch (err) {
    return callback(err);
  }

  // We don't actually care about calling this synchronously here because it is
  // already running within a .nextTick handler from the transform calls above.
  return callback(null, result);
}

export function runSync(
  config: ResolvedConfig,
  code: string,
  ast: ?(BabelNodeFile | BabelNodeProgram),
): FileResult {
  const cacheKey = hasCachePlugins(config.passes)
    ? // If we weren't using loose mode, we could just do `${buildCacheKey(...)}`.
      // $FlowIgnore - We want to explicitly trigger ToPrimitive(..., hint String)
      "".concat(
        buildCacheKey(
          CACHE_KEY,
          config.options.cacheKey,
          code,
          ast ? buildCacheKey.lazy(() => JSON.stringify(ast)) : undefined,
        ),
      )
    : null;

  let cached =
    cacheKey === null
      ? null
      : loadFromCache(config.passes, cacheKey, config.options.filename);

  // Allow plugins to expose functions that are re-called with the cache
  // value. If a plugin returns a different value at a later time, the cache
  // entry is considered invalidated.
  if (cached && !runCacheChecks(config.passes, cached.checks)) cached = null;

  let result;
  if (cached) {
    result = cached.result;
  } else {
    const file = normalizeFile(
      config.passes,
      normalizeOptions(config),
      code,
      ast,
    );

    transformFile(file, config.passes);

    const opts = file.opts;
    const { outputCode, outputMap } =
      opts.code !== false ? generateCode(config.passes, file) : {};

    result = {
      metadata: file.metadata,
      options: opts,
      ast: opts.ast !== false ? file.ast : null,
      code: outputCode === undefined ? null : outputCode,
      map: outputMap === undefined ? null : outputMap,
    };

    if (cacheKey !== null) {
      saveToCache(config.passes, cacheKey, config.options.filename, {
        result,
        checks: [],
      });
    }
  }

  return result;
}

function transformFile(file: File, pluginPasses: PluginPasses): PassesChecks {
  return pluginPasses.map(pluginPairs => {
    const passPairs = [];
    const passes = [];
    const visitors = [];
    const passChecks = [];

    for (const plugin of pluginPairs.concat([loadBlockHoistPlugin()])) {
      const { cached, checks } = buildCachedWrappers(plugin.cached);

      const pass = new PluginPass(file, plugin.key, plugin.options, cached);

      passPairs.push([plugin, pass]);
      passes.push(pass);
      visitors.push(plugin.visitor);
      passChecks.push(checks);
    }

    for (const [plugin, pass] of passPairs) {
      const fn = plugin.pre;
      if (fn) {
        const result = fn.call(pass, file);

        if (isThenable(result)) {
          throw new Error(
            `You appear to be using an plugin with an async .pre, ` +
              `which your current version of Babel does not support.` +
              `If you're using a published plugin, you may need to upgrade ` +
              `your @babel/core version.`,
          );
        }
      }
    }

    // merge all plugin visitors into a single visitor
    const visitor = traverse.visitors.merge(
      visitors,
      passes,
      file.opts.wrapPluginVisitorMethod,
    );
    traverse(file.ast, visitor, file.scope);

    for (const [plugin, pass] of passPairs) {
      const fn = plugin.post;
      if (fn) {
        const result = fn.call(pass, file);

        if (isThenable(result)) {
          throw new Error(
            `You appear to be using an plugin with an async .post, ` +
              `which your current version of Babel does not support.` +
              `If you're using a published plugin, you may need to upgrade ` +
              `your @babel/core version.`,
          );
        }
      }
    }

    return passChecks;
  });
}

function buildCachedWrappers<T: {}>(
  cachedToWrapIn: T | void,
): { cached: T | void, checks: CachePluginChecks } {
  if (cachedToWrapIn === undefined) return { cached: undefined, checks: [] };
  const cachedToWrap = cachedToWrapIn;

  const checks = [];
  const cached = Object.keys(cachedToWrap).reduce((acc, name) => {
    const fn = cachedToWrap[name];
    if (typeof fn !== "function") {
      throw new Error("");
    }

    acc[name] = (...args) => {
      if (!args.every(arg => isJSONValue(arg))) {
        throw new Error(
          `.cached[...] functions must have JSON-stringifiable arguments.`,
        );
      }

      const result = fn(...args);

      if (!isJSONValue(result)) {
        throw new Error(
          `.cached[...] functions must have JSON-stringifiable return values.`,
        );
      }

      checks.push({ name, args, result });

      return result;
    };
    return acc;
  }, (({}: any): T));

  return { cached, checks };
}
function isJSONValue(value: mixed): boolean {
  if (isPlainObject(value)) {
    const obj: {} = (value: any);
    return Object.keys(obj).every(key => isJSONValue(obj[key]));
  } else if (Array.isArray(value)) {
    return value.every(item => isJSONValue(item));
  }

  return (
    value === null ||
    (typeof value === "number" && isFinite(value)) ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

function isThenable(val: mixed): boolean {
  return (
    !!val &&
    (typeof val === "object" || typeof val === "function") &&
    typeof val.then === "function"
  );
}
