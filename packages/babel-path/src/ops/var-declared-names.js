import * as t from "../"
import { defineOp } from "./helper";
import { DirectChildrenOp } from "./children";
import { BoundNames } from "./bound-names";

import { childrenOp, childOp } from "./children";

/**
 * Given a root statement list like a Program or a Function, get the 'var' names.
 *
 * This operation returns explicitly declared vars from 'var' and potentially function declarations.
 * It does _not_ include bindings added by things like function params, or function names and such.
 */
export default defineOp('TopLevelVarDeclaredNames', {
  Program(node) {
    if (node.sourceType === "module") return VarDeclaredNames(node);

    // Top-level functions in Script-goal JS are consindered "var" declarations.
    return DirectChildrenOp(node, TopLevelVarDeclaredItem);
  },
  Function(node) {
    return childOp(node, 'body', (child) => DirectChildrenOp(child, TopLevelVarDeclaredItem));
  },
});

const TopLevelVarDeclaredItem = defineOp('TopLevelVarDeclaredItem', {
  any(node) {
    return VarDeclaredNames(node);
  },
  LabeledStatement(node){
    return DirectChildrenOp(node, TopLevelVarDeclaredItem);
  },
  FunctionDeclaration(node){
    return BoundNames(node);
  },
});

/**
 * Given a nested statement list like a BlockStatement or Switch, get the 'var' names.
 */
const VarDeclaredNames = defineOp('VarDeclaredNames', {
  any(node) {
    return DirectChildrenOp(node, VarDeclaredNames);
  },

  VariableDeclaration(node) {
    return node.kind === 'var' ? BoundNames(node) : [];
  },

  Function(node) {
    return [];
  },
});
