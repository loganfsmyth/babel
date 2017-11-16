// @flow

import type { CacheKey } from "@babel/helper-caching";

export type ConfigFile = {
  filepath: string,
  dirname: string,
  options: {},
  inputKey: CacheKey,
  cacheKey: CacheKey | void,
};

// eslint-disable-next-line no-unused-vars
export function findConfigs(dirname: string): Array<ConfigFile> {
  return [];
}

export function loadConfig(name: string, dirname: string): ConfigFile {
  throw new Error(`Cannot load ${name} relative to ${dirname} in a browser`);
}

// eslint-disable-next-line no-unused-vars
export function resolvePlugin(name: string, dirname: string): string | null {
  return null;
}

// eslint-disable-next-line no-unused-vars
export function resolvePreset(name: string, dirname: string): string | null {
  return null;
}

export function loadPlugin(
  name: string,
  dirname: string,
): { filepath: string, value: mixed } {
  throw new Error(
    `Cannot load plugin ${name} relative to ${dirname} in a browser`,
  );
}

export function loadPreset(
  name: string,
  dirname: string,
): { filepath: string, value: mixed } {
  throw new Error(
    `Cannot load preset ${name} relative to ${dirname} in a browser`,
  );
}
