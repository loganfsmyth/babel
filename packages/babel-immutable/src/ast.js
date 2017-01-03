// @flow

/**
 * This file defines wrapper system for an immutable object structure to allow for easy
 * modification of the underlying tree structure.
 */

export type Position = Array<number|string>;
export type {Reference};

export default class Tree {
  _root: any;
  _refs: Map<string, Reference> = new Map();

  constructor(root: any) {
    this._root = root;
  }

  root(): any {
    return this._root;
  }

  subtree(root: any): Tree {
    return new Tree(root);
  }

  empty(): boolean {
    return this._refs.size === 0;
  }

  ref(position: Position): Reference {
    const key = positionToKey(position);
    let ref = this._refs.get(key);
    if (!ref) {
      ref = new Reference(this, position);
      this._refs.set(key, ref);
    } else {
      ref.ref();
    }

    return ref;
  }

  deref(position: Position): void {
    this._refs.delete(positionToKey(position));
  }

  value(position: Position): any {
    // TODO: This value can be cached in immutable trees.
    const val = position.reduce((acc: any, prop) => acc[prop], this._root);

    return deepFreeze(val);
  }

  mutableParent(position: Position): { parent: Object, position: Position, prop: string | number } {
    if (position.length === 0) {
      return {
        parent: this,
        prop: "_root",
        position: position,
      };
    }

    const parent = position.slice(0, -1);

    let current = this._root;
    if (Object.isFrozen(current)) current = this._root = Object.assign({}, this._root);

    for (const prop of parent) {
      let value = current[prop];
      if (Object.isFrozen(value)) {
        value = current[prop] = Array.isArray(value) ? value.slice() : Object.assign({}, value);
      }

      current = value;
    }

    return {
      parent: this.value(parent, true /* skipFreeze */),
      position: parent,
      prop: position[position.length - 1],
    };
  }

  /**
   * Take all the refs in the given tree, and move then to this tree at the given
   * position.
   *
   * Note: This could result in overwriting existing refs if used improperly.
   */
  attachTree(attachTo: Position, sourceTree: Tree) {
    for (const [key, ref] of Array.from(sourceTree._refs)) {
      const {position} = ref._getActiveRef();
      const pos = attachTo.concat(position);

      ref._position = pos;
      ref._tree = this;

      sourceTree._refs.delete(key);
      this._refs.set(positionToKey(pos), ref);
    }
  }

  /**
   * Take all refs rooted at the given position and move them into their own tree.
   */
  detachPoint(detachFrom: Position) {
    // Bump all removed refs into their own tree.
    const newTree = this.subtree(this.value(detachFrom));
    const baseKey = positionToKey(detachFrom);

    for (const [key, ref] of Array.from(this._refs)) {
      if (!key.startsWith(baseKey)) continue;

      const {position} = ref._getActiveRef();
      const pos = position.slice(detachFrom.length);

      // Move ref to new tree.
      ref._tree = newTree;
      ref._position = pos;

      this._refs.delete(key);
      newTree._refs.set(positionToKey(pos), ref);
    }
  }

  shiftPaths(atPosition: Position, count: number) {
    const baseKey = positionToKey(atPosition.slice(0, -1));
    const prop = +atPosition[atPosition.length - 1];

    for (const [key, ref] of this._refs) {
      if (!key.startsWith(baseKey)) continue;

      const {position} = ref._getActiveRef();
      const offset = +position[atPosition.length];

      if (offset < prop) continue;

      position[atPosition.length] = count + position[atPosition.length];

      this._refs.delete(key);
      this._refs.set(positionToKey(position), ref);
    }
  }
}

function positionToKey(position: Position): string {
  return position.toString() + ",";
}

function containsPosition(p1: Position, p2: Position): boolean {
  // Fast path for checking if something is in a root.
  if (p1.length === 0) return true;

  return positionToKey(p2).indexOf(positionToKey(p1)) === 0;
}

class Reference {
  _refcount: number = 1;
  _tree: Tree | null = null;
  _position: Position | null = null;

  constructor(tree: Tree, position: Position) {
    this._tree = tree;
    this._position = position;
  }

  clone(): Reference {
    const {tree} = this._getActiveRef();
    return tree.subtree(this.get()).ref([]);
  }

  ref() {
    if (this._refcount === 0) throw new Error();

    this._refcount += 1;
  }

  deref() {
    this._refcount -= 1;

    if (this._tree && this._position) {
      this._tree.deref(this._position);
      this._tree = null;
      this._position = null;
    }
  }

  child(props: Position): Reference {
    const {tree, position} = this._getActiveRef();
    return tree.ref(position.concat(props));
  }

  parent(): { ref: Reference, prop: string | number } | null {
    const {tree, position} = this._getActiveRef();
    if (position.length === 0) return null;

    const prop = position[position.length - 1];
    return {
      ref: tree.ref(position.slice(0, -1)),
      prop,
    };
  }

  contains(ref: Reference): boolean {
    const {tree, position} = this._getActiveRef();
    const {tree: tree2, position: pos2} = ref._getActiveRef();

    return tree === tree2 && containsPosition(position, pos2);
  }

  get(): any {
    const {tree, position} = this._getActiveRef();
    return tree.value(position);
  }

  set(value: Reference | any): Reference {
    const item = this._standardizeRefs([value])[0];

    const {tree, position} = this._getActiveRef();
    const {parent, prop} = tree.mutableParent(position);

    parent[prop] = item.get();

    tree.detachPoint(position);
    tree.attachTree(position, item._getActiveRef().tree);

    return item;
  }

  remove(): void {
    const {tree, position} = this._getActiveRef();
    const {parent, prop} = tree.mutableParent(position);

    tree.detachPoint(position);
    if (Array.isArray(parent)) {
      tree.shiftPaths(position, -1);

      parent.splice(prop, 1);
    } else {
      parent[prop] = null;
    }
  }

  insert(toInsert: Array<Reference | any>): Array<Reference>  {
    const items = this._standardizeRefs(toInsert);

    const {tree, position} = this._getActiveRef();
    const {parent, prop} = tree.mutableParent(position);

    parent.splice(prop, 0, ...items.map((item) => item.get()));

    tree.shiftPaths(position, items.length);

    items.forEach((ref, i) => {
      tree.attachTree(position.concat(prop + i), ref._getActiveRef().tree);
    });

    return items;
  }

  _getActiveRef(): {tree: Tree, position: Position} {
    if (this._refcount === 0 || !this._tree || !this._position) {
      throw new Error("Operation cannot be performed in a destroyed ref.");
    }

    return {tree: this._tree, position: this._position};
  }

  _standardizeRefs(items: Array<Reference | any>): Array<Reference> {
    const {tree} = this._getActiveRef();
    return items.map((item) => {
      if (!(item instanceof Reference)) return tree.subtree(item).ref([]);

      const {position} = item._getActiveRef();
      if (position.length !== 0) {
        throw new Error("AST Reference should be detached before use elsewhere.");
      }

      if (item.contains(this)) {
        throw new Error("Cannot insert item inside itself.");
      }

      return item;
    });
  }
}

function deepFreeze<T>(o: T): T {
  // Bail once we encounter a frozen node because we will assume for performance reasons
  // that any frozen node will have an entirely frozen subtree.
  if (!Object.isFrozen(o)) {
    Object.freeze(o);

    if (Array.isArray(o)) {
      for (const item of o) deepFreeze(item);
    } else if (o && typeof o === "object") {
      for (const key of Object.keys(o)) deepFreeze(o[key]);
    }
  }

  return o;
}
