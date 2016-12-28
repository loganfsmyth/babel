// @flow

import * as t from "babel-types";
import enterImmutable, {TraversalPath} from "babel-immutable";

import Scope from "./scope";

type NodeType = string;

// TODO: Technically we could generate this type in babel-types and import it.
type TraversalHandler = {
  [type: NodeType]: (path: ASTTraversalPath) => void;
};

class ASTTraversalPath extends TraversalPath {
  _scope: Scope<TraversalPath> | null;

  traverse(handler: TraversalHandler): void {
    const types = Object.keys(handler);
    const paths = t.typeQuery(this.node(), types)
      .map(({position, node}) => this.path(position, node));

    this.context(() => paths.forEach((path) => {
      if (!path.active()) return;

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
    const root = this.root();

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
}

export default function enter<U>(ast: {type: number}, callback: (path: ASTTraversalPath) => U): U {
  return enterImmutable(ast, callback, ASTTraversalPath);
}
