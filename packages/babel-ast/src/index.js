// @flow

import * as t from "babel-types";
import TraversalPath from "babel-immutable";

import Scope from "./scope";

type Node = BabelNodeImportDeclaration | BabelNodeStringLiteral;

type NodeType = string;

// TODO: Technically we could generate this type in babel-types and import it.
type TraversalHandler = {
  [type: NodeType]: (path: ASTTraversalPath) => void;
};

class ASTTraversalPath extends TraversalPath<Node> {
  _scope: Scope<ASTTraversalPath> | null;

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

export default function enter(ast: Node, callback: (path: ASTTraversalPath) => void): Node {
  return ASTTraversalPath.context(ast, callback);
}
