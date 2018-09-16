// @flow

import typeof * as ChokidarNamespace from "chokidar";
import readdirRecursive from "fs-readdir-recursive";
import * as babel from "@babel/core";
import includes from "lodash/includes";
import path from "path";
import fs from "fs";

export function chmod(src: string, dest: string): void {
  fs.chmodSync(dest, fs.statSync(src).mode);
}

export function readdir(
  dirname: string,
  includeDotfiles?: boolean,
  filter?: (filename: string) => boolean,
): Array<string> {
  return readdirRecursive(dirname, (filename, _index, currentDirectory) => {
    const stat = fs.statSync(path.join(currentDirectory, filename));

    if (stat.isDirectory()) return true;

    return (
      (includeDotfiles || filename[0] !== ".") && (!filter || filter(filename))
    );
  });
}

export function readdirForCompilable(
  dirname: string,
  includeDotfiles?: boolean,
): Array<string> {
  return readdir(dirname, includeDotfiles, isCompilableExtension);
}

/**
 * Test if a filename ends with a compilable extension.
 */
export function isCompilableExtension(
  filename: string,
  altExts?: Array<string>,
): boolean {
  const exts = altExts || babel.DEFAULT_EXTENSIONS;
  const ext = path.extname(filename);
  return includes(exts, ext);
}

export function addSourceMappingUrl(code: string, loc: string): string {
  return code + "\n//# sourceMappingURL=" + path.basename(loc);
}

const CALLER = {
  name: "@babel/cli",
};

export function transform(
  filename: string | void,
  code: string,
  opts: babel.Options,
): Promise<babel.TransformResult | null> {
  return babel.transformAsync(code, {
    ...opts,
    caller: CALLER,
    filename,
  });
}

export function compile(
  filename: string,
  opts: babel.Options,
): Promise<babel.TransformResult | null> {
  return babel.transformFileAsync(filename, {
    ...opts,
    caller: CALLER,
  });
}

export function deleteDir(path: string): void {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file) {
      const curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteDir(curPath);
      } else {
        // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

export function requireChokidar(): ChokidarNamespace {
  try {
    return (require("chokidar"): any);
  } catch (err) {
    console.error(
      "The optional dependency chokidar failed to install and is required for " +
        "--watch. Chokidar is likely not supported on your platform.",
    );
    throw err;
  }
}

export function adjustRelative(
  relative: string,
  keepFileExtension?: boolean,
): string {
  if (keepFileExtension) {
    return relative;
  }
  return relative.replace(/\.(\w*?)$/, "") + ".js";
}
