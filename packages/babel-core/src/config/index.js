// @flow

import type { CacheKey } from "@babel/helper-caching";
import type Plugin from "./plugin";
import manageOptions from "./option-manager";

export type { InputOptions } from "./options";

export type ResolvedConfig = {
  options: Object,
  passes: PluginPasses,
  cacheKey: CacheKey,
};

export type { Plugin };
export type PluginPassList = Array<Plugin>;
export type PluginPasses = Array<PluginPassList>;

/**
 * Standard API for loading Babel configuration data. Not for public consumption.
 */
export default function loadConfig(opts: mixed): ResolvedConfig | null {
  if (opts != null && (typeof opts !== "object" || Array.isArray(opts))) {
    throw new Error("Babel options must be an object, null, or undefined");
  }

  return manageOptions(opts || {});
}
