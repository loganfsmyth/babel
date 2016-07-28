// @flow

import {
  ALIAS_KEYS,
  FLIPPED_ALIAS_KEYS,
  VISITOR_KEYS,
} from "babel-types";

type ComboOp<T> = Array<T>|T;

type Op<NodeOp, ListOp> = {
  list: null|ListOp,
  any: NodeOp,
  [str: string]: NodeOp,
};
type OperationResult<NodeOp, ListOp> = {
  ops: {
    [type: string]: NodeOp,
  },
  wildcard: NodeOp,
  list: ListOp,
};

type Op0Handler<T0, OpResult> = (arg: ComboOp<T0>) => OpResult;
type Op0<T0, OpResult> = Op<
  (arg: T0) => OpResult,
  (arg: Array<T0>) => OpResult
>;

type Op1Handler<T0, OpResult, T1> = (arg: ComboOp<T0>, a: T1) => OpResult;
type Op1<T0, OpResult, T1> = Op<
  (arg: T0, a: T1) => OpResult,
  (arg: Array<T0>, a: T1) => OpResult
>;

export function defineOp<T0, OpResult>(name: string, operations: Op0<T0, OpResult>): Op0Handler<T0, OpResult> {
  const { ops, wildcard, list } = processOperations(name, operations);

  return setName(name, buildHandler0(name, (node) => {
    if (Array.isArray(node)) {
      if (!list) throw new Error(`Operation ${name} unimplemented on arrays.`);
      return list(node);
    }

    const op = ops[node.type] || wildcard;
    if (!op) throw Error(`Operation ${name} unimplemented on ${node.type}.`);
    return op(node);
  }));
}
export function defineOp1<T0, OpResult, T1>(name: string, operations: Op1<T0, OpResult, T1>): Op1Handler<T0, OpResult, T1> {
  const { ops, wildcard, list } = processOperations(name, operations);

  return setName(name, buildHandler1(name, (node, a) => {
    if (Array.isArray(node)) {
      if (!list) throw new Error(`Operation ${name} unimplemented on arrays.`);
      return list(node, a);
    }

    const op = ops[node.type] || wildcard;
    if (!op) throw Error(`Operation ${name} unimplemented on ${node.type}.`);
    return op(node, a);
  }));
}


function buildHandler0<T0, OpResult>(name: string, op: Op0Handler<T0, OpResult>): Op0Handler<T0, OpResult> {
  const results = new WeakMap();
  const handler = (node) => {
    let result = results.get(node);
    if (!result){
      result = op(node);
      results.set(node, result);
    }
    return result;
  };
  // Add a log helper so we can inspect the cached values for this handler in the console.
  handler.log = () => console.log(name, results);
  return handler;
}

function buildHandler1<T0, OpResult, T1>(name: string, op: Op1Handler<T0, OpResult, T1>): Op1Handler<T0, OpResult, T1> {
  const results = new WeakMap();
  const handler = (node, a: T1) => {
    if (!results.has(node)) results.set(node, new Map());
    const map = results.get(node);

    let result = map.get(a);
    if (!result){
      result = op(node, a);
      map.set(a, result);
    }
    return result;
  };
  // Add a log helper so we can inspect the cached values for this handler in the console.
  handler.log = () => console.log(name, results);
  return handler;
}

function setName<T>(name: string, handler: T): T {
  // Set the function name so we can make debugging easier.
  if (typeof name !== 'string') throw new Error(`Invalid operation name ${name}.`);

  const desc = Object.getOwnPropertyDescriptor(handler, 'name');
  if (desc && desc.configurable) Object.defineProperty((handler: any), 'name', { value: name });

  return handler;
}

/**
 * Standardize an 'operations' object into a function that can be called on a node.
 *
 * Operations are processed in the following order for those that exist:
 *  - The node-type properties
 *  - The alias-type properties
 *  - The wildcard 'any' property.
 *  - The wildcard 'list' property.
 */
function processOperations<NodeOp, ListOp>(name: string, operations: Op<NodeOp, ListOp>): OperationResult<NodeOp, ListOp> {
  if (typeof operations === 'function') operations = {any: operations, list: null};
  if (typeof operations !== 'object' || !operations) throw new Error(`Unknown operations: ${operations}`);

  const groups = Object.keys(operations).reduce((acc, name) => {
    if (typeof operations[name] !== "function" && name !== "list") throw new Error(`Unexpected ${name} operation: ${String(operations[name])}.`);

    if (name === "any") acc.wildcard = operations.any;
    else if (name === "list") acc.list = operations.list;
    else if (ALIAS_KEYS.hasOwnProperty(name)) acc.typed.push(name);
    else if (FLIPPED_ALIAS_KEYS.hasOwnProperty(name)) acc.aliased.push(name);
    else throw new Error(`Unknown node type or alias ${name}.`);
    return acc;
  }, {
    typed: ([]: Array<string>),
    aliased: ([]: Array<string>),
    wildcard: (null : ?NodeOp),
    list: (null : ?ListOp),
  });

  const aliasedOps = {}
  groups.aliased.forEach(alias => FLIPPED_ALIAS_KEYS[alias].forEach(type => {
    if (aliasedOps[type]) throw new Error(`Type ${type} found in both ${alias} and ${aliasedOps[type]}.`);
    aliasedOps[type] = alias;
  }));

  const list = groups.list;
  const wildcard = groups.wildcard;
  const ops = ({}: { [type: string]: NodeOp });
  groups.typed.forEach(type => {
    ops[type] = operations[type];
  });
  Object.keys(aliasedOps).forEach(type => {
    if (!ops[type]) ops[type] = operations[aliasedOps[type]];
  });

  return { ops, wildcard, list };
}
