import assert from "assert";
import { VISITOR_KEYS } from "babel-types";

type ASTPosition = Array<string|number>;


export default function enter<T: TraversalPath>(ast: Node, callback: (path: TraversalPath) => void, Traversal: Class<T> = TraversalPath) {
  assert(Traversal === TraversalPath || Traversal.prototype instanceof TraversalPath, "Invalid traversal wrapper function");

  const state = new ASTState(Traversal, ast);
  const path = state.path([]);
  path.context(() => callback(path));
  return state.node;
}


/**
 *
 */
export class TraversalPath {
  /**
   *
   */
  _token: Object;
  _props: ASTPosition;

  constructor(token: string, props: ASTPosition) {
    this._token = token;
    this._props = props;
  }

  get node() {
    assertActive(this);

    return ASTState.get(this._token).resolve(this._props);
  }

  get type() {
    return this.node.type;
  }

  /**
   * Checks if a given path has been destroyed or not.
   */
  active(): boolean {
    return !!this._token;
  }

  /**
   * Enter a new path context. Any paths creates during the synchronous execution of the
   * callback will be automatically destroyed upon completion.
   */
  context<T>(callback: () => T): T {
    return ASTState.get(this._token).context(callback);
  }

  /**
   * Return a new TraversalPath rooted at this section of the tree.
   */
  clone(): this {
    assertActive(this);

    return ASTState.get(this._token).detach(this);
  }

  /**
   * Get a path to this node's parent node, along with the metadata to get back.
   */
  parent(): { path: this, prop: string, index: ?number} {
    assertActive(this);

    if (this._props.length === 0) {
      return {
        path: null,
        prop: null,
        index: null,
      };
    }

    const parentPath = this._props.slice(0, -1);
    const parent = ASTState.get(this._token).resolve(parentPath);

    if (Array.isArray(parent)) {
      return {
        path: ASTState.get(this._token).path(this._props.slice(0, -2)),
        prop: this._props[this._props.length - 2],
        index: this._props[this._props.length - 1],
      };
    } else {
      return {
        path: ASTState.get(this._token).path(parentPath),
        prop: this._props[this._props.length - 1],
        index: null,
      };
    }
  }

  /**
   * Access a property of the AST node.
   */
  get(prop: string): any {
    const node = this.node
    assertDataProperty(node, prop);

    return node[prop];
  }

  /**
   * Mutate a property of the AST node.
   */
  set(prop: string, value: any): this {
    assertDataProperty(this.node, prop);

    ASTState.get(this._token).replace([...this._props, prop], value);

    return this;
  }

  /**
   * Get the children of the current node, given the name of a property that contains
   * an array of child nodes.
   */
  children(prop: string): Array<this> {
    assertVisitorProperty(this.node, prop);

    return Object.freeze(this.node[prop].map((node, i) => this.child(prop, i)));
  }

  /**
   * Update the node's children with a new set of child nodes.
   */
  setChildren(prop: string, children: Array<Node|TraversalPath>, returnPaths: boolean = false) : this|Array<this> {
    assertVisitorProperty(this.node, prop);

    ASTState.get(this._token).replace([...this._props, prop], children.map((child) => unwrapPath(child)));

    if (returnPaths) return this.children(prop);
    return this;
  }

  /**
   * Drill down to get a child node.
   */
  child(...props: Array<number|string>): this {
    assertActive(this);

    // Support passing keys as multiple args, or an array as the first arg.
    if (props.length === 1 && Array.isArray(props[0])) props = props[0];

    assertVisitorProperty(this.node, props[0]);

    return ASTState.get(this._token).path([...this._props, ...props]);
  }

  setChild(prop: string, child: Node|TraversalPath, returnPath: boolean = false): this {
    assertVisitorProperty(this.node, prop);

    ASTState.get(this._token).replace([...this._props, prop], unwrapPath(child), true /* invalidateSelf */);

    if (returnPath) return this.child(prop);
    return this;
  }

  /**
   * Replace this node with the node from another path.
   */
  replace(replacement: Node|this): this {
    if (!replacement) throw new Error("A node must be replaced with another node.");

    ASTState.get(this._token).replace(this._props, replacement);

    return this;
  }

  /**
   * Remove the node a this path, replacing it with 'null' for nodes that are direct children,
   * and removing the node from the list for nodes that are in arrays.
   */
  remove(): void {
    const {index} = this.parent();

    if (index === null) {
      ASTState.get(this._token).replace(this._props, null);
      ASTState.get(this._token).destroy(this);
    } else {
      ASTState.get(this._token).remove(this._props);
    }
  }

  insertBefore(nodes: Array<Node|TraversalPath>, returnPaths: boolean = false): this|Array<this> {
    return updateItems(this, this._props, nodes, returnPaths);
  }

  insertAfter(nodes: Array<Node|TraversalPath>, returnPaths: boolean = false): this|Array<this> {
    const props = this._props.slice();
    props[props.length - 1] += 1;

    return updateItems(this, props, nodes, returnPaths);
  }

  insertStart(prop: string, nodes: Array<Node|TraversalPath>, returnPaths: boolean = false): this|Array<this> {
    return updateItems(this, [...this._props, prop, 0], nodes, returnPaths);
  }

  insertEnd(prop: string, nodes: Array<Node|TraversalPath>, returnPaths: boolean = false): this|Array<this> {
    const child = ASTState.get(this._token).resolve([...this._props, prop]);

    return updateItems(this, [...this._props, prop, child.length], nodes, returnPaths);
  }
}
Object.freeze(TraversalPath);
Object.freeze(TraversalPath.prototype);


function updateItems<T>(path: T, props: ASTPosition, nodes: Array<Node|TraversalPath>, returnPaths: boolean): T|Array<T> {
  const multiple = Array.isArray(nodes);
  if (!multiple) nodes = [nodes];

  ASTState.get(path._token).insert(props, nodes.map(child => unwrapPath(child)));

  if (!returnPaths) return path;

  const offset = props[props.length - 1];

  const paths = nodes.map((node, i) => path.child(prop, offset + i));
  return multiple ? paths : paths[0];
}

/**
 * Given a value that may be a TraversalPath, or AST node, or misc value, convert the TraversalPath to an AST Node.
 */
function unwrapPath(path: TraversalPath): any {
  if (typeof path !== "object") return path;
  if ("type" in path) return path;

  assertActive(path);

  return ASTState.get(path._token).resolve(path._props);
}

function assertDataProperty(node: Node, prop: string) {
  if (!node || VISITOR_KEYS[node.type].indexOf(prop) === -1) return;

  throw new Error(`Attempted to access "${prop}" from node "${node.type}", which is not a data property.`);
}

function assertVisitorProperty(node: Node, prop: string) {
  if (!node || VISITOR_KEYS[node.type].indexOf(prop) !== -1) return;

  throw new Error(`Attempted to access "${prop}" from node "${node.type}", which is not a child node property.`);
}

function assertActive(path: Node) {
  if (path.active()) return;

  throw new Error("Attempted to access values from a destroyed path.");
}


const AST_STATES = new WeakMap();

/**
 * The ASTState object tracks the current full state of the AST, and implements our supported mutation operations.
 */
class ASTState<T: TraversalPath> {
  node: Node;
  _traversalClass: Class<T> = null;
  _token: Object = {};
  _activePaths: Array<T> = [];

  static get(token) {
    return AST_STATES.get(token);
  }

  constructor(constr: Class<T>, node) {
    this._traversalClass = constr;
    this.node = node;

    AST_STATES.set(this._token, this);
  }

  /**
   * Call a callback inside a new path context. Any paths created inside this context will be destroyed
   * the callback completes.
   */
  context<T>(callback: () => T): T {
    const index = this._activePaths.length;

    const result = callback();

    for (var i = index; i < this._activePaths.length; i++) this.destroy(this._activePaths[i]);
    this._activePaths.length = index;

    return result;
  }

  path(props: ASTPosition): T {
    // TODO: Add caching for equal paths from the same context.
    const path = new this._traversalClass(this._token, props);
    this._activePaths.push(path);
    return path;
  }

  /**
   * Call to mark this path as unusable from this point on. This helps performance if you
   * know that a path won't be used again, because it no longer needs to have it's location
   * adjusted as nodes are inserted and removed.
   */
  destroy(path) {
    path._token = null;
    path._props = null;
  }

  detach(path: T): T {
    return new ASTState(this._traversalClass, this.resolve(path._props)).path([]);
  }

  resolve(props: ASTPosition): Node {
    return props.reduce((value, key) => value[key], this.node);
  }

  /**
   * Replace the value at that position.
   */
  replace(props: ASTPosition, value: Node|TraversalPath, invalidateSelf = false) {
    this._replaceItem(props, value);

    // Destroy all paths below the one that was removed.
    this._subtreePaths(props, invalidateSelf).forEach(path => {
      this.destroy(path);
    });
  }

  /**
   * Insert a list of items into a position that is an array item.
   */
  insert(props: ASTPosition, values: Array<Node>) {
    const parentProps = props.slice(0, -1);
    const index = props[props.length - 1];
    const parent = this.resolve(parentProps);

    const value = parent.slice(0, index).concat(values, parent.slice(index));

    this._replaceItem(parentProps, value);

    // Destroy children of this path, and shift over all siblings.
    this._subtreePaths(parentProps).forEach(path => {
      if (path._props[parentProps.length] >= index) {
        path._props[parentProps.length] += values.length;
      }
    });
  }

  /**
   * Remove an array item at the given position.
   */
  remove(props: ASTPosition) {
    const parentProps = props.slice(0, -1);
    const index = props[props.length - 1];

    const parent = this.resolve(parentProps);
    const value = parent.filter((v, i) => i !== index);

    // Destroy children of this path, and shift over all siblings.
    this._subtreePaths(parentProps).forEach(path => {
      if (path._props[props.length] > index) {
        path._props[props.length] -= 1;
      } else if (path._props[props.length] === index) {
        this.destroy(path);
      }
    });
    this._replaceItem(parentProps, value);
  }

  _replaceItem(props: ASTPosition, value: any) {
    const items = props.reduce((acc, prop) => ({
      node: acc.node[prop],
      paths: [{
        node: acc.node,
        prop: prop,
      }, ...acc.paths],
    }), {
      node: this.node,
      paths: [],
    }).paths;

    this.node = items.reduce((acc, item) => {
      const copy = Array.isArray(item.node) ? item.node.slice() : Object.assign({}, item.node);
      copy[item.prop] = acc;
      Object.freeze(copy);
      return copy;
    }, Object.freeze(value));
  }

  _subtreePaths(props: ASTPosition, includeSelf = false) {
    // Find all active sibling paths of the target property.
    return this._activePaths.filter((otherPath) => {
      if (!otherPath.active()) return false;
      if (otherPath._props.length < props.length) return false;
      if (!includeSelf && otherPath._props.length === props.length) return false;

      return props.every((key, i) => key === otherPath._props[i]);
    });
  }
}
Object.freeze(ASTState);
Object.freeze(ASTState.prototype);
