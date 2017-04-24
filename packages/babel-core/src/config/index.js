// @flow

import type Plugin from "./plugin";
import manageOptions from "./option-manager";

export type ResolvedConfig = {
  options: Object,
  passes: Array<Array<[ Plugin, ?{} ]>>,
};

/**
 * Standard API for loading Babel configuration data. Not for public consumption.
 */
export default function loadConfig(opts: mixed, staticOpts?: mixed): ResolvedConfig|null {
  if (opts != null && typeof opts !== "object") {
    throw new Error("Babel options must be an object, null, or undefined");
  }
  if (staticOpts != null && typeof staticOpts !== "object") {
    throw new Error("Babel static options must be an object, null, or undefined");
  }

  return manageOptions(opts || {}, staticOpts);
}
