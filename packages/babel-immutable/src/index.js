// @flow

import Tree from "./ast";
import type {Reference, Position} from "./ast";

import {version as VERSION} from "../package.json";

type Node = {
  +type: string,
  [val: string]: any,
};
type PathContext<+T: TraversalPath> = Array<T>;
type NodePlaceholder = Node | TraversalPath | null;
type RefPlaceholder = Node | Reference | null;
type NullablePathList<+T: TraversalPath> = Array<T | null>;

export default class TraversalPath {
  _ref: Reference;
  _context: PathContext<TraversalPath>;

  baseVersion = VERSION;

  static create(root: Node): this {
    const tree = new Tree(root);
    return new this(tree.ref([]));
  }

  static context(root: Node, callback: (path: this) => void): Node {
    const path = this.create(root);
    path.context(callback);
    return path.node();
  }

  /**
   * This constructor should essentially be treated as private, and classes subclassing this
   * should pass these values through treating them as opaque arguments.
   */
  constructor(ref: Reference, context: PathContext<TraversalPath> = []) {
    this._ref = ref;
    this._context = context;
    Object.freeze(this);
  }

  /**
   * Enter into a context in this path, where all paths created during the synchronous execution
   * of this callback will automatically have '.destroy()' called on them when the callback
   * completes.
   *
   * This method is meant to allow for fine-grained control of how many TraversalPath objects
   * have to be tracked as the AST is mutated, allowing for less background work.
   */
  context<U: any>(callback: (path: this) => U): U {
    const length = this._context.length;

    const result = callback(this);

    for (let i = length; i < this._context.length; i++) {
      const path = this._context[i];
      if (path._context === this._context) path.destroy();
    }
    this._context.length = length;

    return result;
  }

  contains(path: TraversalPath): boolean {
    return this._ref.contains(path._ref);
  }

  destroy(): void {
    this._ref.deref();
  }

  clone(inNewContext: boolean = false): this {
    return createPath(this, new Tree(this.node()).ref([]), inNewContext);
  }

  node(): Node {
    return this._ref.get();
  }

  path(position: Position): this | null {
    return wrapRef(this, this._ref.child(position));
  }

  get(prop: string): any {
    const child = this._ref.child([prop]);
    const result = child.get();
    child.deref();
    return result;
  }

  set(prop: string, value: any): void {
    const child = this._ref.child([prop]);
    child.set(unwrapPath(value)).deref();
    child.deref();
  }

  parent(): {+parent: this, prop: string, index: number | null} | null {
    const parent = this._ref.parent();
    if (!parent) return null;

    if (Array.isArray(parent.ref.get())) {
      const arrayParent = parent.ref.parent();
      parent.ref.deref();
      if (!arrayParent) return null;

      return {
        parent: createPath(this, arrayParent.ref),
        prop: String(arrayParent.prop),
        index: +parent.prop,
      };
    }

    return {
      parent: createPath(this, parent.ref),
      prop: String(parent.prop),
      index: null,
    };
  }

  child(prop: string): this | null {
    return wrapRef(this, this._ref.child([prop]));
  }

  children(prop: string): NullablePathList<this> {
    const child = this._ref.child([prop]);
    const children: Array<Node> = child.get() || [];
    child.deref();

    return children.map((child, i) => this.at(prop, i));
  }

  at(prop: string, index: number): this | null {
    return wrapRef(this, this._ref.child([prop, index]));
  }

  setChild(prop: string, replacement: NodePlaceholder): this | null {
    const child = this._ref.child([prop]);
    const result = wrapRef(this, child.set(unwrapPath(replacement)));
    child.deref();
    return result;
  }

  setChildren(prop: string, replacement: Array<NodePlaceholder>): NullablePathList<this> {
    const child = this._ref.child([prop]);
    const ref = child.set(unwrapPaths(replacement));

    const result = ref.get().map((item, i) => this.at(prop, i));
    child.deref();
    ref.deref();
    return result;
  }

  remove(): void {
    this._ref.remove();
  }

  replaceWith(replacement: NodePlaceholder): this | null {
    return wrapRef(this, this._ref.set(unwrapPath(replacement)));
  }

  insertBefore(replacement: NodePlaceholder): this | null {
    return this.insertBeforeMultiple([replacement])[0];
  }

  insertAfter(replacement: NodePlaceholder): this | null {
    return this.insertAfterMultiple([replacement])[0];
  }

  insertStart(prop: string, replacement: NodePlaceholder): this | null {
    return this.insertStartMultiple(prop, [replacement])[0];
  }

  insertEnd(prop: string, replacement: NodePlaceholder): this | null {
    return this.insertEndMultiple(prop, [replacement])[0];
  }

  insert(prop: string, index: number = Infinity, replacement: NodePlaceholder): this | null {
    return this.insertMultiple(prop, index, [replacement])[0];
  }

  replaceWithMultiple(replacement: Array<NodePlaceholder>): NullablePathList<this> {
    const result = this.insertAfterMultiple(replacement);
    this.remove();
    return result;
  }

  insertBeforeMultiple(replacement: Array<NodePlaceholder>): NullablePathList<this> {
    const parent = this.parent();
    if (!parent) throw new Error("Cannot insert before node with no parent");

    return parent.parent.insertMultiple(parent.prop, +parent.index, replacement);
  }

  insertAfterMultiple(replacement: Array<NodePlaceholder>): NullablePathList<this> {
    const parent = this.parent();
    if (!parent) throw new Error("Cannot insert before node with no parent");

    return parent.parent.insertMultiple(parent.prop, parent.index + 1, replacement);
  }

  insertStartMultiple(prop: string, replacement: Array<NodePlaceholder>): NullablePathList<this> {
    return this.insertMultiple(prop, 0, replacement);
  }

  insertEndMultiple(prop: string, replacement: Array<NodePlaceholder>): NullablePathList<this> {
    return this.insertMultiple(prop, Infinity, replacement);
  }

  insertMultiple(prop: string, index: number = Infinity, replacement: Array<NodePlaceholder>): NullablePathList<this> {
    const child = this._ref.child([prop]);

    const array = child.get();
    child.deref();

    if (!Array.isArray(array)) throw new Error("Unable to insert into non-array");
    if (index === Infinity) index = array.length;

    const target = this._ref.child([prop, index]);
    const refs = target.insert(unwrapPaths(replacement)).map((ref) => wrapRef(this, ref));
    target.deref();
    return refs;
  }
}
Object.freeze(TraversalPath);
Object.freeze(TraversalPath.prototype);

function createPath<T: TraversalPath>(path: T, ref: Reference, inNewContext: boolean = false): T {
  return new path.constructor(ref, inNewContext ? undefined : path._context);
}

function unwrapPath(input: NodePlaceholder): RefPlaceholder {
  return input instanceof TraversalPath ? input._ref : input;
}

function unwrapPaths(input: Array<NodePlaceholder>): Array<RefPlaceholder> {
  return input.map(unwrapPath);
}

function wrapRef<T: TraversalPath>(path: T, ref: Reference): T | null {
  const val = ref.get();

  if (!val || !val.type) {
    ref.deref();
    return null;
  }

  return createPath(path, ref);
}
