import slice from "lodash/slice";
import { Children } from "./children";

const CACHE = new Map();

export default function cachedCompile(selector) {
  if (!CACHE.has(selector)) CACHE.set(selector, compile(selector));

  return CACHE.get(selector);
}

function compile(selector) {
  for (const [query, fn] of QUERIES) {
    const match = selector.match(query);
    if (match) return fn(slice(match, 1));
  }

  throw new Error(`Invalid selector ${selector}`);
}

const QUERIES = new Map([
  /**
   * Support queries of the form "NodeType" to search for all children with a given type.
   */
  [/^([A-Z][a-zA-Z]*)$/, ([type]) => (node, rootNode, props) => {
    const props2 = Children(node, type).map(r => r.path);
    console.log(type, props2);

    return props2;
  }],

  /**
   * Support queries of the form "> prop[NodeType]" to search for all children with a given type in a prop.
   */
  [/^> ([a-z]+)\(([A-Z][a-zA-Z]*)\)$/, ([prop, type]) => (node, rootNode, props) => {
    return node[prop].filter(node => node.type === type)
  }],

  /**
   * Support queries of the form "> prop(NodeType)" to search for all children with a given type in a prop.
   */
  [/^([A-Z][a-zA-Z]*) ([a-z]+)\(([A-Z][a-zA-Z]*)?\)$/, ([type, prop, childType]) => (node, rootNode, props) => {
    const children = Children(node, type);

    return children.map((childPath) => {
      // const result
    });
    return resolvePath(ast, path)[prop].filter(node => node.type === type)
  }],
]);

function resolvePath(ast, path) {
  return path.resolve((node, key) => node[key], ast);
}
