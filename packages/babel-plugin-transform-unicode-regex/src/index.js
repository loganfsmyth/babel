import rewritePattern from "regexpu-core";
import * as regex from "@babel/helper-regex";
import CACHE_KEY from "./_cache-key";

export { CACHE_KEY };

export default function() {
  return {
    cacheKey: CACHE_KEY,
    cached: {
      // Use a cached wrapper because it is possible that 'regexpu-core' will
      // have changed versions between Babel executions, and CACHE_KEY has
      // no way to take that into account.
      rewritePattern(pattern, flags) {
        return rewritePattern(pattern, flags);
      },
    },
    visitor: {
      RegExpLiteral({ node }) {
        if (!regex.is(node, "u")) return;
        node.pattern = this.cached.rewritePattern(node.pattern, node.flags);
        regex.pullFlag(node, "u");
      },
    },
  };
}
