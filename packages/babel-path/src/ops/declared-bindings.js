import boundNames from "./bound-names";
import varDeclaredNames from "./var-declared-names";
import lexDeclaredNames from "./lex-declared-names";

export default defineOp1('DeclaredBindings', {
  any(node) {
    return [];
  },

  Program(node) {
    return [
      ...varDeclaredNames(node),
      ...lexDeclaredNames(node),
    ];
  },

  Function(node) {
    const specialBindings = node.type === "ArrowFunctionExpression" ? ['this', 'arguments'].map(name => ({ path: [], result: name })) : [];

    return [
      ...specialBindings,
      ...(node.id ? childOp(node, 'id', boundNames) : []),
      ...childrenOp(node, 'params', boundNames),
      ...varDeclaredNames(node),
      ...lexDeclaredNames(node),
    ];
  },

  BlockStatement(node) {
    return lexDeclaredNames(node);
  },

  SwitchStatement(node) {
    return lexDeclaredNames(node);
  },

  ClassProperty(node) {
    // This is maybe a little weird, but the rest of the handling is covered
    // by logic in ReferencedBindings.
    return node.static ? [] : [{ path: [], result: 'this' }];
  },

  Class(node) {
    return node.id ? childOp(node, 'id', boundNames) : [];
  },

  ForStatement(node) {
    if (node.init && node.init.type === "VariableDeclaration" && node.init.kind !== "var") {
      return childOp(node, 'init', boundNames)
    }
    return [];
  },

  ForXStatement(node) {
    if (node.left.type === "VariableDeclaration" && node.left.kind !== "var") {
      return childOp(node, 'left', boundNames)
    }
    return [];
  },

  CatchClause(node) {
    return childOp(node, 'argument', boundNames);
  },
});
