// @flow

import isPlainObject from "lodash/isPlainObject";

import type { ValidatedOptions, PluginList } from "./options";

import buildCacheKey, { validKey, type CacheKey } from "@babel/helper-caching";

export function buildOptionsCacheKey(
  opts: ValidatedOptions,
  inputOptions?: {},
): CacheKey {
  return buildCacheKey.lazy(() => {
    const inputValues = new Set();

    (function walkInput(val: mixed) {
      if (validKey(val)) return;

      if (Array.isArray(val)) {
        for (const item of val) walkInput(item);
      } else if (isPlainObject(val)) {
        const obj: {} = (val: any);
        for (const key of Object.keys(obj)) {
          walkInput(obj[key]);
        }
      } else {
        inputValues.add(val);
      }
    })(inputOptions);

    function walkOpts(val: mixed): CacheKey {
      if (validKey(val)) return buildCacheKey((val: any));

      if (Array.isArray(val)) {
        return buildCacheKey.obj(val.map(item => walkOpts(item)));
      } else if (isPlainObject(val)) {
        const obj: {} = (val: any);

        return buildCacheKey.obj(
          Object.keys(obj).reduce((acc, key) => {
            acc[key] = walkOpts(obj[key]);
            return acc;
          }, {}),
        );
      } else if (!inputValues.has(val) && !opts.cacheKey) {
        return buildCacheKey.error(
          `No cacheKey given by config. Configs with complex types like functions ` +
            `must have a 'cacheKey' value to be usable with Babel's caching plugins.`,
        );
      } else {
        // If this code is running, it means the user provided a cache key,
        // so we consider unknown values
        return "";
      }
    }

    function walkDescriptorList(items: PluginList): CacheKey {
      return buildCacheKey.obj(
        items.map(pair => {
          return Array.isArray(pair) ? walkOpts(pair[1]) : undefined;
        }),
      );
    }

    return (function walkRoot(obj: ValidatedOptions) {
      return buildCacheKey.obj(
        Object.keys(obj).reduce((acc, key) => {
          let val;
          if (key === "cacheKey" && opts.cacheKey) {
            val = opts.cacheKey;
          } else if (key === "plugins" && obj.plugins) {
            val = walkDescriptorList(obj.plugins);
          } else if (key === "presets" && obj.presets) {
            val = walkDescriptorList(obj.presets);
          } else if (key === "env" && obj.env) {
            val = buildCacheKey.obj(
              Object.keys(obj.env).reduce((acc, envName) => {
                acc[envName] =
                  obj.env && obj.env[envName]
                    ? walkRoot(obj.env[envName])
                    : undefined;
                return acc;
              }, {}),
            );
          } else {
            val = walkOpts(obj[key]);
          }
          acc[key] = val;
          return acc;
        }, {}),
      );
    })(opts);
  });
}
