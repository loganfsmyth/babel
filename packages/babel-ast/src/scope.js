// @flow

import type {ASTTraversalPath} from "./index";

type ThisBinding = {
  type: "this",
  function: ASTTraversalPath;
  references: Array<ASTTraversalPath>;
};

type ArgumentsBinding = {
  type: "arguments",
  function: ASTTraversalPath,
  references: Array<ASTTraversalPath>,
};

type ImportBinding = {
  type: "import",
  id: ASTTraversalPath,
  declaration: ASTTraversalPath,
  references: Array<ASTTraversalPath>,
};

type BlockBinding = {
  type: "block",
  id: ASTTraversalPath,
  declaration: ASTTraversalPath,
  references: Array<ASTTraversalPath>,
};

type BodyBinding = {
  type: "hoisted",
  id: ASTTraversalPath,
  declaration: ASTTraversalPath,

  // References may include references to functions or params, or var declarations
  references: Array<ASTTraversalPath>,
};

// TODO: Flow bindings appear to essentially be imports, and var-like declarations
// eslint-disable-next-line
type FlowBinding = {
  type: "flow",
  id: ASTTraversalPath,
};

type PrivateBinding = {
  type: "private",
  id: ASTTraversalPath,
  property: ASTTraversalPath,
  references: ASTTraversalPath,
}

type Binding = ThisBinding | ArgumentsBinding | ImportBinding | BlockBinding | BodyBinding | PrivateBinding;

export default class Scope {
  _path: ASTTraversalPath;

  constructor(path: ASTTraversalPath) {
    this._path = path;
  }

  // getBinding(name: string): Binding {

  // }

  // getBindings(): Array<Binding> {

  // }

  // generateName(kind: string = "var", name: string, index: ?number): string {

  // }

  // generateNameFromNode(kind: string = "var", node: Node): string {

  // }

  // declareVariable(kind: string = "var", name: string): T {

  // }
}
