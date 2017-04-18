// @flow

import { getEnv } from "./helpers/environment";
import path from "path";
import micromatch from "micromatch";
import { makeWeakCache } from "./caching";

import { findConfigs, loadConfig } from "./loading/files";

type ConfigItem = {
  type: "options"|"arguments",
  options: {},
  dirname: string,
  alias: string,
  loc: string,
};

export default function buildConfigChain(opts: {}): Array<ConfigItem>|null {
  if (typeof opts.filename !== "string" && opts.filename != null) {
    throw new Error(".filename must be a string, null, or undefined");
  }

  const filename = opts.filename ? path.resolve(opts.filename) : null;
  const builder = new ConfigChainBuilder(filename);

  const merged = builder.mergeConfig({
    options: opts,
    dirname: process.cwd(),
  }, true /* skipCache */);
  if (!merged) return null;

  // resolve all .babelrc files
  if (opts.babelrc !== false && filename) {
    for (const config of findConfigs(path.dirname(filename))) {
      const merged = builder.mergeConfig(config);

      if (!merged) return null;
    }
  }

  return builder.configs.reverse();
}

class ConfigChainBuilder {
  filename: string|null;
  configs: Array<ConfigItem>;
  possibleDirs: null|Array<string>;

  constructor(filename) {
    this.configs = [];
    this.filename = filename;
    this.possibleDirs = null;
  }

  /**
   * Tests if a filename should be ignored based on "ignore" and "only" options.
   */
  shouldIgnore(
    ignore: mixed,
    only: mixed,
    dirname: string,
  ): boolean {
    if (!this.filename) return false;

    if (ignore) {
      if (!Array.isArray(ignore)) {
        throw new Error(`.ignore should be an array, ${JSON.stringify(ignore)} given`);
      }

      if (this.matchesPatterns(ignore, dirname)) return true;
    }

    if (only) {
      if (!Array.isArray(only)) {
        throw new Error(`.only should be an array, ${JSON.stringify(only)} given`);
      }

      if (!this.matchesPatterns(only, dirname)) return true;
    }

    return false;
  }

  /**
   * Returns result of calling function with filename if pattern is a function.
   * Otherwise returns result of matching pattern Regex with filename.
   */
  matchesPatterns(patterns: Array<mixed>, dirname: string) {
    const filename = this.filename;
    if (!filename) throw new Error("Assertion failure: .filename should always exist here");

    const res = [];
    const strings = [];
    const fns = [];

    patterns.forEach((pattern) => {
      if (typeof pattern === "string") strings.push(pattern);
      else if (typeof pattern === "function") fns.push(pattern);
      else if (pattern instanceof RegExp) res.push(pattern);
      else throw new Error("Patterns must be a string, function, or regular expression");
    });

    if (res.some((re) => re.test(filename))) return true;
    if (fns.some((fn) => fn(filename))) return true;

    if (strings.length > 0) {
      let possibleDirs = this.possibleDirs;
      // Lazy-init so we don't initialize this for files that have no glob patterns.
      if (!possibleDirs) {
        possibleDirs = this.possibleDirs = [];

        possibleDirs.push(filename);

        let current = filename;
        while (true) {
          const previous = current;
          current = path.dirname(current);
          if (previous === current) break;

          possibleDirs.push(current);
        }
      }

      const absolutePatterns = strings.map((pattern) => {
        // Preserve the "!" prefix so that micromatch can use it for negation.
        const negate = pattern[0] === "!";
        if (negate) pattern = pattern.slice(1);

        return (negate ? "!" : "") + path.resolve(dirname, pattern);
      });

      if (micromatch(possibleDirs, absolutePatterns, { nocase: true }).length > 0) {
        return true;
      }
    }

    return false;
  }

  mergeConfig(config, skipCache): boolean {
    // Skipping the cache here is a performance optimization for the passed-in arguments, since
    // they will always be a new object and thrashing the cache just adds extra time. It appears
    // to make config loading ~15% faster.
    const items = skipCache ? filteredConfig(config) : cachedFilteredConfig(config);

    for (const item of items) {
      if (item.type === "extends") continue;

      const { options, dirname } = item;

      // Bail out ASAP if this file is ignored so that we run as little logic as possible on ignored files.
      if (
        this.filename &&
        this.shouldIgnore(options.ignore || null, options.only || null, dirname)
      ) {
        return false;
      }
    }

    for (const item of items) {
      if (item.type === "extends") {
        const extendsConfig = loadConfig(item.extends, item.dirname);

        const existingConfig = this.configs.some((config) => config.alias === extendsConfig.filepath);
        if (!existingConfig) {
          const merged = this.mergeConfig(extendsConfig);

          if (!merged) return false;
        }
      } else {
        this.configs.push(item);
      }
    }

    return true;
  }
}

/**
 * Given a config object, flatten it based on the current environment, consistently returning the same
 * objects if the same input object and environment is used.
 */
const cachedFilteredConfig = makeWeakCache((config, cache) => {
  return filterByEnv(cachedFlattenConfig(config), cache.using(() => getEnv()));
});
const cachedFlattenConfig = makeWeakCache(flattenConfig);

/**
 * Given a config object, flatten it based on the current environment, consistently returning the same
 * objects if the same input object and environment is used.
 */
function filteredConfig(config) {
  return filterByEnv(flattenConfig(config), getEnv());
}

function filterByEnv(configs, envKey) {
  return configs.filter((config) => typeof config.envKey !== "string" || config.envKey === envKey);
}

type ExtendsItem = { type: "extends", extends: string, dirname: string };

/**
 * Flatten the config and generate unique items for each nested config. This set of items is created
 * without taking the current environnment into account so that they can be cached without needing to
 * invalidate config items that are not tied to the environment.
 */
function flattenConfig(config): Array<ConfigItem|ExtendsItem> {
  const rootType = config.filepath ? "options" : "arguments";
  const dirname = config.dirname;
  const rootAlias = config.filepath || "base";

  const configs = [];

  (function buildNestedConfig(rawOpts, activeEnvKey, activeAlias) {
    const options = Object.assign({}, rawOpts);
    delete options.env;
    delete options.extends;

    if (rawOpts.env != null && (typeof rawOpts.env !== "object" || Array.isArray(rawOpts.env))) {
      throw new Error(".env block must be an object, null, or undefined");
    }
    const env = rawOpts.env;

    if (env) {
      for (const envKey of Object.keys(env)) {
        if (activeEnvKey !== undefined && activeEnvKey !== envKey) continue;

        const value = env[envKey];

        if (value != null && (typeof value !== "object" || Array.isArray(value))) {
          throw new Error(`.env[${envKey}] block must be an object, null, or undefined`);
        }

        if (value) {
          buildNestedConfig(value, envKey, rootAlias + ".env." + envKey);
        }
      }
    }

    configs.push({
      type: activeEnvKey ? "options" : rootType,
      options,
      dirname,
      alias: activeAlias,
      loc: activeAlias,
      envKey: activeEnvKey,
    });

    if (rawOpts.extends != null && typeof rawOpts.extends !== "string") {
      throw new Error(".extends must be a string, null, or undefined");
    }

    if (rawOpts.extends) {
      configs.push({
        type: "extends",
        extends: rawOpts.extends,
        dirname,
      });
    }
  })(config.options, undefined, rootAlias);

  return configs;
}
