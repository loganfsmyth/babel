// @flow

import Tree from "./ast";
import type {Reference, Position} from "./ast";

export type {Reference};

import {version as VERSION} from "../package.json";

type PathContext<+T> = Array<T>;
type NodePlaceholder<Node> = Node | TraversalPath<Node> | null;
type NullablePathList<+T> = Array<T | null>;

export default class TraversalPath<Node: Object> {
  _ref: Reference;
  _context: PathContext<TraversalPath<Node>>;

  baseVersion = VERSION;

  static create(root: Node): this {
    const tree = new Tree(root);
    return new this(tree.ref([]));
  }

  static context(root: Node, callback: (path: this) => void): Node {
    const tree = new Tree(root);
    const path = new this(tree.ref([]));
    path.context(callback);
    path.destroy();

    if (!tree.empty()) {
      // TODO: This is probably better as a dev assertion?
      throw new Error("Failed to clean up all tree references. This is likely a Babel bug.");
    }
    return tree.root();
  }

  /**
   * This constructor should essentially be treated as private, and classes subclassing this
   * should pass these values through treating them as opaque arguments.
   */
  constructor(ref: Reference, context: PathContext<TraversalPath<Node>> = []) {
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

  contains(path: TraversalPath<Node>): boolean {
    return this._ref.contains(path._ref);
  }

  same(path: TraversalPath<Node>): boolean {
    return this._ref === path._ref;
  }

  destroy(): void {
    this._ref.deref();
  }

  clone(inNewContext: boolean = false): this {
    if (inNewContext) return this.constructor.create(this.node());

    return this._createPath(this._ref.clone());
  }

  node(): Node {
    return this._ref.get();
  }

  path(position: Position): this | null {
    return this._wrapRef(this._ref.child(position));
  }

  get(prop: string): any {
    const child = this._ref.child([prop]);
    const result = child.get();
    child.deref();
    return result;
  }

  set(prop: string, value: any): void {
    if (value instanceof TraversalPath) throw new Error(".set() used with non-AST value");

    const child = this._ref.child([prop]);
    child.set(value).deref();
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
        parent: this._createPath(arrayParent.ref),
        prop: String(arrayParent.prop),
        index: +parent.prop,
      };
    }

    return {
      parent: this._createPath(parent.ref),
      prop: String(parent.prop),
      index: null,
    };
  }

  child(prop: string): this | null {
    return this._wrapRef(this._ref.child([prop]));
  }

  children(prop: string): NullablePathList<this> {
    const child = this._ref.child([prop]);
    const children: Array<Node> = child.get() || [];
    child.deref();

    return children.map((child, i) => this.at(prop, i));
  }

  at(prop: string, index: number): this | null {
    return this._wrapRef(this._ref.child([prop, index]));
  }

  setChild(prop: string, replacement: NodePlaceholder<Node>): this | null {
    const child = this._ref.child([prop]);
    const result = this._wrapRef(child.set(this._unwrapPath(replacement)));
    child.deref();
    return result;
  }

  setChildren(prop: string, replacement: Array<NodePlaceholder<Node>>): NullablePathList<this> {
    const child = this._ref.child([prop]);
    const ref = child.set(this._unwrapPaths(replacement));

    const result = ref.get().map((item, i) => this.at(prop, i));
    child.deref();
    ref.deref();
    return result;
  }

  remove(): void {
    this._onRemove(this._ref);
  }

  replaceWith(replacement: NodePlaceholder<Node>): this | null {
    return this._wrapRef(this._onReplace(this._ref, this._unwrapPath(replacement)));
  }

  insertBefore(replacement: NodePlaceholder<Node>): this | null {
    return this.insertBeforeMultiple([replacement])[0];
  }

  insertAfter(replacement: NodePlaceholder<Node>): this | null {
    return this.insertAfterMultiple([replacement])[0];
  }

  insertStart(prop: string, replacement: NodePlaceholder<Node>): this | null {
    return this.insertStartMultiple(prop, [replacement])[0];
  }

  insertEnd(prop: string, replacement: NodePlaceholder<Node>): this | null {
    return this.insertEndMultiple(prop, [replacement])[0];
  }

  insert(prop: string, index: number = Infinity, replacement: NodePlaceholder<Node>): this | null {
    return this.insertMultiple(prop, index, [replacement])[0];
  }

  replaceWithMultiple(replacement: Array<NodePlaceholder<Node>>): NullablePathList<this> {
    const result = this.insertAfterMultiple(replacement);
    this.remove();
    return result;
  }

  insertBeforeMultiple(replacement: Array<NodePlaceholder<Node>>): NullablePathList<this> {
    const parent = this.parent();
    if (!parent) throw new Error("Cannot insert before node with no parent");

    return parent.parent.insertMultiple(parent.prop, +parent.index, replacement);
  }

  insertAfterMultiple(replacement: Array<NodePlaceholder<Node>>): NullablePathList<this> {
    const parent = this.parent();
    if (!parent) throw new Error("Cannot insert before node with no parent");

    return parent.parent.insertMultiple(parent.prop, parent.index + 1, replacement);
  }

  insertStartMultiple(prop: string, replacement: Array<NodePlaceholder<Node>>): NullablePathList<this> {
    return this.insertMultiple(prop, 0, replacement);
  }

  insertEndMultiple(prop: string, replacement: Array<NodePlaceholder<Node>>): NullablePathList<this> {
    return this.insertMultiple(prop, Infinity, replacement);
  }

  insertMultiple(prop: string, index: number = Infinity, replacement: Array<NodePlaceholder<Node>>): NullablePathList<this> {
    const child = this._ref.child([prop]);

    const array = child.get();
    child.deref();

    if (!Array.isArray(array)) throw new Error("Unable to insert into non-array");
    if (index === Infinity) index = array.length;

    const target = this._ref.child([prop, index]);
    const refs = this._onInsert(target, this._unwrapPaths(replacement)).map((ref) => this._wrapRef(ref));
    target.deref();
    return refs;
  }

  _onReplace(ref: Reference, item: Reference): Reference {
    return ref.set(item);
  }

  _onRemove(ref: Reference): void {
    ref.remove();
  }

  _onInsert(ref: Reference, items: Array<Reference>) {
    return ref.insert(items);
  }

  _createPath(ref: Reference): this {
    return new this.constructor(ref);
  }

  _unwrapPath(input: NodePlaceholder<Node>): Reference {
    if (input instanceof TraversalPath) {
      // Remove the item from its current position before performing other operations.
      input.remove();
      return input._ref;
    }

    return new Tree(input).ref([]);
  }

  _unwrapPaths(input: Array<NodePlaceholder<Node>>): Array<Reference> {
    return input.map(this._unwrapPath, this);
  }

  _wrapRef(ref: Reference): this | null {
    const val = ref.get();

    if (!val || !val.type) {
      ref.deref();
      return null;
    }

    return this._createPath(ref);
  }
}
Object.freeze(TraversalPath);
Object.freeze(TraversalPath.prototype);

