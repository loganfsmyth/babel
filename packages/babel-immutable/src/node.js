export type Node = {
  +type: string;
  [props: string]: ASTValue;
};
export type ASTValue = Array<Node>|Node|string|number|null;
