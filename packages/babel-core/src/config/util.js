// @flow

import type { ValidatedOptions } from "./validation/options";

export const DEFAULT_EXTENSIONS_MAP = {
  ".js": true,
  ".jsx": true,
  ".es6": true,
  ".es": true,
  ".mjs": true,

  // Including these two extensions so that Babel will try to process .ts
  // files. Unless the TS preset has been activated however, Babel will
  // still skip processing them. Without this, tooling like 'babel-register'
  // would have no way to know up front that `.ts` files might be something
  // it should care about.
  ".ts": false,
  ".tsx": false,
};

export const DEFAULT_EXTENSIONS = Object.freeze(
  Object.keys(DEFAULT_EXTENSIONS_MAP),
);

export function mergeOptions(
  target: ValidatedOptions,
  source: ValidatedOptions,
): void {
  for (const k of Object.keys(source)) {
    if (k === "parserOpts" && source.parserOpts) {
      const parserOpts = source.parserOpts;
      const targetObj = (target.parserOpts = target.parserOpts || {});
      mergeDefaultFields(targetObj, parserOpts);
    } else if (k === "generatorOpts" && source.generatorOpts) {
      const generatorOpts = source.generatorOpts;
      const targetObj = (target.generatorOpts = target.generatorOpts || {});
      mergeDefaultFields(targetObj, generatorOpts);
    } else if (k === "extensions" && source.extensions) {
      const extensions = source.extensions;
      const targetObj = (target.extensions = target.extensions || {});
      mergeDefaultFields(targetObj, extensions);
    } else {
      const val = source[k];
      if (val !== undefined) target[k] = (val: any);
    }
  }
}

function mergeDefaultFields<T: {}>(target: T, source: T) {
  for (const k of Object.keys(source)) {
    const val = source[k];
    if (val !== undefined) target[k] = (val: any);
  }
}
