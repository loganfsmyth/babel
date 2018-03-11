// @flow

export { default as File } from "./transformation/file/file";
export {
  default as buildExternalHelpers,
} from "./tools/build-external-helpers";
export { resolvePlugin, resolvePreset } from "./config/files";

export { version } from "../package.json";
export { getEnv } from "./config/helpers/environment";

export * as types from "@babel/types";
export { default as traverse } from "@babel/traverse";
export { default as template } from "@babel/template";

export { createConfigItem } from "./config/item";

export { loadPartialConfig, loadOptions } from "./config";

export { transform, transformSync, transformAsync } from "./transform";
export {
  transformFile,
  transformFileSync,
  transformFileAsync,
} from "./transform-file";
export {
  transformFromAst,
  transformFromAstSync,
  transformFromAstAsync,
} from "./transform-ast";
export { parse, parseSync, parseAsync } from "./parse";

/**
 * Recommended set of compilable extensions. Not used in @babel/core directly, but meant as
 * as an easy source for tooling making use of @babel/core.
 *
 * Unless you really _need_ to have an explicit list of extensions, it is
 * recommended that you simply call Babel, and if it returns `null`, continue
 * with whatever default behavior you'd normally do with that file.
 */
export { DEFAULT_EXTENSIONS } from "./config";

// For easier backward-compatibility, provide an API like the one we exposed in Babel 6.
import { loadOptions } from "./config";
export class OptionManager {
  init(opts: {}) {
    return loadOptions(opts);
  }
}

export function Plugin(alias: string) {
  throw new Error(
    `The (${alias}) Babel 5 plugin is being run with an unsupported Babel version.`,
  );
}
