/* eslint max-len: 0 */

import * as t from "babel-types";

export function AnyTypeAnnotation() {
  this.push("any");
}

export function ArrayTypeAnnotation(node: Object) {
  this.print(node.elementType, node);
  this.push("[");
  this.push("]");
}

export function BooleanTypeAnnotation() {
  this.word("bool");
}

export function BooleanLiteralTypeAnnotation(node: Object) {
  this.word(node.value ? "true" : "false");
}

export function NullLiteralTypeAnnotation() {
  this.word("null");
}

export function DeclareClass(node: Object) {
  this.word("declare");
  this.space();
  this.word("class");
  this.space();
  this._interfaceish(node);
}

export function DeclareFunction(node: Object) {
  this.word("declare");
  this.space();
  this.word("function");
  this.space();
  this.print(node.id, node);
  this.print(node.id.typeAnnotation.typeAnnotation, node);
  this.semicolon();
}

export function DeclareInterface(node: Object) {
  this.word("declare");
  this.space();
  this.InterfaceDeclaration(node);
}

export function DeclareModule(node: Object) {
  this.word("declare");
  this.space();
  this.word("module");
  this.space();
  this.print(node.id, node);
  this.space();
  this.print(node.body, node);
}

export function DeclareTypeAlias(node: Object) {
  this.word("declare");
  this.space();
  this.TypeAlias(node);
}

export function DeclareVariable(node: Object) {
  this.word("declare");
  this.space();
  this.word("var");
  this.space();
  this.print(node.id, node);
  this.print(node.id.typeAnnotation, node);
  this.semicolon();
}

export function ExistentialTypeParam() {
  this.push("*");
}

export function FunctionTypeAnnotation(node: Object, parent: Object) {
  this.print(node.typeParameters, node);
  this.push("(");
  this.printList(node.params, node);

  if (node.rest) {
    if (node.params.length) {
      this.push(",");
      this.space();
    }
    this.push("...");
    this.print(node.rest, node);
  }

  this.push(")");

  // this node type is overloaded, not sure why but it makes it EXTREMELY annoying
  if (parent.type === "ObjectTypeProperty" || parent.type === "ObjectTypeCallProperty" || parent.type === "DeclareFunction") {
    this.push(":");
  } else {
    this.space();
    this.push("=>");
  }

  this.space();
  this.print(node.returnType, node);
}

export function FunctionTypeParam(node: Object) {
  this.print(node.name, node);
  if (node.optional) this.push("?");
  this.push(":");
  this.space();
  this.print(node.typeAnnotation, node);
}

export function InterfaceExtends(node: Object) {
  this.print(node.id, node);
  this.print(node.typeParameters, node);
}

export { InterfaceExtends as ClassImplements, InterfaceExtends as GenericTypeAnnotation };

export function _interfaceish(node: Object) {
  this.print(node.id, node);
  this.print(node.typeParameters, node);
  if (node.extends.length) {
    this.space();
    this.word("extends");
    this.space();
    this.printList(node.extends, node);
  }
  if (node.mixins && node.mixins.length) {
    this.space();
    this.word("mixins");
    this.space();
    this.printList(node.mixins, node);
  }
  this.space();
  this.print(node.body, node);
}

export function InterfaceDeclaration(node: Object) {
  this.word("interface");
  this.space();
  this._interfaceish(node);
}

export function IntersectionTypeAnnotation(node: Object) {
  this.printJoin(node.types, node, {
    separator: () => {
      this.space();
      this.push("&");
      this.space();
    }
  });
}

export function MixedTypeAnnotation() {
  this.word("mixed");
}

export function NullableTypeAnnotation(node: Object) {
  this.push("?");
  this.print(node.typeAnnotation, node);
}

export { NumericLiteral as NumericLiteralTypeAnnotation } from "./types";

export function NumberTypeAnnotation() {
  this.word("number");
}

export function StringLiteralTypeAnnotation(node: Object) {
  this.push(this._stringLiteral(node.value));
}

export function StringTypeAnnotation() {
  this.word("string");
}

export function ThisTypeAnnotation() {
  this.word("this");
}

export function TupleTypeAnnotation(node: Object) {
  this.push("[");
  this.printList(node.types, node);
  this.push("]");
}

export function TypeofTypeAnnotation(node: Object) {
  this.word("typeof");
  this.space();
  this.print(node.argument, node);
}

export function TypeAlias(node: Object) {
  this.word("type");
  this.space();
  this.print(node.id, node);
  this.print(node.typeParameters, node);
  this.space();
  this.push("=");
  this.space();
  this.print(node.right, node);
  this.semicolon();
}

export function TypeAnnotation(node: Object) {
  this.push(":");
  this.space();
  if (node.optional) this.push("?");
  this.print(node.typeAnnotation, node);
}

export function TypeParameterInstantiation(node: Object) {
  this.push("<");
  this.printList(node.params, node, {
    iterator: (node: Object) => {
      this.print(node.typeAnnotation, node);
    }
  });
  this.push(">");
}

export { TypeParameterInstantiation as TypeParameterDeclaration };

export function ObjectTypeAnnotation(node: Object) {
  this.push("{");
  let props = node.properties.concat(node.callProperties, node.indexers);

  if (props.length) {
    this.space();

    this.printJoin(props, node, {
      indent: true,
      iterator: () => {
        if (props.length !== 1) {
          this.semicolon();
          this.space();
        }
      }
    });

    this.space();
  }

  this.push("}");
}

export function ObjectTypeCallProperty(node: Object) {
  if (node.static){
    this.word("static");
    this.space();
  }
  this.print(node.value, node);
}

export function ObjectTypeIndexer(node: Object) {
  if (node.static){
    this.word("static");
    this.space();
  }
  this.push("[");
  this.print(node.id, node);
  this.push(":");
  this.space();
  this.print(node.key, node);
  this.push("]");
  this.push(":");
  this.space();
  this.print(node.value, node);
}

export function ObjectTypeProperty(node: Object) {
  if (node.static){
    this.word("static");
    this.space();
  }
  this.print(node.key, node);
  if (node.optional) this.push("?");
  if (!t.isFunctionTypeAnnotation(node.value)) {
    this.push(":");
    this.space();
  }
  this.print(node.value, node);
}

export function QualifiedTypeIdentifier(node: Object) {
  this.print(node.qualification, node);
  this.push(".");
  this.print(node.id, node);
}

export function UnionTypeAnnotation(node: Object) {
  this.printJoin(node.types, node, {
    separator: () => {
      this.space();
      this.push("|");
      this.space();
    }
  });
}

export function TypeCastExpression(node: Object) {
  this.push("(");
  this.print(node.expression, node);
  this.print(node.typeAnnotation, node);
  this.push(")");
}

export function VoidTypeAnnotation() {
  this.word("void");
}
