import rewritePattern from "regexpu-core";
import * as regex from "@babel/helper-regex";
import CACHE_KEY from "./_cache-key";
export { CACHE_KEY };

export default function(api, options) {
  const { useUnicodeFlag = true } = options;
  if (typeof useUnicodeFlag !== "boolean") {
    throw new Error(".useUnicodeFlag must be a boolean, or undefined");
  }

  return {
    cacheKey: CACHE_KEY,
    cached: {
      // Use a cached wrapper because it is possible that 'regexpu-core' will
      // have changed versions between Babel executions, and CACHE_KEY has
      // no way to take that into account.
      rewritePattern(pattern, flags) {
        return rewritePattern(pattern, flags, {
          unicodePropertyEscape: true,
          useUnicodeFlag,
        });
      },
    },
    visitor: {
      RegExpLiteral(path) {
        const node = path.node;
        if (!regex.is(node, "u")) {
          return;
        }
        node.pattern = this.cached.rewritePattern(node.pattern, node.flags);
        if (!useUnicodeFlag) {
          regex.pullFlag(node, "u");
        }
      },
    },
  };
}
