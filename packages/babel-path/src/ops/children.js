import { VISITOR_KEYS } from "babel-types";
import { defineOp, defineOp1 } from './helper';

export function childrenOp(node, prop, op) {
  return node[prop].reduce((acc, child, i) => acc.concat(op(child).map(result => ({
    path: [prop, i, ...result.path],
    result: result.result,
  }))), []);
}
export function childOp(node, prop, op) {
  return op(node[prop]).map(result => ({
    path: [prop, ...result.path],
    result: result.result,
  }));
}

export const DirectChildrenOp = (node, operation, excludeKeys) => {
  return DirectChildren(node, excludeKeys).reduce((acc, child) => acc.concat(operation(child[1]).map(item => ({
    path: [...child[0], ...item.path],
    result: item.result,
  }))), []);
};

export const DirectChildren = defineOp1('DirectChildren', (node, excludeKeys) => {
  // Get the paths to all the direct children.
  return VISITOR_KEYS[node.type].reduce((acc, key) => {
    if (excludeKeys && excludeKeys.indexOf(key) !== -1) return acc;

    const property = node[key];
    const items = Array.isArray(property) ? property.map((item, i) => [[key, i], item]) : [[[key], property]];
    return acc.concat(items.filter((pair) => !!pair[1]));
  }, []);
});

/**
 * Given a node, find all of it's child nodes. Ordering TBD.
 * Also allows filtering by node type.
 */
export const Children = defineOp1('Children', (parent, type = null) => {
  return DirectChildrenOp(parent, (node) => {
    if (!node) return [];
    const item = (type === null || node.type === type) ? { path: [], result: node } : null;
    return [...(item ? [item] : []), ...Children(node, type)];
  }, []);
});
