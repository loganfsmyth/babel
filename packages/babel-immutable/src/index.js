// @flow

import assert from "assert";

import Tree from "./tree";
import type {Node} from "./tree";
import TraversalPath from "./path";

export {TraversalPath};

export default function enter<T: TraversalPath>(ast: Node, callback: (path: T) => void, constr?: Class<T>) {
  const Traversal = constr || TraversalPath;

  assert(Traversal === TraversalPath || Traversal.prototype instanceof TraversalPath, "Invalid traversal wrapper function");

  const tree = new Tree(ast);
  tree.context(() => {
    const path = tree.path([]);
    callback(new Traversal(path));
  });
  return tree.root();
}
