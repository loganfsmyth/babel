// @flow

import * as t from "babel-types";
import TraversalPath from "babel-immutable";
import type {Reference} from "babel-immutable";

import Scope from "./scope";

type Node = BabelNodeImportDeclaration | BabelNodeStringLiteral;

type NodeType = string;

// TODO: Technically we could generate this type in babel-types and import it.
type TraversalHandler = {
  [type: NodeType]: (path: ASTTraversalPath) => void;
};

const handlers = {
  onSet: (targetRef: Reference, valueRef: Reference): boolean => {
    const value = valueRef.get();
    if (value === null && removeHooks(targetRef)) return true;

    const result = targetRef.parent();
    if (!result) return;

    const {ref} = result;

    if (value && t.isExpression(value) && Array.isArray(ref.get()) ) {
      valueRef.set(t.expressionStatement(value)).child(["expression"]).set(valueRef);
      return true;
    }
    return false;
  },
  // eslint-disable-next-line
  onInsert: (targetRef: Reference, valueRefs: Array<Reference>): boolean => {

    return false;
  },
  onRemove: (targetRef: Reference): boolean => {
    return removeHooks(targetRef);
  },
};

function removeHooks(targetRef): boolean {
  const result = targetRef.parent();
  if (!result) return false;

  const {ref, prop} = result;

  const value = ref.get();
  if (value.type === "IfStatement" && prop === "consequent") {
    ref.set(t.blockStatement([]));
    return true;
  }

  return false;

}

class ASTTraversalPath extends TraversalPath<Node> {
  _scope: Scope<ASTTraversalPath> | null;

  static handlers() {
    return handlers;
  }

  traverse(handler: TraversalHandler): void {
    const types = Object.keys(handler);
    const paths = [];//t.typeQuery(this.node(), types)
      // .map(({position, node}) => this.path(position, node));

    this.context(() => paths.forEach((path) => {
      const callback = handler[path.node().type];
      callback(path);
    }));
  }

  scope(): Scope<this> {
    let scope = this._scope;
    if (!scope) {
      scope = this._scope = new Scope(this);
    }
    return scope;
  }

  import(names: string|Array<string|[string, string]>, source: string) {
    const root = this.find((p) => p.node().type === "Program");
    if (!root) throw new Error("Cannot add an import to a detached AST fragment");

    const specifiers = [];

    if (typeof names === "string") {
      specifiers.push(t.importDefaultSpecifier(t.identifier(names)));
    } else {
      names.forEach((name) => {
        let local = name;
        let imported = name;

        if (Array.isArray(name)) {
          local = name[1];
          imported = name[0];
        }

        specifiers.push(t.importSpecifier(t.identifier(local), t.identifier(imported)));
      });
    }

    root.insertStart("body", t.importDeclaration(specifiers, t.stringLiteral(source)));
  }

  find(callback: (path: this) => boolean): this | null {
    let path = this;

    while (!callback(path)) {
      const current = path;
      const next = path.parent();
      if (!next) return null;

      path = next.parent;
      current.destroy();
    }

    return path;
  }

  findParent(callback: (path: this) => boolean): this | null {
    return this.find((path) => {
      return path === this ? false : callback(path);
    });
  }
}
Object.freeze(ASTTraversalPath);
Object.freeze(ASTTraversalPath.prototype);

export default function enter(ast: Node, callback: (path: ASTTraversalPath) => void): Node {
  return ASTTraversalPath.context(ast, callback);
}
