// @flow

type Position = Array<string|number>;

export type Node = {
  type: string;
};
export type Path = {
  active: boolean,
  position: Position,
  node: Node | null,
};

/**
 * The State object tracks the current full state of the AST, and implements our supported mutation operations.
 */
export default class Tree {
  _root: Node;
  _activePaths: Array<Path> = [];

  root(): Node {
    return this._root;
  }

  constructor(rootNode: Node) {
    this._root = rootNode;
  }

  /**
   * Creates a Path object to track the state of a piece of the AST.
   */
  path(position: Position, node: Node | null = null): Path {
    const path = {
      active: true,
      position,
      node,
    };
    this._activePaths.push(path);
    return path;
  }

  /**
   * Resolve a Path to an AST value, with an optional refinement property.
   */
  get(path: Path, prop?: string): any {
    if (path.node) return prop ? path.node[prop] : path.node;

    this._freeze(path, prop);

    const target: any = path.position.reduce((acc: any, prop) => acc[prop], this._root);

    return prop ? target[prop] : target;
  }

  /**
   * Resolve a Path and update its value, with optional refinement property and index.
   */
  set(path: Path, prop: ?string, value: any): void {
    this._thaw(path);

    let target: any = this._root;
    for (let i = 0; i < path.position.length - 1; i++) {
      target = target[path.position[i]];
    }

    const final = path.position[path.position.length - 1];

    if (prop) {
      target[final][prop] = value;
    } else {
      target[final] = value;
    }

    // Invalidate including 'prop' path itself
    this._subpaths(path.position, prop).forEach((p) => {
      p.active = false;
    });
  }

  /**
   * Insert an item into an array and update the paths properly.
   */
  insert(path: Path, prop: string, index: number, value: Array<Node>): number {
    this._thaw(path, prop);

    const target: any = path.position.reduce((acc: any, prop) => acc[prop], (this._root: any));
    const children = target[prop];
    if (!Array.isArray(children)) throw new Error("Attempting to insert array items in non-array position.");

    if (index === Infinity) index = children.length;
    target.splice(index, 0, ...value);

    this._shiftItems(path.position, prop, index, value.length);

    return index;
  }

  /**
   * Remove an item from an array and updarte the paths properly.
   */
  remove(path: Path, prop: string, index: number): number {
    this._thaw(path, prop);

    const target: any = path.position.reduce((acc: any, prop) => acc[prop], (this._root: any));
    const children = target[prop];
    if (!Array.isArray(children)) throw new Error("Attempting to remove array items from non-array.");

    if (index === Infinity) index = children.length;
    children.splice(index, 1);

    this._shiftItems(path.position, prop, index, -1);

    return index;
  }

  /**
   * Call a callback to create a new Path scope. All paths assocated with this tree created
   * during callback execution will be invalidated upon completion of the callback.
   */
  context<U: any>(callback: () => U): U {
    const length = this._activePaths.length;

    const result = callback();

    for (let i = length; i < this._activePaths.length; i++) this._activePaths[i].active = false;
    this._activePaths.length = length;
    return result;
  }

  /**
   * Given a location in the AST, convert all parent object down to this location from immutable
   * to mutable objects, so that they can be easily updated.
   */
  _thaw(path: Path, prop: ?string) {
    let parent = this._root = Object.isFrozen(this._root) ? Object.assign({}, this._root) : this._root;

    const position = prop ? path.position.concat(prop) : path.position;

    for (const prop of position) {
      let child = parent[prop];
      if (Object.isFrozen(child)) {
        parent[prop] = Array.isArray(child) ? child.slice() : Object.assign({}, child);
      }

      parent = parent[prop];
    }

    // Invalidate the node cache of any paths referencing the thawed nodes.
    this._activePaths.forEach((p: Path) => {
      if (!p.active || !p.node) return;
      if (p.position.length > position.length) return;
      if (!p.position.every((item, i) => item === position[i])) return;

      p.node = null;
    });
  }

  /**
   * Given a location in the AST, convert all child objects from this point into immutable
   * objects so they can be safely exposed to library users.
   */
  _freeze(path: Path, prop: ?string) {
    const position = prop ? path.position.concat(prop) : path.position;

    deepFreeze(position.reduce((acc: any, prop) => acc[prop], this._root));
  }

  _shiftItems(position: Position, prop: string, index: number, count: number) {
    const len = position.length;

    this._subpaths(position, prop).forEach((p) => {
      const pos = p.position;

      if (typeof pos[len] !== "number") return;
      if (pos[len] < index) return;

      if (count < 0 && pos[len] < index - count) {
        p.active = false;
      }
      pos[position.length] += count;
    });
  }

  _subpaths(position: Position, prop: ?string) {
    return this._activePaths.filter((p: Path) => {
      if (!p.active) return false;
      if (p.position.length > position.length) return false;

      if (!position.every((item, i) => item === p.position[i])) return false;

      return !prop || p.position[position.length] === prop;
    });
  }
}
Object.freeze(Tree);
Object.freeze(Tree.prototype);

function deepFreeze(o: any) {
  // Bail once we encounter a frozen node because we will assume for performance reasons
  // that any frozen node will have an entirely frozen subtree.
  if (Object.isFrozen(o)) return;

  Object.freeze(o);

  if (Array.isArray(o)) o.forEach((item) => deepFreeze(item));
  else if (o && typeof o === "object") Object.keys(o).forEach((item) => deepFreeze(o[item]));
}
