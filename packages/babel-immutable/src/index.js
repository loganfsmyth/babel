// @flow

import assert from "assert";

import * as tree from "./tree";
import run from "./context";
import type {Path} from "./tree";
import type {Node} from "./node";

import * as position from "./position";

export default function enter<T: TraversalPath>(ast: Node, callback: (path: T) => void, constr?: Class<T>) {
  const Traversal = constr || TraversalPath;

  assert(Traversal === TraversalPath || Traversal.prototype instanceof TraversalPath, "Invalid traversal wrapper function");

  const root = create(ast);
  run(root.context, () => callback(new Traversal(path(root, []))));
  return root.root;
}


import VERSION from "./version";

type NodeOrWrapper = Node|TraversalPath;
type PathList<+TPath> = Array<TPath>;
type ASTValue = Array<Node>|Node|string|number|null;

export class TraversalPath {
  _path: Path;

  // Expose the path version so libraries can validate it with semver if they want.
  version: string = VERSION;

  constructor(path: Path) {
    this._path = path;
  }

  node(): Node {
    return tree.get(this._path);
  }

  root(): this {
    return this._createPath(tree.createResolvablePath(this._path.root, []));
  }

  active() {
    return !!this._path.root;
  }

  clone(): this {
    const node = this.node();
    const root = tree.createRoot(node, this._path.root);

    return this._createPath(tree.createResolvedPath(root, [], node));
  }

  context<U>(cb: () => U): U {
    return tree.runInContext(this._path.root.context, cb);
  }

  parent(): { +parent: this, prop: string, index: number | null } | null {
    const result = tree.parent(this._path);
    if (!result) return null;

    return {
      parent: this._createPath(result.parent),
      prop: result.prop,
      index: result.index,
    };
  }

  /**
   * Build a path
   */
  path(target: string|Array<string|number>): this | null {
    if (!Array.isArray(target)) {
      target = target.split(".").map((part) => {
        if (part == "" + +part) return +part;
        return part;
      });
    }

    const node = tree.resolveNode(this._path.root, tree.position(this._path, target));

    return node ? this._createPath(path) : null;
  }

  /**
   * Get a value from the underlying AST.
   */
  get(prop: string): ASTValue {
    return tree.get(this._path, prop);
  }

  /**
   * Assign a new value in the AST.
   */
  set(prop: string, value: ASTValue): void {
    tree.set(this._path, prop, value);
  }

  /**
   * Get an individual array child element.
   */
  at(prop: string, index: number) {
    const child = position.child(this._path.position, prop, index);

    return this._createPath(tree.path(this._path, child));
  }

  /**
   * Get a path referencing the child.
   */
  child(prop: string): this | null {
    assertActive(this._path);

    const path = this._path.tree.path(this._path.position.concat(prop));
    const node = this._path.tree.get(path);

    return node ? this._createPath(path) : null;
  }

  /**
   * Replace a child with a new node.
   */
  setChild(prop: string, child: NodeOrWrapper): this {
    this._path.tree.set(this._path, prop, unwrapNode(child));

    return this._createPath(this._path.tree.path(this._path.position.concat(prop)));
  }

  /**
   * Get an list of all of the children.
   */
  children(prop: string): PathList<this> | null {
    assertActive(this._path);

    const nodes = this._path.tree.get(this._path, prop);

    return nodes ? nodes.map((node, i) => {
      const path = this._path.tree.path(this._path.position.concat(prop, i), node);
      return this._createPath(path);
    }) : null;
  }

  /**
   * Replace the full set of children of a specific path.
   */
  setChildren(prop: string, children: Array<NodeOrWrapper>): PathList<this> {
    assertActive(this._path);

    const nodes = unwrapChildren(children);

    this._path.tree.set(this._path, prop, nodes);

    return nodes.map((node, i) => {
      const path = this._path.tree.path(this._path.position.concat(prop, i), node);
      return this._createPath(path);
    });
  }

  /**
   * Remove the referenced node and invalidat the path.
   */
  remove(): void {
    const {parent, prop, index} = this.parent();

    if (index === null) {
      this._path.tree.set(parent._path, prop, null);
    } else {
      this._path.tree.remove(parent._path, prop, index);
    }
  }

  /**
   * Replaces the node referenced by this path with a new node, without invalidating the path.
   */
  replaceWith(replacement: NodeOrWrapper): this {
    this._path.tree.set(this._path, null, unwrapNode(replacement));

    // Leave this current path active since it can still point to the new value
    (this._path: any).active = true;

    return this;
  }

  /**
   * Insert a node new at a given position.
   */
  insertAt(prop: string, index: number, toInsert: NodeOrWrapper): this {
    return this.insertMultipleAt(prop, index, [toInsert])[0];
  }

  /**
   * Insert a node just before the current node.
   */
  insertBefore(toInsert: NodeOrWrapper): this {
    return this.insertBeforeMultiple([toInsert])[0];
  }

  /**
   * Insert a node just after the current node.
   */
  insertAfter(toInsert: NodeOrWrapper): this {
    return this.insertAfterMultiple([toInsert])[0];
  }

  /**
   * Insert a node as the first child of the given property.
   */
  insertStart(prop: string, toInsert: NodeOrWrapper): this {
    return this.insertStartMultiple(prop, [toInsert])[0];
  }

  /**
   * Insert a node as the last child of the given property.
   */
  insertEnd(prop: string, toInsert: NodeOrWrapper): this {
    return this.insertEndMultiple(prop, [toInsert])[0];
  }

  /**
   * Replace a given node with multiple nodes, while invalidating the current path.
   */
  replaceWithMultiple(replacement: Array<NodeOrWrapper>): PathList<this> {
    const {parent, prop, index} = this.parent();
    if (index === null) throw new Error("Attempting to insert multiple items in non-array item.");

    this._path.tree.remove(this._path, prop, index);

    const nodes = unwrapChildren(replacement);
    const offset = this._path.tree.insert(parent._path, prop, index, nodes);

    return nodes.map((node, i) => this._createPath(this._path.tree.path(parent._path.position.concat(offset + i))));
  }

  /**
   * Insert multiple nodes a the given position.
   */
  insertMultipleAt(prop: string, index: number, toInsert: Array<NodeOrWrapper>): PathList<this> {
    return this._insertMultipleAt(prop, index, unwrapChildren(toInsert));
  }

  /**
   * Insert multiple nodes just before the current node.
   */
  insertBeforeMultiple(toInsert: Array<NodeOrWrapper>): PathList<this> {
    const {parent, prop, index} = this.parent();
    if (index === null) throw new Error("Attempting to insert before non-array node.");

    return parent._insertMultipleAt(prop, index, unwrapChildren(toInsert));
  }

  /**
   * Insert multiple nodes just after the current node.
   */
  insertAfterMultiple(toInsert: Array<NodeOrWrapper>): PathList<this> {
    const {parent, prop, index} = this.parent();
    if (index === null) throw new Error("Attempting to insert after non-array node.");

    return parent._insertMultipleAt(prop, index + 1, unwrapChildren(toInsert));
  }

  /**
   * Insert multiple nodes as the first children of the given node property.
   */
  insertStartMultiple(prop: string, toInsert: Array<NodeOrWrapper>): PathList<this> {
    return this._insertMultipleAt(prop, 0, unwrapChildren(toInsert));
  }

  /**
   * Insert multiple nodes as the last children of the given node property.
   */
  insertEndMultiple(prop: string, toInsert: Array<NodeOrWrapper>): PathList<this> {
    return this._insertMultipleAt(prop, Infinity, unwrapChildren(toInsert));
  }

  _insertMultipleAt(prop: string, index: number, nodes: Array<Node>): Array<TraversalPath> {
    assertActive(this._path);

    const offset = this._path.tree.insert(this._path, prop, index, nodes);

    return nodes.map((node, i) =>
      this._createPath(this._path.tree.path(this._path.position.concat(prop, offset + i), node)));
  }

  _createPath(path: Path): this {
    return new this.constructor(path);
  }
}
Object.freeze(TraversalPath);
Object.freeze(TraversalPath.prototype);

function getKnownPath(path: Path): KnownPath {
  if (!path.active) throw new Error();
  if (!path.position) throw new Error();

  return path;
}

function getAttachedPath(path: Path): AttachedPath {
  if (!path.active) throw new Error();

  return path;
}

function unwrapNode(node: NodeOrWrapper): Node {
  return node instanceof TraversalPath ? node.node() : node;
}

function unwrapChildren(children: Array<NodeOrWrapper>): Array<Node> {
  return children.map((child) => unwrapNode(child));
}
