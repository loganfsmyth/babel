import { defineOp1 } from "./helper";
import declaredBindings from "./declared-bindings";
import { DirectChildrenOp } from "./children";

export { ReferencedBindings as default };

// TODO: This should take flow bindings into account.
const ReferencedBindings = defineOp1('ReferencedBindings', {
  any(node, excludeOwnBindings) {
    const bindings = excludeOwnBindings ? [] : declaredBindings(node);

    return DirectChildrenOp(node, ReferencedBindings).filter(ref => bindings.some(binding => binding.result === ref.result));
  },

  Function(node, excludeOwnBindings) {
    const bindings = excludeOwnBindings ? [] : declaredBindings(node);

    return DirectChildrenOp(node, ReferencedBindings).filter(ref => {
      // References inside decorators are unaffected by bindings inside the functions.
      if (ref.path[0] === "decorators") return true;

      // Function names are binding declarations, not references.
      if (ref.path[0] === "id") return false;

      // References in keys are only valid for computed keys.
      if (ref.path[0] === "key") return !!node.computed;

      // References from inside function params are not affected by body declarations.
      if (ref.path[0] === "params") return bindings.some(binding => binding.path[0] !== "body" && binding.result === ref.result);

      return bindings.some(binding => binding.result === ref.result);
    });
  },

  Class(node, excludeOwnBindings) {
    const bindings = excludeOwnBindings ? [] : declaredBindings(node);

    return DirectChildrenOp(node, ReferencedBindings).filter(ref => {
      // References inside decorators are unaffected by class name bindings.
      if (ref.path[0] === "decorators") return true;

      return bindings.some(binding => binding.result === ref.result);
    });
  },

  ClassProperty(node, excludeOwnBindings) {
    const bindings = excludeOwnBindings ? [] : declaredBindings(node);

    return DirectChildrenOp(node, ReferencedBindings).filter(ref => {
      // References inside property keys are unaffected by class property bindings.
      if (ref.path[0] === "key") return !!node.computed;

      return bindings.some(binding => binding.result === ref.result);
    });
  },

  Identifier(node) {
    return BoundNames(node);
  },

  ThisExpression(node) {
    return [{
      path: [],
      result: "this",
    }];
  },

  MemberExpression(node) {
    // yes: PARENT[NODE]
    // yes: NODE.child
    // no: parent.NODE
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] === "property" ? node.computed : true);
  },
  JSXMemberExpression(node) {
    // yes: PARENT[NODE]
    // yes: NODE.child
    // no: parent.NODE
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] === "property" ? node.computed : true);
  },
  MetaProperty(node) {
    return [];
  },
  ObjectProperty(node) {
    // yes: { [NODE]: "" }
    // yes: { NODE }
    // no: { NODE: "" }
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] === "key" ? node.computed : true);
  },
  ClassProperty(node) {
    // no: class { NODE = value; }
    // yes: class { key = NODE; }
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] === "key" ? node.computed : true);
  },
  JSXAttribute(node) {
    // no: <div NODE="foo" />
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] !== "name");
  },
  LabeledStatement(node) {
    // no: NODE: for (;;) {}
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] !== "label");
  },
  ExportNamedDeclaration(node) {
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] === "specifiers" ? !node.source : true);
  },
  ExportSpecifier(node){
    return DirectChildrenOp(node, ReferencedBindings).filter(ref =>
      ref.path[0] === "local");
  },
  ImportSpecifier(node) {
    return [];
  },
});
