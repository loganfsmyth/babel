// @flow

import defaults from "lodash/defaults";
import outputFileSync from "output-file-sync";
import { sync as mkdirpSync } from "mkdirp";
import slash from "slash";
import path from "path";
import fs from "fs";

import * as util from "./util";
import type { Options } from "./options";

export default async function({ cliOptions, babelOptions }: Options) {
  const { filenames, outDir } = cliOptions;

  if (typeof outDir !== "string") {
    throw new Error("Assertion failure - outDir expected a string");
  }

  async function write(src: string, base: string): Promise<boolean> {
    let relative = path.relative(base, src);

    if (!util.isCompilableExtension(relative, cliOptions.extensions)) {
      return false;
    }

    // remove extension and then append back on .js
    relative = util.adjustRelative(relative, cliOptions.keepFileExtension);

    const dest = getDest(relative, base);

    try {
      const res = await util.compile(
        src,
        defaults(
          {
            sourceFileName: slash(path.relative(dest + "/..", src)),
          },
          babelOptions,
        ),
      );

      if (!res) return false;

      let code = res.code;
      const map = res.map;

      if (typeof code !== "string") {
        throw new Error("Assertion failure - code:string expected");
      }

      // we've requested explicit sourcemaps to be written to disk
      if (
        map &&
        babelOptions.sourceMaps &&
        babelOptions.sourceMaps !== "inline"
      ) {
        const mapLoc = dest + ".map";
        code = util.addSourceMappingUrl(code, mapLoc);
        map.file = path.basename(relative);
        outputFileSync(mapLoc, JSON.stringify(map));
      }

      outputFileSync(dest, code);
      util.chmod(src, dest);

      if (cliOptions.verbose) {
        console.log(src + " -> " + dest);
      }

      return true;
    } catch (err) {
      if (cliOptions.watch) {
        console.error(err);
        return false;
      }

      throw err;
    }
  }

  function getDest(filename: string, base: string): string {
    if (cliOptions.relative) {
      return path.join(base, outDir, filename);
    }
    return path.join(outDir, filename);
  }

  async function handleFile(src: string, base: string) {
    const written = await write(src, base);

    if (!written && cliOptions.copyFiles) {
      const filename = path.relative(base, src);
      const dest = getDest(filename, base);
      outputFileSync(dest, fs.readFileSync(src, "utf8"));
      util.chmod(src, dest);
    }
    return written;
  }

  async function handle(filenameOrDir: string) {
    if (!fs.existsSync(filenameOrDir)) return 0;

    const stat = fs.statSync(filenameOrDir);

    if (stat.isDirectory()) {
      const dirname = filenameOrDir;

      let count = 0;

      const files = util.readdir(dirname, cliOptions.includeDotfiles);
      for (const filename of files) {
        const src = path.join(dirname, filename);

        const written = await handleFile(src, dirname);
        if (written) count += 1;
      }

      return count;
    } else {
      const filename = filenameOrDir;
      const written = await handleFile(filename, path.dirname(filename));

      return written ? 1 : 0;
    }
  }

  if (!cliOptions.skipInitialBuild) {
    if (cliOptions.deleteDirOnStart) {
      util.deleteDir(outDir);
    }

    mkdirpSync(outDir);

    let compiledFiles = 0;
    for (const filename of cliOptions.filenames) {
      compiledFiles += await handle(filename);
    }

    console.log(
      `Successfully compiled ${compiledFiles} ${
        compiledFiles !== 1 ? "files" : "file"
      } with Babel.`,
    );
  }

  if (cliOptions.watch) {
    const chokidar = util.requireChokidar();

    filenames.forEach(function(filenameOrDir) {
      const watcher = chokidar.watch(filenameOrDir, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 10,
        },
      });

      function handleEvent(filename: string) {
        handleFile(
          filename,
          filename === filenameOrDir
            ? path.dirname(filenameOrDir)
            : filenameOrDir,
        ).catch(err => {
          console.error(err);
        });
      }
      watcher.on("add", handleEvent);
      watcher.on("change", handleEvent);
    });
  }
}
