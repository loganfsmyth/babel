// @flow

/**
 * This file defines wrapper system for an immutable object structure to allow for easy
 * modification of the underlying tree structure.
 */

export type Position = Array<number|string>;

export default class Tree {
  _root: Object;
  _refs: Map<string, Reference> = new Map();

  constructor(root: Object) {
    this._root = root;
  }

  ref(position: Position): Reference {
    const key = positionToKey(position);
    let ref = this._refs.get(key);
    if (!ref) {
      ref = new Reference(this, position);
      this._refs.set(key, ref);
    }
    ref.ref();

    return ref;
  }

  deref(position: Position): void {
    this._refs.delete(positionToKey(position));
  }

  value(position: Position): any {
    // TODO: This value can be cached in immutable trees.
    const val = position.reduce((acc, prop) => acc[prop], this._root);

    return deepFreeze(val);
  }

  mutableParent(position: Position): { parent: Object, position: Position, prop: string | number } {
    if (position.length === 0) {
      return {
        parent: this,
        prop: "_root",
        position: [],
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

  attachTree(position: Position, sourceTree: Tree) {
    for (const [, ref] of sourceTree._refs) {
      const active = ref._getActiveRef();

      const pos = position.concat(active._position);
      const newKey = positionToKey(pos);

      ref._position = pos;
      ref._tree = this;
      ref._tree._refs.set(newKey, ref);
    }
    sourceTree._refs.clear();
  }

  shiftPaths(position: Position, prop: number, count: number) {
    const baseKey = positionToKey(position);

    for (const [key, ref] of this._refs) {
      if (!key.startsWith(baseKey)) continue;
      const active = ref._getActiveRef();

      const offset = +active._position[position.length];

      if (offset < prop) continue;

      active._position[position.length] = count + active._position[position.length];
      const newKey = positionToKey(active._position);

      active._tree._refs.delete(key);
      active._tree._refs.set(newKey, ref);
    }
  }

  detachPoint(position: Position) {
    // Bump all removed refs into their own tree.
    const newTree = new Tree(this.value(position));
    const baseKey = positionToKey(position);

    for (const [key, ref] of this._refs) {
      if (!key.startsWith(baseKey)) continue;
      const active = ref._getActiveRef();

      // Move ref to new tree.
      active._tree = newTree;
      active._position = active._position.slice(position.length);

      this._refs.delete(key);
      newTree._refs.set(positionToKey(active._position), ref);
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

type ActiveReference = {
  _tree: Tree,
  _position: Position,
};

export class Reference {
  _refcount: number = 0;
  _tree: Tree | null = null;
  _position: Position | null = null;

  constructor(tree: Tree, position: Position) {
    this._tree = tree;
    this._position = position;
  }

  ref() {
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
    const active = this._getActiveRef();
    return active._tree.ref(active._position.concat(props));
  }

  parent(): { ref: Reference, prop: string | number } | null {
    const active = this._getActiveRef();
    if (active._position.length === 0) return null;

    const prop = active._position[active._position.length - 1];
    return {
      ref: active._tree.ref(active._position.slice(0, -1)),
      prop,
    };
  }

  contains(ref: Reference): boolean {
    const active = this._getActiveRef();
    return active._tree === ref._tree && containsPosition(active._position, active._position);
  }

  get(): any {
    const active = this._getActiveRef();
    return active._tree.value(active._position);
  }

  set(value: Reference | any): Reference {
    const active = this._getActiveRef();
    const {parent, prop} = active._tree.mutableParent(active._position);

    this.remove();

    if (value instanceof Reference) {
      const activeValue = value._getActiveRef();
      value.remove();

      parent[prop] = value.get();
      active._tree.attachTree(active._position, activeValue._tree);

      return value;
    } else {
      parent[prop] = value;
      return active._tree.ref(parent.concat(prop));
    }
  }

  remove(): void {
    const active = this._getActiveRef();
    active._tree.detachPoint(active._position);

    const {parent, position, prop} = active._tree.mutableParent(active._position);

    if (Array.isArray(parent)) {
      parent.splice(prop, 1);

      active._tree.shiftPaths(position, +prop, -1);
    } else {
      parent[prop] = null;
    }
  }

  insert(toInsert: Array<Reference | any>): Array<Reference>  {
    const active = this._getActiveRef();
    const {parent, position, prop} = active._tree.mutableParent(active._position);

    const items = toInsert.map((item) => {
      return item instanceof Reference ? item.get() : null;
    });

    parent.splice(prop, 0, ...items);

    active._tree.shiftPaths(position, +prop, toInsert.length);

    return toInsert.map((item, i) => {
      if (item instanceof Reference) {
        item.remove();

        const activeItem = item._getActiveRef();
        active._tree.attachTree(position.concat(prop + i), activeItem._tree);

        return item;
      } else {
        return active._tree.ref(parent.concat(prop + i));
      }
    });
  }

  _getActiveRef(): ActiveReference {
    if (this._refcount === 0) {
      throw new Error("Operation cannot be performed in a destroyed ref.");
    }

    return (this: any);
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
