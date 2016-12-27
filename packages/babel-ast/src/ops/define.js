// @flow

type Node = {type: string};
type OperationAllDefinition<T> = (node: MapKey) => T;
type OperationObjectDefinition<T> = {
  any?: (node: Node) => T;
  children?: (node: Array<Node>) => T;
  [type: string]: (node: Node) => T;
};
type OperationDefinition<T> = OperationAllDefinition<T> | OperationObjectDefinition<T>;


type Operation<T> = (node: MapKey) => T;

type MapKey = Node|Array<Node>;
type MapType<T> = WeakMap<MapKey, T>|Map<MapKey, T>;


export default function defineImmutableOp<T>(name: string, definition: OperationDefinition<T>): Operation<T> {
  const map = new WeakMap();
  const handler = cachedOp(standardizeOperation(name, definition));

  const ASTOperation = (arg: MapKey) => handler(map, arg);
  setName(name, ASTOperation);
  return ASTOperation;
}

function setName(name: string, handler: Function): void {
  // Set the function name so we can make debugging easier.
  if (typeof name !== "string") throw new Error(`Invalid operation name ${name}.`);

  const desc = Object.getOwnPropertyDescriptor(handler, "name");
  if (desc && desc.configurable) Object.defineProperty(handler, "name", { value: name });
}

function standardizeOperation<T>(name: string, op: OperationDefinition<T>): Operation<T> {
  if (typeof op === "function") return op;

  return (arg) => {
    if (Array.isArray(arg)) {
      const handler = op.children;
      if (!handler) throw new Error(`Operation ${name} called on unsupported node list`);

      return handler(arg);
    }

    const type = arg.type;
    let handler = op[type];
    if (!handler) {
      handler = op.any;
      if (!handler) throw new Error(`Operation ${name} called on unhandled node type "${type}"`);
    }

    return handler(arg);
  };
}

function cachedOp<T>(op: Operation<T>): (map: MapType<T>, arg: MapKey) => T {
  return (map, arg) => {
    let result = map.get(arg);
    if (!result) {
      result = op(arg);
      map.set(arg, result);
    }
    return result;
  };
}
