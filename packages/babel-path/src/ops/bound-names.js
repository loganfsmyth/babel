import * as t from "babel-types";
import { defineOp } from "./helper";
import { childrenOp, childOp } from "./children";

export { BoundNames as default };

const DEFAULT = '*default*';

/**
 * For declarations, get the names they declare.
 */
const BoundNames = defineOp('BoundNames', {
  Identifier(node) {
    return [{
      path: [],
      result: node.name,
    }];
  },
  VariableDeclaration(node) {
    return childrenOp(node, 'declarations', BoundNames);
  },
  VariableDeclarator(node) {
    return childOp(node, 'id', BoundNames);
  },
  ObjectPattern(node) {
    return childrenOp(node, 'properties', (child) => child ? BoundNames(child) : []);
  },
  ObjectProperty(node) {
    return childOp(node, 'value', BoundNames);
  },
  RestProperty(node) {
    return childOp(node, 'argument', BoundNames);
  },
  ArrayPattern(node) {
    return childrenOp(node, 'elements', (child) => child ? BoundNames(child) : []);
  },
  AssignmentPattern(node) {
    return childOp(node, 'left', BoundNames);
  },
  RestElement(node) {
    return childOp(node, 'argument', BoundNames);
  },
  FunctionDeclaration(node) {
    return node.id ? childOp(node, 'id', BoundNames) : [{ path: [], result: DEFAULT }];
  },
  ClassDeclaration(node) {
    return node.id ? childOp(node, 'id', BoundNames) : [{ path: [], result: DEFAULT }];
  },
  ImportDeclaration(node) {
    return childrenOp(node, 'specifiers', BoundNames);
  },
  ImportSpecifier(node) {
    return childOp(node, 'local', BoundNames);
  },
  ImportDefaultSpecifier(node) {
    return childOp(node, 'local', BoundNames);
  },
  ImportNamespaceSpecifier(node) {
    return childOp(node, 'local', BoundNames);
  },
  ExportNamedDeclaration(node) {
    return node.declaration ? childOp(node, 'declaration', BoundNames) : [];
  },
  ExportDefaultDeclaration(node) {
    return t.isDeclaration(node.declaration) ?
      childOp(node, 'declaration', BoundNames) :
      [{ path: [], result: DEFAULT }];
  },
  ExportAllDeclaration(node) {
    return [];
  },
});
