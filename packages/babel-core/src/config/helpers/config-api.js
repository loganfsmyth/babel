// @flow
import { validKey } from "@babel/helper-caching";

import type { CacheConfigurator } from "../caching";

export type SimpleCacheConfigurator = SimpleCacheConfiguratorFn &
  SimpleCacheConfiguratorObj;

type SimpleCacheConfiguratorFn = {
  (boolean): void,
  <T>(handler: () => T): T,
};
type SimpleCacheConfiguratorObj = {
  forever: () => void,
  never: () => void,
  using: <T>(handler: () => T) => T,
  invalidate: <T>(handler: () => T) => T,
};

type EnvFunction = {
  (): string,
  <T>((string) => T): T,
  (string): boolean,
  (Array<string>): boolean,
};

export type PluginAPI = {
  cache: SimpleCacheConfigurator,
  env: EnvFunction,
  async: () => boolean,
};

export default function makeAPI(
  cache: CacheConfigurator<{ envName: string }>,
): PluginAPI {
  const env: any = value =>
    cache.using(data => {
      if (typeof value === "undefined") return data.envName;
      if (typeof value === "function") return value(data.envName);
      if (!Array.isArray(value)) value = [value];

      return value.some(entry => {
        if (typeof entry !== "string") {
          throw new Error("Unexpected non-string value");
        }
        return entry === data.envName;
      });
    });

  return {
    cache: makeSimpleConfigurator(cache),
    // Expose ".env()" so people can easily get the same env that we expose using the "env" key.
    env,
    async: () => false,
  };
}

function makeSimpleConfigurator(
  cache: CacheConfigurator<any>,
): SimpleCacheConfigurator {
  function cacheFn(val) {
    if (typeof val === "boolean") {
      if (val) cache.forever();
      else cache.never();
      return;
    }

    return cache.using(val);
  }
  cacheFn.forever = () => cache.forever();
  cacheFn.never = () => cache.never();
  cacheFn.using = cb => {
    const val = cache.using(() => cb());
    assertValidKey(val);
    return val;
  };
  cacheFn.invalidate = cb => {
    const val = cache.invalidate(() => cb());
    assertValidKey(val);
    return val;
  };

  return (cacheFn: any);
}

function assertValidKey(key: mixed): void {
  if (!validKey(key)) {
    throw new Error(
      `Values must be primitives, or have meaningful toString implementations for caching`,
    );
  }
}
