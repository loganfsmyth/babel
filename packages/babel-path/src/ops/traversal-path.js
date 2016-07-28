import * as t from "../";
import traversalRoot, { TraversalPath } from "./abstract-ops/traversal";
import compile from "./abstract-ops/selector";
import { createBindingIdentifiers } from "./abstract-ops/scoping";

export default function root(ast, callback) {
  return traversalRoot(ast, callback, NodePath);
}


class NodePath extends TraversalPath {
  traverse(callbacks, state) {

  }

  replaceWith(thing) {
    if (Array.isArray(this)) {

    } else {
      this.replace(thing);
    }
  }

  unshiftContainer(prop, items) {
    this.insertStart(prop, items);
  }
  pushContainer(prop, items) {
    this.insertEnd(prop, items);
  }

  get scope() {
    return new Scoping(this);
  }

  get parentPath() {
    return this.parent().path;
  }

  get inList() {
    return typeof this._props[this._props.length - 1] === "number";
  }

  get listKey() {
    return this.inList ? this._props[this._props.length - 2] : null;
  }

  get container() {
    return this.inList ? this.parentPath.node[this.listKey] : null;
  }

  get node() {
    return this.read(node => node);
  }
}

type BindingKind = 'var'|'lex'|'module'|'flow'|'label';
type NodeInfo = {
  node: Node,
  props: ASTPosition,
};
type DeclarationInfo = {
  id: NodeInfo,
  declaration: NodeInfo,
};
type BindingInfo = {
  name: string,
  kind: BindingKind,
  declarations: Array<DeclarationInfo>,
  references: Array<NodeInfo>,
};

class Scoping {
  _path: TypedTraversalPath;

  constructor(path) {
    this._path = path;
  }

  getBindings(): Array<BindingInfo> {

  }

  getBinding(name: string): BindingInfo {

  }


  /**
   * Generate a unique identifier and add it to the current scope.
   */

  generateDeclaredUidIdentifier(name: string = "temp") {
    let id = this.generateUidIdentifier(name);
    this.push({ id });
    return id;
  }

  /**
   * Generate a unique identifier.
   */

  generateUidIdentifier(name: string = "temp") {
    return t.identifier(this.generateUid(name));
  }

  /**
   * Generate a unique `_id1` binding.
   */

  generateUid(name: string = "temp") {
    name = t.toIdentifier(name).replace(/^_+/, "").replace(/[0-9]+$/g, "");

    return this._path.read(() => createBindingIdentifiers(name));
  }

  /**
   * Generate a unique identifier based on a node.
   */

  generateUidIdentifierBasedOnNode(parent: Object, defaultName?: String):  Object {
    let node = parent;

    if (t.isAssignmentExpression(parent)) {
      node = parent.left;
    } else if (t.isVariableDeclarator(parent)) {
      node = parent.id;
    } else if (t.isObjectProperty(node) || t.isObjectMethod(node)) {
      node = node.key;
    }

    let parts = [];

    let add = function (node) {
      if (t.isModuleDeclaration(node)) {
        if (node.source) {
          add(node.source);
        } else if (node.specifiers && node.specifiers.length) {
          for (let specifier of (node.specifiers: Array)) {
            add(specifier);
          }
        } else if (node.declaration) {
          add(node.declaration);
        }
      } else if (t.isModuleSpecifier(node)) {
        add(node.local);
      } else if (t.isMemberExpression(node)) {
        add(node.object);
        add(node.property);
      } else if (t.isIdentifier(node)) {
        parts.push(node.name);
      } else if (t.isLiteral(node)) {
        parts.push(node.value);
      } else if (t.isCallExpression(node)) {
        add(node.callee);
      } else if (t.isObjectExpression(node) || t.isObjectPattern(node)) {
        for (let prop of (node.properties: Array)) {
          add(prop.key || prop.argument);
        }
      }
    };

    add(node);

    let id = parts.join("$");
    id = id.replace(/^_/, "") || defaultName || "ref";

    return this.generateUidIdentifier(id.slice(0, 20));
  }

  /**
   * Determine whether evaluating the specific input `node` is a consequenceless reference. ie.
   * evaluating it wont result in potentially arbitrary code from being ran. The following are
   * whitelisted and determined not to cause side effects:
   *
   *  - `this` expressions
   *  - `super` expressions
   *  - Bound identifiers
   */

  isStatic(node: Object): boolean {
    if (t.isThisExpression(node) || t.isSuper(node)) {
      return true;
    }

    if (t.isIdentifier(node)) {
      let binding = this.getBinding(node.name);
      if (binding) {
        return binding.constant;
      } else {
        return this.hasBinding(node.name);
      }
    }

    return false;
  }

  /**
   * Possibly generate a memoised identifier if it is not static and has consequences.
   */

  maybeGenerateMemoised(node: Object, dontPush?: boolean): ?Object {
    if (this.isStatic(node)) {
      return null;
    } else {
      let id = this.generateUidIdentifierBasedOnNode(node);
      if (!dontPush) this.push({ id });
      return id;
    }
  }

  rename(oldName: string, newName: string, block?) {
    let binding = this.getBinding(oldName);
    if (binding) {
      newName = newName || this.generateUidIdentifier(oldName).name;
      return new Renamer(binding, oldName, newName).rename(block);
    }
  }

  buildUndefinedNode() {
    if (this.hasBinding("undefined")) {
      return t.unaryExpression("void", t.numericLiteral(0), true);
    } else {
      return t.identifier("undefined");
    }
  }

  addGlobal(node: Object) {
    this.globals[node.name] = node;
  }

  hasGlobal(name: string): boolean {
    let scope = this;

    do {
      if (scope.globals[name]) return true;
    } while (scope = scope.parent);

    return false;
  }

  hasReference(name: string): boolean {
    let scope = this;

    do {
      if (scope.references[name]) return true;
    } while (scope = scope.parent);

    return false;
  }

  isPure(node, constantsOnly?: boolean) {
    if (t.isIdentifier(node)) {
      let binding = this.getBinding(node.name);
      if (!binding) return false;
      if (constantsOnly) return binding.constant;
      return true;
    } else if (t.isClass(node)) {
      if (node.superClass && !this.isPure(node.superClass, constantsOnly)) return false;
      return this.isPure(node.body, constantsOnly);
    } else if (t.isClassBody(node)) {
      for (let method of node.body) {
        if (!this.isPure(method, constantsOnly)) return false;
      }
      return true;
    } else if (t.isBinary(node)) {
      return this.isPure(node.left, constantsOnly) && this.isPure(node.right, constantsOnly);
    } else if (t.isArrayExpression(node)) {
      for (let elem of (node.elements: Array<Object>)) {
        if (!this.isPure(elem, constantsOnly)) return false;
      }
      return true;
    } else if (t.isObjectExpression(node)) {
      for (let prop of (node.properties: Array<Object>)) {
        if (!this.isPure(prop, constantsOnly)) return false;
      }
      return true;
    } else if (t.isClassMethod(node)) {
      if (node.computed && !this.isPure(node.key, constantsOnly)) return false;
      if (node.kind === "get" || node.kind === "set") return false;
      return true;
    } else if (t.isClassProperty(node) || t.isObjectProperty(node)) {
      if (node.computed && !this.isPure(node.key, constantsOnly)) return false;
      return this.isPure(node.value, constantsOnly);
    } else if (t.isUnaryExpression(node)) {
      return this.isPure(node.argument, constantsOnly);
    } else {
      return t.isPureish(node);
    }
  }

  push(opts: {
    id: Object;
    init: ?Object;
    unique: ?boolean;
    _blockHoist: ?number;
    kind: "var" | "let";
  }) {
    let path = this.path;

    if (!path.isBlockStatement() && !path.isProgram()) {
      path = this.getBlockParent().path;
    }

    if (path.isSwitchStatement()) {
      path = this.getFunctionParent().path;
    }

    if (path.isLoop() || path.isCatchClause() || path.isFunction()) {
      t.ensureBlock(path.node);
      path = path.get("body");
    }

    let unique = opts.unique;
    let kind   = opts.kind || "var";
    let blockHoist = opts._blockHoist == null ? 2 : opts._blockHoist;

    let dataKey = `declaration:${kind}:${blockHoist}`;
    let declarPath  = !unique && path.getData(dataKey);

    if (!declarPath) {
      let declar = t.variableDeclaration(kind, []);
      declar._generated = true;
      declar._blockHoist = blockHoist;

      [declarPath] = path.unshiftContainer("body", [declar]);
      if (!unique) path.setData(dataKey, declarPath);
    }

    let declarator = t.variableDeclarator(opts.id, opts.init);
    declarPath.node.declarations.push(declarator);
  }

  /**
   * Walks the scope tree and gathers **all** bindings.
   */

  getAllBindings(): Object {
    let ids = Object.create(null);

    let scope = this;
    do {
      defaults(ids, scope.bindings);
      scope = scope.parent;
    } while (scope);

    return ids;
  }

  /**
   * Walks the scope tree and gathers all declarations of `kind`.
   */

  getAllBindingsOfKind(): Object {
    let ids = Object.create(null);

    for (let kind of (arguments: Array)) {
      let scope = this;
      do {
        for (let name in scope.bindings) {
          let binding = scope.bindings[name];
          if (binding.kind === kind) ids[name] = binding;
        }
        scope = scope.parent;
      } while (scope);
    }

    return ids;
  }

  bindingIdentifierEquals(name: string, node: Object): boolean {
    return this.getBindingIdentifier(name) === node;
  }

  getBinding(name: string) {
    let scope = this;

    do {
      let binding = scope.getOwnBinding(name);
      if (binding) return this.warnOnFlowBinding(binding);
    } while (scope = scope.parent);
  }

  getOwnBinding(name: string) {
    return this.warnOnFlowBinding(this.bindings[name]);
  }

  getBindingIdentifier(name: string) {
    let info = this.getBinding(name);
    return info && info.identifier;
  }

  getOwnBindingIdentifier(name: string) {
    let binding = this.bindings[name];
    return binding && binding.identifier;
  }

  hasOwnBinding(name: string) {
    return !!this.getOwnBinding(name);
  }

  hasBinding(name: string, noGlobals?) {
    if (!name) return false;
    if (this.hasOwnBinding(name)) return true;
    if (this.parentHasBinding(name, noGlobals)) return true;
    if (this.hasUid(name)) return true;
    if (!noGlobals && includes(Scope.globals, name)) return true;
    if (!noGlobals && includes(Scope.contextVariables, name)) return true;
    return false;
  }

  parentHasBinding(name: string, noGlobals?) {
    return this.parent && this.parent.hasBinding(name, noGlobals);
  }

  /**
   * Move a binding of `name` to another `scope`.
   */

  moveBindingTo(name, scope) {
    let info = this.getBinding(name);
    if (info) {
      info.scope.removeOwnBinding(name);
      info.scope = scope;
      scope.bindings[name] = info;
    }
  }

  removeOwnBinding(name: string) {
    delete this.bindings[name];
  }

  removeBinding(name: string) {
    // clear literal binding
    let info = this.getBinding(name);
    if (info) {
      info.scope.removeOwnBinding(name);
    }

    // clear uids with this name - https://github.com/babel/babel/issues/2101
    let scope = this;
    do {
      if (scope.uids[name]) {
        scope.uids[name] = false;
      }
    } while (scope = scope.parent);
  }






}

// Give our class methods for every node type we know about.
for (const type of (t.TYPES: Array<string>)) {
  const typeKey = `is${type}`;
  Object.defineProperty(TypedTraversalPath.prototype, typeKey, {
    value(){
      return this.read((node) => t[typeKey](node, opts));
    },
  });
  Object.defineProperty(TypedTraversalPath.prototype, `assert${type}`, {
    value(){
      if (!this[typeKey](opts)) {
        throw new TypeError(`Expected node path of type ${type}`);
      }
    },
  });
}

Object.freeze(TypedTraversalPath);
Object.freeze(TypedTraversalPath.prototype);
