// @flow

import type {ASTValue} from "./node";

export type Position = Array<string|number>;


type ParentPosition = {|
  position: Position,
  prop: string,
  index: number | null,
|};

export function parent(position: Position): ParentPosition | null {
  if (position.length === 0) return null;

  let prop = position[position.length - 1];
  let index = null;
  if (typeof prop === "number") {
    index = prop;
    prop = ((position[position.length - 2]: any): string);
    position = position.slice(0, -2);
  } else {
    position = position.slice(0, -1);
  }

  return { position, prop, index };
}

type DirectParentPosition = {|
  position: Position,
  prop: string|number,
|};

export function directParent(position: Position): DirectParentPosition | null {
  if (position.length === 0) return null;

  const prop = position[position.length - 1];
  position = position.slice(0, -1);

  return { position, prop };
}

export function resolve(root: Node, position: Position): ASTValue {
  return position.reduce((acc: any, prop) => acc[prop], root);
}


export function child(position: Position, prop: string): Position {
  return position.concat([prop]);
}


export function deepChild(position: Position, relative: Position): Position {
  return position.concat(relative);
}
