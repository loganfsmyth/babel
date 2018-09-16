// @flow

import commander from "commander";
import { buildExternalHelpers } from "@babel/core";

function collect(value: string, previousValue: Array<string>): Array<string> {
  // If the user passed the option with no value, like "babel file.js --presets", do nothing.
  if (typeof value !== "string") return previousValue;

  const values = value.split(",");

  return previousValue ? previousValue.concat(values) : values;
}

commander.option(
  "-l, --whitelist [whitelist]",
  "Whitelist of helpers to ONLY include",
  collect,
);
commander.option(
  "-t, --output-type [type]",
  "Type of output (global|umd|var)",
  "global",
);

commander.usage("[options]");
commander.parse(process.argv);

const opts: Object = commander.opts();
const whitelist: Array<string> = opts.whitelist;
const outputType: any = opts.outputType;

console.log(buildExternalHelpers(whitelist, outputType));
