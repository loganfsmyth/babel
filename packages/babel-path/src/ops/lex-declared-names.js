import * as t from "../"
import { defineOp } from "./helper";
import { BoundNames } from "./bound-names";
import { DirectChildrenOp } from "./children";
import { childrenOp, childOp } from "./children";

/**
 * Given a root statement list like a Program or a Function, get the lexical names.
 *
 * This operation returns explicitly declared vars from 'let' and potentially function declarations.
 * It does _not_ include bindings added by things like function params, or function names and such.
 */
export default defineOp('TopLevelLexicallyDeclaredNames', {
  Program(node) {
    // "module" programs essentially iterate and call straight through and get all functions
    // as lexical
    // "script" and "function"-root scripts consider functions "var" names.
    if (node.sourceType === "module") return LexicallyDeclaredNames(node);

    return DirectChildrenOp(node, TopLevelLexicallyDeclaredItem);
  },
  Function(node) {
    return childOp(node, 'body', (child) => DirectChildrenOp(child, TopLevelLexicallyDeclaredItem));
  },
  BlockStatement(node) {
    return DirectChildrenOp(node, LexicallyDeclaredNames);
  },
  SwitchStatement(node) {
    return DirectChildrenOp(node, LexicallyDeclaredNames);
  },
});

const TopLevelLexicallyDeclaredItem = defineOp('TopLevelLexicallyDeclaredItem', {
  any(node) {
    return LexicallyDeclaredNames(node);
  },

  LabeledStatement(node) {
    return DirectChildrenOp(node, TopLevelLexicallyDeclaredItem);
  },
  FunctionDeclaration(node) {
    return [];
  },
});

/**
 * Given a nested statement list like a BlockStatement or Switch, get the lexical names.
 */
const LexicallyDeclaredNames = defineOp('LexicallyDeclaredNames', {
  any(node) {
    return DirectChildrenOp(node, LexicallyDeclaredNames);
  },

  Function(node) {
    return [];
  },
  BlockStatement(node) {
    return [];
  },
  SwitchStatement(node) {
    return [];
  },

  ForStatement(node) {
    return DirectChildrenOp(node, LexicallyDeclaredNames, node.init && node.init.type === "VariableDeclaration" ? ['init'] : []);
  },
  ForXStatement(node) {
    return DirectChildrenOp(node, LexicallyDeclaredNames, node.left.type === "VariableDeclaration" ? ['left'] : []);
  },

  ImportDeclaration(node) {
    // TODO: Support flow
    return node.importKind === "value" ? BoundNames(node) : [];
  },

  ClassDeclaration(node) {
    return BoundNames(node);
  },

  VariableDeclaration(node) {
    return node.kind !== 'var' ? BoundNames(node) : [];
  },

  FunctionDeclaration(node) {
    return BoundNames(node);
  },
});
