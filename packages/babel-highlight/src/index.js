// @flow

import jsTokens, { matchToToken } from "js-tokens";
import esutils from "esutils";
import chalk, { type Chalk } from "chalk";

/**
 * Chalk styles for token types.
 */
function getDefs(ch: Chalk) {
  return {
    keyword: ch.cyan,
    capitalized: ch.yellow,
    jsx_tag: ch.yellow,
    punctuator: ch.yellow,
    // bracket:  intentionally omitted.
    number: ch.magenta,
    string: ch.green,
    regex: ch.magenta,
    comment: ch.grey,
    invalid: ch.white.bgRed.bold,
  };
}

/**
 * RegExp to test for newlines in terminal.
 */
const NEWLINE = /\r\n|[\n\r\u2028\u2029]/;

/**
 * RegExp to test for what seems to be a JSX tag name.
 */
const JSX_TAG = /^[a-z][\w-]*$/i;

/**
 * RegExp to test for the three types of brackets.
 */
const BRACKET = /^[()[\]{}]$/;

/**
 * Get the type of token, specifying punctuator type.
 */
function getTokenType(match: Array<mixed>) {
  const items = match.slice(-2);
  const offset = items[0];
  const text = items[1];
  if (typeof offset !== "number") {
    throw new Error("Assertion failure - expected number");
  }
  if (typeof text !== "string") {
    throw new Error("Assertion failure - expected string");
  }

  const token = matchToToken(
    Array.from(match, item => {
      if (typeof item !== "string") {
        throw new Error("Assertion failure - expected string");
      }
      return item;
    }),
  );

  if (token.type === "name") {
    if (esutils.keyword.isReservedWordES6(token.value)) {
      return "keyword";
    }

    if (
      JSX_TAG.test(token.value) &&
      (text[offset - 1] === "<" || text.substr(offset - 2, 2) == "</")
    ) {
      return "jsx_tag";
    }

    if (token.value[0] !== token.value[0].toLowerCase()) {
      return "capitalized";
    }
  }

  if (token.type === "punctuator" && BRACKET.test(token.value)) {
    return "bracket";
  }

  if (
    token.type === "invalid" &&
    (token.value === "@" || token.value === "#")
  ) {
    return "punctuator";
  }

  return token.type;
}

/**
 * Highlight `text` using the token definitions in `defs`.
 */
function highlightTokens(defs: { [string]: Chalk }, text: string) {
  return text.replace(jsTokens, function(...args: Array<mixed>) {
    const type = getTokenType(args);
    const str = args[0];
    if (typeof str !== "string") throw new Error("");

    const colorize = defs[type];
    if (colorize) {
      return str
        .split(NEWLINE)
        .map(str => colorize(str))
        .join("\n");
    }
    return str;
  });
}

type Options = {
  forceColor?: boolean,
};

export type { Chalk };

/**
 * Whether the code should be highlighted given the passed options.
 */
export function shouldHighlight(options: Options): boolean {
  return !!chalk.supportsColor || !!options.forceColor;
}

/**
 * The Chalk instance that should be used given the passed options.
 */
export function getChalk(options: Options): Chalk {
  if (options.forceColor) {
    return new chalk.constructor({ enabled: true, level: 1 });
  }
  return chalk;
}

/**
 * Highlight `code`.
 */
export default function highlight(code: string, options: Options = {}): string {
  if (shouldHighlight(options)) {
    const chalk = getChalk(options);
    const defs = getDefs(chalk);
    return highlightTokens(defs, code);
  } else {
    return code;
  }
}
