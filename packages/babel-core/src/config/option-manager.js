// @flow
import buildCacheKey, { type CacheKey } from "@babel/helper-caching";

import * as context from "../index";
import Plugin, { validatePluginObject } from "./plugin";
import merge from "lodash/merge";
import buildConfigChain, { type ConfigItem } from "./build-config-chain";
import traverse from "@babel/traverse";
import clone from "lodash/clone";
import { makeWeakCache, type CacheConfigurator } from "./caching";
import { getEnv } from "./helpers/environment";
import { validate, type ValidatedOptions, type PluginItem } from "./options";
import { buildOptionsCacheKey } from "./options-cache-key";

import makeAPI from "./helpers/config-api";

import { loadPlugin, loadPreset } from "./loading/files";

type MergeOptions =
  | ConfigItem
  | {
      type: "preset",
      options: ValidatedOptions,
      alias: string,
      dirname: string,
      cacheKey: CacheKey,
    };

export default function manageOptions(opts: {}): {
  options: Object,
  passes: Array<Array<Plugin>>,
  cacheKey: CacheKey,
} | null {
  return new OptionManager().init(opts);
}

class OptionManager {
  keys: Array<CacheKey> = [];
  options: ValidatedOptions = {};
  passes: Array<Array<Plugin>> = [[]];

  /**
   * This is called when we want to merge the input `opts` into the
   * base options.
   *
   *  - `alias` is used to output pretty traces back to the original source.
   *  - `loc` is used to point to the original config.
   *  - `dirname` is used to resolve plugins relative to it.
   */

  mergeOptions(config: MergeOptions, pass?: Array<Plugin>, envName: string) {
    const result = loadConfig(config);

    const plugins = result.plugins.map(descriptor =>
      loadPluginDescriptor(descriptor, envName),
    );
    const presets = result.presets.map(descriptor =>
      loadPresetDescriptor(descriptor, envName),
    );

    const passPerPreset = config.options.passPerPreset;
    pass = pass || this.passes[0];

    // resolve presets
    if (presets.length > 0) {
      let presetPasses = null;
      if (passPerPreset) {
        presetPasses = presets.map(() => []);
        // The passes are created in the same order as the preset list, but are inserted before any
        // existing additional passes.
        this.passes.splice(1, 0, ...presetPasses);
      }

      presets.forEach((presetConfig, i) => {
        this.mergeOptions(
          presetConfig,
          presetPasses ? presetPasses[i] : pass,
          envName,
        );
      });
    }

    // resolve plugins
    if (plugins.length > 0) {
      pass.unshift(...plugins);
    }

    const options = Object.assign({}, result.options);
    delete options.extends;
    delete options.env;
    delete options.plugins;
    delete options.presets;
    delete options.passPerPreset;

    // "sourceMap" is just aliased to sourceMap, so copy it over as
    // we merge the options together.
    if (options.sourceMap) {
      options.sourceMaps = options.sourceMap;
      delete options.sourceMap;
    }

    merge(this.options, options);
    this.keys.push(config.cacheKey);
  }

  init(inputOpts: {}) {
    const args = validate("arguments", inputOpts);

    const { envName = getEnv() } = args;

    const configChain = buildConfigChain(args, envName);
    if (!configChain) return null;

    try {
      for (const config of configChain) {
        this.mergeOptions(config, undefined, envName);
      }
    } catch (e) {
      // There are a few case where thrown errors will try to annotate themselves multiple times, so
      // to keep things simple we just bail out if re-wrapping the message.
      if (!/^\[BABEL\]/.test(e.message)) {
        e.message = `[BABEL] ${args.filename || "unknown"}: ${e.message}`;
      }

      throw e;
    }

    const { options, passes, keys } = this;

    const cacheKey = buildCacheKey(
      buildCacheKey.obj(keys),
      buildCacheKey.obj(
        passes.map(plugins =>
          buildCacheKey.obj(plugins.map(plugin => plugin.cacheKey)),
        ),
      ),
    );

    // Tack the passes onto the object itself so that, if this object is passed back to Babel a second time,
    // it will be in the right structure to not change behavior.
    options.babelrc = false;
    options.plugins = this.passes[0];
    options.presets = this.passes
      .slice(1)
      .filter(plugins => plugins.length > 0)
      .map(plugins => ({ plugins }));
    options.passPerPreset = options.presets.length > 0;
    options.envName = envName;
    options.cacheKey = cacheKey;

    return { options, passes, cacheKey };
  }
}

type BasicDescriptor = {
  value: {} | Function,
  options: {} | void,
  dirname: string,
  alias: string,
  cacheKey: CacheKey,
};

type LoadedDescriptor = {
  value: {},
  options: {},
  dirname: string,
  alias: string,
  inputKey: CacheKey,
};

/**
 * Load and validate the given config into a set of options, plugins, and presets.
 */
const loadConfig = makeWeakCache((config: MergeOptions): {
  options: {},
  plugins: Array<BasicDescriptor>,
  presets: Array<BasicDescriptor>,
} => {
  const options = config.options;

  const plugins = (config.options.plugins || []).map((plugin, index) =>
    createDescriptor(plugin, loadPlugin, config.dirname, {
      index,
      alias: config.alias,
      type: "plugin",
      cacheKey: config.options.cacheKey,
    }),
  );

  const presets = (config.options.presets || []).map((preset, index) =>
    createDescriptor(preset, loadPreset, config.dirname, {
      index,
      alias: config.alias,
      type: "preset",
      cacheKey: config.options.cacheKey,
    }),
  );

  return { options, plugins, presets };
});

/**
 * Load a generic plugin/preset from the given descriptor loaded from the config object.
 */
const loadDescriptor = makeWeakCache(
  (
    { value, options = {}, dirname, alias, cacheKey }: BasicDescriptor,
    cache: CacheConfigurator<{ envName: string }>,
  ): LoadedDescriptor => {
    let item = value;
    if (typeof value === "function") {
      const api = Object.assign(Object.create(context), makeAPI(cache));

      try {
        item = value(api, options, dirname);
      } catch (e) {
        if (alias) {
          e.message += ` (While processing: ${JSON.stringify(alias)})`;
        }
        throw e;
      }
    }

    if (!item || typeof item !== "object") {
      throw new Error("Plugin/Preset did not return an object.");
    }

    if (typeof item.then === "function") {
      throw new Error(
        `You appear to be using an async plugin, ` +
          `which your current version of Babel does not support.` +
          `If you're using a published plugin, ` +
          `you may need to upgrade your @babel/core version.`,
      );
    }

    return {
      value: item,
      options,
      dirname,
      alias,
      inputKey: buildCacheKey(
        cacheKey,
        buildCacheKey.obj(((cache.pairs(): any): Array<CacheKey>)),
      ),
    };
  },
);

/**
 * Instantiate a plugin for the given descriptor, returning the plugin/options pair.
 */
function loadPluginDescriptor(
  descriptor: BasicDescriptor,
  envName: string,
): Plugin {
  if (descriptor.value instanceof Plugin) {
    if (descriptor.options) {
      throw new Error(
        "Passed options to an existing Plugin instance will not work.",
      );
    }

    return descriptor.value;
  }

  return instantiatePlugin(loadDescriptor(descriptor, { envName }), {
    envName,
  });
}

const instantiatePlugin = makeWeakCache(
  (
    { value, options, dirname, alias, inputKey }: LoadedDescriptor,
    cache: CacheConfigurator<{ envName: string }>,
  ): Plugin => {
    const pluginObj = validatePluginObject(value);

    const plugin = Object.assign({}, pluginObj);
    if (plugin.visitor) {
      plugin.visitor = traverse.explode(clone(plugin.visitor));
    }
    if (plugin.cached) {
      plugin.cached = clone(plugin.cached);
    }
    if (plugin.cacheKey === undefined) {
      plugin.cacheKey = buildCacheKey.lazy(() => {
        console.warn(
          `No cache key given by plugin ${alias}. ` +
            `Changes to this plugin may not properly invalidate your cache.`,
        );

        return "";
      });
    } else {
      plugin.cacheKey = buildCacheKey(inputKey, plugin.cacheKey);
    }

    if (plugin.inherits) {
      const inheritsDescriptor = {
        alias: `${alias}$inherits`,
        value: plugin.inherits,
        options,
        dirname,
        cacheKey: buildCacheKey(inputKey, "inherits"),
      };

      // If the inherited plugin changes, reinstantiate this plugin.
      const inherits = cache.invalidate(data =>
        loadPluginDescriptor(inheritsDescriptor, data.envName),
      );

      plugin.cacheKey = buildCacheKey(inherits.cacheKey, plugin.cacheKey);
      plugin.pre = chain(inherits.pre, plugin.pre);
      plugin.post = chain(inherits.post, plugin.post);
      plugin.manipulateOptions = chain(
        inherits.manipulateOptions,
        plugin.manipulateOptions,
      );
      plugin.visitor = traverse.visitors.merge([
        inherits.visitor || {},
        plugin.visitor || {},
      ]);
      Object.keys(plugin.cached || {}).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(inherits.cached, key)) {
          throw new Error("Cannot use same 'cached' key as parent plugin");
        }
      });
      plugin.cached = Object.assign({}, inherits.cached, plugin.cached);
    }

    return new Plugin(plugin, options, alias);
  },
);

/**
 * Generate a config object that will act as the root of a new nested config.
 */
const loadPresetDescriptor = (
  descriptor: BasicDescriptor,
  envName: string,
): MergeOptions => {
  return instantiatePreset(loadDescriptor(descriptor, { envName }));
};

const instantiatePreset = makeWeakCache(
  ({
    value,
    dirname,
    alias,
    options: inputOptions,
  }: LoadedDescriptor): MergeOptions => {
    const options = validate("preset", value);
    return {
      type: "preset",
      options,
      alias,
      dirname,
      cacheKey: buildOptionsCacheKey(options, inputOptions),
    };
  },
);

/**
 * Given a plugin/preset item, resolve it into a standard format.
 */
function createDescriptor(
  pair: PluginItem,
  resolver,
  dirname,
  {
    index,
    alias,
    type,
    cacheKey,
  }: {
    index: number,
    alias: string,
    type: "plugin" | "preset",
    cacheKey: CacheKey,
  },
): BasicDescriptor {
  let options;
  let value = pair;
  if (Array.isArray(value)) {
    [value, options] = value;
  }

  let filepath = null;
  if (typeof value === "string") {
    ({ filepath, value } = resolver(value, dirname));
  }

  if (!value) {
    throw new Error(`Unexpected falsy value: ${String(value)}`);
  }

  if (typeof value === "object" && value.__esModule) {
    if (value.default) {
      value = value.default;
    } else {
      throw new Error("Must export a default export when using ES6 modules.");
    }
  }

  if (typeof value !== "object" && typeof value !== "function") {
    throw new Error(
      `Unsupported format: ${typeof value}. Expected an object or a function.`,
    );
  }

  if (filepath !== null && typeof value === "object" && value) {
    // We allow object values for plugins/presets nested directly within a
    // config object, because it can be useful to define them in nested
    // configuration contexts.
    throw new Error(
      "Plugin/Preset files are not allowed to export objects, only functions.",
    );
  }

  if (options != null && typeof options !== "object") {
    throw new Error(
      "Plugin/Preset options must be an object, null, or undefined",
    );
  }
  options = options || undefined;

  return {
    alias: filepath || `${alias}$${index}`,
    value,
    options,
    dirname,
    cacheKey: buildCacheKey(cacheKey, type, index),
  };
}

function chain(a, b) {
  const fns = [a, b].filter(Boolean);
  if (fns.length <= 1) return fns[0];

  return function(...args) {
    for (const fn of fns) {
      fn.apply(this, args);
    }
  };
}
