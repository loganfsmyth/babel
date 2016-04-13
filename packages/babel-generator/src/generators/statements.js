import repeating from "repeating";
import * as t from "babel-types";

const NON_ALPHABETIC_UNARY_OPERATORS = t.UPDATE_OPERATORS.concat(t.NUMBER_UNARY_OPERATORS).concat(["!"]);

export function WithStatement(node: Object) {
  this.word("with");
  this.space();
  this.push("(");
  this.print(node.object, node);
  this.push(")");
  this.printBlock(node);
}

export function IfStatement(node: Object) {
  this.word("if");
  this.space();
  this.push("(");
  this.print(node.test, node);
  this.push(")");
  this.space();

  let needsBlock = node.alternate && t.isIfStatement(getLastStatement(node.consequent));
  if (needsBlock) {
    this.push("{");
    this.newline();
    this.indent();
  }

  this.printAndIndentOnComments(node.consequent, node);

  if (needsBlock) {
    this.dedent();
    this.newline();
    this.push("}");
  }

  if (node.alternate) {
    if (this.isLast("}")) this.space();
    this.word("else");
    this.push(" ");
    this.printAndIndentOnComments(node.alternate, node);
  }
}

// Recursively get the last statement.
function getLastStatement(statement) {
  if (!t.isStatement(statement.body)) return statement;
  return getLastStatement(statement.body);
}

export function ForStatement(node: Object) {
  this.word("for");
  this.space();
  this.push("(");

  this._inForStatementInitCounter++;
  this.print(node.init, node);
  this._inForStatementInitCounter--;
  this.semicolon(";");

  if (node.test) {
    this.space();
    this.print(node.test, node);
  }
  this.push(";");

  if (node.update) {
    this.space();
    this.print(node.update, node);
  }

  this.push(")");
  this.printBlock(node);
}

export function WhileStatement(node: Object) {
  this.word("while");
  this.space();
  this.push("(");
  this.print(node.test, node);
  this.push(")");
  this.printBlock(node);
}

let buildForXStatement = function (op) {
  return function (node: Object) {
    this.word("for");
    this.space();
    this.push("(");
    this.print(node.left, node);
    this.push(" ");
    this.word(op);
    this.push(" ");
    this.print(node.right, node);
    this.push(")");
    this.printBlock(node);
  };
};

export let ForInStatement = buildForXStatement("in");
export let ForOfStatement = buildForXStatement("of");

export function DoWhileStatement(node: Object) {
  this.word("do");
  this.push(" ");
  this.print(node.body, node);
  this.space();
  this.word("while");
  this.space();
  this.push("(");
  this.print(node.test, node);
  this.push(")");
  this.semicolon();
}

function buildLabelStatement(prefix, key = "label") {
  return function (node: Object) {
    this.word(prefix);

    let label = node[key];
    if (label) {
      if (!(this.format.minified && ((t.isUnaryExpression(label, { prefix: true }) ||
                                      t.isUpdateExpression(label, { prefix: true })) &&
                                     NON_ALPHABETIC_UNARY_OPERATORS.indexOf(label.operator) > -1))) {
        this.push(" ");

      }

      let terminatorState = this.startTerminatorless();
      this.print(label, node);
      this.endTerminatorless(terminatorState);
    }

    this.semicolon();
  };
}

export let ContinueStatement = buildLabelStatement("continue");
export let ReturnStatement   = buildLabelStatement("return", "argument");
export let BreakStatement    = buildLabelStatement("break");
export let ThrowStatement    = buildLabelStatement("throw", "argument");

export function LabeledStatement(node: Object) {
  this.print(node.label, node);
  this.push(":");
  this.push(" ");
  this.print(node.body, node);
}

export function TryStatement(node: Object) {
  this.word("try");
  this.space();
  this.print(node.block, node);
  this.space();

  // Esprima bug puts the catch clause in a `handlers` array.
  // see https://code.google.com/p/esprima/issues/detail?id=433
  // We run into this from regenerator generated ast.
  if (node.handlers) {
    this.print(node.handlers[0], node);
  } else {
    this.print(node.handler, node);
  }

  if (node.finalizer) {
    this.space();
    this.word("finally");
    this.push(" ");
    this.print(node.finalizer, node);
  }
}

export function CatchClause(node: Object) {
  this.word("catch");
  this.space();
  this.push("(");
  this.print(node.param, node);
  this.push(")");
  this.space();
  this.print(node.body, node);
}

export function SwitchStatement(node: Object) {
  this.word("switch");
  this.space();
  this.push("(");
  this.print(node.discriminant, node);
  this.push(")");
  this.space();
  this.push("{");

  this.printSequence(node.cases, node, {
    indent: true,
    addNewlines(leading, cas) {
      if (!leading && node.cases[node.cases.length - 1] === cas) return -1;
    }
  });

  this.push("}");
}

export function SwitchCase(node: Object) {
  if (node.test) {
    this.word("case");
    this.push(" ");
    this.print(node.test, node);
    this.push(":");
  } else {
    this.word("default");
    this.push(":");
  }

  if (node.consequent.length) {
    this.newline();
    this.printSequence(node.consequent, node, { indent: true });
  }
}

export function DebuggerStatement() {
  this.word("debugger");
  this.semicolon();
}

export function VariableDeclaration(node: Object, parent: Object) {
  this.word(node.kind);
  this.push(" ");

  let hasInits = false;
  // don't add whitespace to loop heads
  if (!t.isFor(parent)) {
    for (let declar of (node.declarations: Array<Object>)) {
      if (declar.init) {
        // has an init so let's split it up over multiple lines
        hasInits = true;
      }
    }
  }

  //
  // use a pretty separator when we aren't in compact mode, have initializers and don't have retainLines on
  // this will format declarations like:
  //
  //   let foo = "bar", bar = "foo";
  //
  // into
  //
  //   let foo = "bar",
  //       bar = "foo";
  //

  let sep;
  if (!this.format.compact && !this.format.concise && hasInits && !this.format.retainLines) {
    sep = () => {
      this.push(",");
      this.push("\n");
      for (var i = 0; i <= node.kind.length; i++){
        this.push(" ");
      }
    };
  }

  //

  this.printList(node.declarations, node, { separator: sep });

  if (t.isFor(parent)) {
    // don't give semicolons to these nodes since they'll be inserted in the parent generator
    if (parent.left === node || parent.init === node) return;
  }

  this.semicolon();
}

export function VariableDeclarator(node: Object) {
  this.print(node.id, node);
  this.print(node.id.typeAnnotation, node);
  if (node.init) {
    this.space();
    this.push("=");
    this.space();
    this.print(node.init, node);
  }
}
