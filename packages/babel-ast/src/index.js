// @flow

import * as t from "babel-types";
import enterImmutable, {TraversalPath} from "babel-immutable";

import Scope from "./scope";

class ASTTraversalPath extends TraversalPath {
  _scope: Scope<TraversalPath> | null;

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
