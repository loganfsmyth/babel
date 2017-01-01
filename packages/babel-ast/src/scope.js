// @ flow

import {TraversalPath} from "babel-immutable";

type Binding<+T> = {
  type: "this" | "arguments" | "param" | "hoisted" | "var" | "block" | "import";
  declarations: Array<T>;
  references: Array<T>;
};

export default class Scope<+T: TraversalPath> {
  _path: TraversalPath;

  constructor(path: TraversalPath) {
    this._path = path;
  }

  getBinding(name: string): Binding<T> {

  }

  getBindings(): Array<Binding<T>> {

  }

  generateName(kind: string = "var", name: string, index: ?number): string {

  }

  generateNameFromNode(kind: string = "var", node: Node): string {

  }

  declareVariable(kind: string = "var", name: string): T {

  }
}
