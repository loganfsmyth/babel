#!/usr/bin/env node
// @flow

import parseArgv from "./options";
import dirCommand from "./dir";
import fileCommand from "./file";

const opts = parseArgv(process.argv);

const fn = opts.cliOptions.outDir ? dirCommand : fileCommand;
fn(opts).catch(error);
process.on("uncaughtException", error);

function error(err) {
  let code = 1;
  if (typeof err === "number") {
    code = err;
  } else {
    console.error(err);
  }
  process.exit(code);
}
