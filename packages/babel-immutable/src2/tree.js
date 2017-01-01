// @ flow

import type {Node, ASTValue} from "./node";
import type {Position} from "./position";
import {parentPosition} from "./position";

export type Path = InactivePath|ResolvedPath|ResolvablePath;

type InactivePath = {|
  root: null,
  position: null,
  node: null,
|};

type ActivePath = ResolvedPath|ResolvablePath;
type ResolvablePath = {|
  root: Root,
  position: Position,
  node: null,
|};
type ResolvedPath = {|
  root: Root,
  position: Position,
  node: Node,
|};


type PathContext = Array<Path>;

type Root = {
  context: PathContext;
  root: Node;
};

type PathContextable = PathContext|Root|ActivePath;



/**
 * Call a callback to create a new Path scope. All paths assocated with this tree created
 * during callback execution will be invalidated upon completion of the callback.
 */
export function runInContext<U: any>(contextable: PathContextable, callback: () => U): U {
  const context = getContext(contextable);
  const length = context.length;

  try {
    return callback();
  } finally {
      // Override flow so that we can toggle between our union types.
    for (let i = length; i < context.length; i++) destroy(context[i]);
    context.length = length;
  }
}

/**
 * Create an AST fragment root.
 */
export function createRoot(root: Node, contextable?: PathContextable = []): Root {
  const context = getContext(contextable);

  return {
    context,
    root,
  };
}

/**
 * Creates a Path object to track the state of a piece of the AST.
 */
export function createResolvedPath(root: Root, position: Position, node: Node): ResolvedPath {
  const path = {
    root,
    position,
    node,
  };
  root.context.push(path);
  return path;
}

/**
 * Creates a Path object to track the state of a piece of the AST.
 */
export function createResolvablePath(root: Root, position: Position): ResolvablePath {
  const path = {
    root,
    position,
    node: null,
  };
  root.context.push(path);
  return path;
}

export function destroy(path: Path): InactivePath {
  const anyPath: any = path;
  anyPath.root = null;
  anyPath.position = null;
  anyPath.node = null;
  return path;
}

export function position(path: Path, position: Position): Position {
  return getActivePath(path).position.concat(position);
}

/**
 * Resolve a Path to an AST value, with an optional refinement property.
 */
export function get(path: Path, prop?: string): ASTValue {
  const node = toResolvedPath(path).node;

  return deepFreeze(prop ? node[prop] : node);
}

/**
 * Resolve a Path and update its value, with optional refinement property and index.
 */
export function set(path: Path, prop: ?string, value: ASTValue): void {
  const active = getActivePath(path);

  thaw(active);

  const pos = active.position.slice(0, -1);
  const target: any = pos.reduce((acc: any, prop) => acc[prop], (active.root.root: any));
  const final = active.position[active.position.length - 1];

  if (prop) {
    target[final][prop] = value;
  } else {
    target[final] = value;
  }

  // Invalidate including 'prop' path itself
  subpaths(active, prop).forEach((p) => destroy(p));
}

type Parent = {
  parent: ResolvablePath,
  prop: string,
  index: number | null,
};
export function parent(path: Path): Parent|null {
  const active = getActivePath(path);

  const parent = parentPosition(active.position);
  if (!parent) return null;

  return {
    parent: createResolvablePath(active.root, parent.position),
    prop: parent.prop,
    index: parent.index,
  };
}


export function remove(path: Path) {
  const active = getActivePath(path);

  active.root = createRoot(get(active), active.root);
}

/**
 * Insert an item into an array and update the paths properly.
 */
export function insertAt(path: Path, prop: string, index: number, value: Array<Node>): number {
  const active = getActivePath(path);

  thaw(active, prop);

  const resolved = toResolvedPath(active);
  const children = resolved.node[prop];
  if (!Array.isArray(children)) throw new Error("Attempting to insert array items in non-array position.");

  if (index === Infinity) index = children.length;
  children.splice(index, 0, ...value);

  shiftItems(active, prop, index, value.length);

  return index;
}

/**
 * Remove an item from an array and updarte the paths properly.
 */
export function removeAt(path: Path, prop: string, index: number): number {
  const active = getActivePath(path);

  thaw(active, prop);

  const resolved = toResolvedPath(active);
  const children = resolved.node[prop];
  if (!Array.isArray(children)) throw new Error("Attempting to remove array items from non-array.");

  if (index === Infinity) index = children.length;
  children.splice(index, 1);

  // TODO: This should also detach all child paths
  shiftItems(active, prop, index, -1);

  return index;
}

export function resolveNode(root: Root, position: Position): Node {
  return position.reduce((acc: any, prop) => acc[prop], root.root);
}

function toResolvedPath(path: Path): ResolvedPath {
  const active = getActivePath(path);
  if (!active.node) {
    // Cast to toggle between union types.
    (active: any).node = resolveNode(active.root, active.position);
  }
  return active;
}

/**
 * Given a location in the AST, convert all parent object down to this location from immutable
 * to mutable objects, so that they can be easily updated.
 */
function thaw(path: ActivePath, prop: ?string) {
  const active = getActivePath(path);
  // Using an any to drill down because we're making assumptions about user path mapping
  // back to a Node properly
  let parent: any = active.root.root = Object.isFrozen(active.root.root) ? Object.assign({}, active.root.root) : active.root.root;

  const position = prop ? path.position.concat(prop) : path.position;

  for (const prop of position) {
    let child = parent[prop];
    if (Object.isFrozen(child)) {
      parent[prop] = Array.isArray(child) ? child.slice() : Object.assign({}, child);
    }

    parent = parent[prop];
  }

  // Invalidate the node cache of any paths referencing the thawed nodes.
  path.root.context.forEach((p) => {
    if (!p.active || !p.node || !p.position) return;
    if (p.position.length > position.length) return;
    if (!p.position.every((item, i) => item === position[i])) return;

    (p: any).node = null;
  });
}

function shiftItems(path: ActivePath, prop: string, index: number, count: number) {
  const len = path.position.length;

  subpaths(path, prop).forEach((p) => {
    const pos = p.position;

    if (typeof pos[len] !== "number") return;
    if (pos[len] < index) return;

    if (count < 0 && pos[len] < index - count) {
      (p: any).active = false;
    }
    pos[len] += count;
  });
}

function subpaths(path: ActivePath, prop: ?string): Array<ActivePath> {
  return path.root.context.reduce((acc: Array<ActivePath>, p: Path) => {
    if (!p.active || !p.position) return acc;
    if (p.position.length > path.position.length) return acc;

    for (let i = 0; i < path.position.length; i++) {
      if (path.position[i] !== p.position[i]) return acc;
    }

    if (!prop || p.position[path.position.length] === prop) {
      // We have to cast to 'any' because "ResolvedPath" and "ResolvablePath"
      acc.push(p);
    }
    return acc;
  }, []);
}

function getActivePath(path: Path): ActivePath {
  if (path.root) return path;

  throw new Error("Operation performed on destroyed path.");
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

function getContext(arg: PathContextable): PathContext {
  const input: any = arg;

  // ActivePath types all have .position.
  if (input.position) return input.root.context;

  // Root types have .context.
  if (input.context) return input.context;

  // Otherwise assume normal context.
  return input;
}
