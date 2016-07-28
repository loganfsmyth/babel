require("babel-traverse")
var babylon = require("babylon");
var expect = require("chai").expect;

var pathRoot = require("../lib/path").default;

function buildAST() {
  return babylon.parse(`
    var foo = 4,
        bar = "value";

    function fn(arg = {}) {
      console.log(arg);
    }

    fn();
  `, { sourceType: 'module' });
}

suite("path", function() {
  test("basic functionality", function() {
    var ast = buildAST();
    var finalAst = pathRoot(ast, (path) => {
      expect(path.type).to.eql("File");
      expect(path.node).to.equal(ast);
      expect(path.child("program").type).to.eql("Program");
      expect(path.child("program").node).to.equal(ast.program);
    });

    expect(finalAst).to.equal(ast);
  });

  suite("access", function() {
    suite("children", function() {
      test("access children", function() {
        var ast = buildAST();
        var finalAst = pathRoot(ast, (path) => {
          var body = path.child("program").children("body");

          expect(body[0].type).to.eql("VariableDeclaration");
          expect(body[1].type).to.eql("FunctionDeclaration");
          expect(body[2].type).to.eql("ExpressionStatement");
        });
        expect(finalAst).to.equal(ast);
      });

      test("throw on invalid children", function() {
        expect(function() {
          var ast = buildAST();
          var finalAst = pathRoot(ast, (path) => {
            path.child("unknown");
          });
        }).to.throw(Error);
      });
    });

    suite("props", function() {
      test("access props", function() {
        var ast = buildAST();
        var finalAst = pathRoot(ast, (path) => {
          var declar = path.child("program").children("body")[0];

          expect(declar.get("kind")).to.eql("var");
          expect(declar.children("declarations").map((d) => d.child("init").get("value"))).to.eql([4, "value"]);
        });
        expect(finalAst).to.equal(ast);
      });

      test("throw on invalid props", function() {
        expect(function() {
          var ast = buildAST();
          var finalAst = pathRoot(ast, (path) => {
            path.get("program");
          });
        }).to.throw(Error);
      });
    });

    suite("parents", function() {
      test("root node", function() {
        var ast = buildAST();

        var finalAst = pathRoot(ast, (path) => {
          var progParent = path.parent();
          expect(progParent.path).to.be.null;
          expect(progParent.prop).to.be.null
          expect(progParent.index).to.be.null;
        });
        expect(finalAst).to.equal(ast);
      });

      test("direct child", function() {
        var ast = buildAST();

        var finalAst = pathRoot(ast, (path) => {
          var progParent = path.child("program").parent();
          expect(progParent.path.node).to.equal(ast);
          expect(progParent.prop).to.eql("program");
          expect(progParent.index).to.be.null;
        });
        expect(finalAst).to.equal(ast);
      });

      test("list child", function() {
        var ast = buildAST();

        var finalAst = pathRoot(ast, (path) => {
          var progParent = path.child("program").children("body")[1].parent();
          expect(progParent.path.node).to.equal(ast.program);
          expect(progParent.prop).to.eql("body");
          expect(progParent.index).to.eql(1);
        });
        expect(finalAst).to.equal(ast);
      });
    });
  });

  suite("mutation", function() {
    test("property mutation", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        var declar = path.child("program", "body", 0);

        path.child("program").set("sourceType", "script");

        expect(declar.active()).to.be.true;
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).not.to.equal(ast.program.sourceType);
      expect(finalAst.program.sourceType).to.equal("script");
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).to.equal(ast.program.body);
    });

    test("direct child insertion", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        var declar = path.child("program", "body", 0);
        var id = path.child("program", "body", 1, "id");

        path.child("program").children("body")[1].setChild("id", {type: "Identifier", name: "newFn"});

        expect(id.active()).to.be.false;
        expect(declar.active()).to.be.true;
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[1]).not.to.equal(ast.program.body[1]);
      expect(finalAst.program.body[1].id).not.to.equal(ast.program.body[1].id);
      expect(finalAst.program.body[1].id.name).to.equal("newFn");
      expect(finalAst.program.body[1].params).to.equal(ast.program.body[1].params);
      expect(finalAst.program.body[1].body).to.equal(ast.program.body[1].body);
      expect(finalAst.program.body[2]).to.equal(ast.program.body[2]);
    });

    test("child list insertion", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        var prog = path.child("program");
        var declar = path.child("program", "body", 0, "declarations", 0);
        var id = path.child("program", "body", 1, "id");

        path.child("program", "body", 0).setChildren("declarations", [{
          type: "VariableDeclarator",
          id: { type: "Identifier", name: "hello" },
        }]);

        expect(prog.active()).to.be.true;
        expect(declar.active()).to.be.false;
        expect(id.active()).to.be.true;
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).not.to.equal(ast.program.body[0]);
      expect(finalAst.program.body[0].declarations).not.to.equal(ast.program.body[0].declarations);
      expect(finalAst.program.body[0].declarations[0].id.name).to.equal("hello");
      expect(finalAst.program.body[1]).to.equal(ast.program.body[1]);
      expect(finalAst.program.body[2]).to.equal(ast.program.body[2]);
    });

    test("direct child replacement", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {

        path.child("program", "body", 1, "id").replace({type: "Identifier", name: "newFn"});

      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[1]).not.to.equal(ast.program.body[1]);
      expect(finalAst.program.body[1].id).not.to.equal(ast.program.body[1].id);
      expect(finalAst.program.body[1].id.name).to.equal("newFn");
      expect(finalAst.program.body[1].params).to.equal(ast.program.body[1].params);
      expect(finalAst.program.body[1].body).to.equal(ast.program.body[1].body);
      expect(finalAst.program.body[2]).to.equal(ast.program.body[2]);
    });

    test("direct child replacement", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {

        path.child("program", "body", 1).replace({
          type: "ExpressionStatement",
          expression: { type: "StringLiteral", value: "hello" }
        });

      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[1]).not.to.equal(ast.program.body[1]);
      expect(finalAst.program.body[1].type).to.equal("ExpressionStatement");
      expect(finalAst.program.body[1].expression.type).to.equal("StringLiteral");
      expect(finalAst.program.body[1].expression.value).to.equal("hello");
      expect(finalAst.program.body[2]).to.equal(ast.program.body[2]);
    });

    test("direct child removal", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        path.child("program", "body", 1, "id").remove();
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[1]).not.to.equal(ast.program.body[1]);
      expect(finalAst.program.body[1].id).to.be.null;
      expect(finalAst.program.body[1].params).to.equal(ast.program.body[1].params);
      expect(finalAst.program.body[1].body).to.equal(ast.program.body[1].body);
      expect(finalAst.program.body[2]).to.equal(ast.program.body[2]);
    });

    test("child list removal", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        path.child("program", "body", 1).remove();
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[1]).to.equal(ast.program.body[2]);
    });

    test("insert before", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        path.child("program", "body", 0).insertBefore({
          type: "ExpressionStatement",
          expression: { type: "StringLiteral", value: "hello" }
        });
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.eql({
        type: "ExpressionStatement",
        expression: { type: "StringLiteral", value: "hello" }
      });
      expect(finalAst.program.body[1]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[2]).to.equal(ast.program.body[1]);
      expect(finalAst.program.body[3]).to.equal(ast.program.body[2]);
    });

    test("insert after", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        path.child("program", "body", 0).insertAfter({
          type: "ExpressionStatement",
          expression: { type: "StringLiteral", value: "hello" }
        });
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[1]).to.eql({
        type: "ExpressionStatement",
        expression: { type: "StringLiteral", value: "hello" }
      });
      expect(finalAst.program.body[2]).to.equal(ast.program.body[1]);
      expect(finalAst.program.body[3]).to.equal(ast.program.body[2]);
    });

    test("insert start", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        path.child("program").insertStart("body", {
          type: "ExpressionStatement",
          expression: { type: "StringLiteral", value: "hello" }
        });
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.eql({
        type: "ExpressionStatement",
        expression: { type: "StringLiteral", value: "hello" }
      });
      expect(finalAst.program.body[1]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[2]).to.equal(ast.program.body[1]);
      expect(finalAst.program.body[3]).to.equal(ast.program.body[2]);
    });

    test("insert end", function() {
      var ast = buildAST();

      var finalAst = pathRoot(ast, (path) => {
        path.child("program").insertEnd("body", {
          type: "ExpressionStatement",
          expression: { type: "StringLiteral", value: "hello" }
        });
      });
      expect(finalAst).not.to.equal(ast);
      expect(finalAst.program).not.to.equal(ast.program);
      expect(finalAst.program.sourceType).to.equal(ast.program.sourceType);
      expect(finalAst.program.directives).to.equal(ast.program.directives);
      expect(finalAst.program.body).not.to.equal(ast.program.body);
      expect(finalAst.program.body[0]).to.equal(ast.program.body[0]);
      expect(finalAst.program.body[1]).to.equal(ast.program.body[1]);
      expect(finalAst.program.body[2]).to.equal(ast.program.body[2]);
      expect(finalAst.program.body[3]).to.eql({
        type: "ExpressionStatement",
        expression: { type: "StringLiteral", value: "hello" }
      });
    });
  });

  suite("context", function() {
    test("deactivate paths", function() {
      var ast = buildAST();

      var prog, declar;
      var finalAst = pathRoot(ast, (path) => {
        prog = path.child("program");

        path.context(() => {
          declar = prog.child("body", 0);
        });

        expect(prog.type).to.equal("Program");
        expect(() => declar.type).to.throw(Error);
        expect(prog.active()).to.be.true;
        expect(declar.active()).to.be.false;
      });
      expect(finalAst).to.equal(ast);

      expect(() => prog.type).to.throw(Error);
      expect(() => declar.type).to.throw(Error);
      expect(prog.active()).to.be.false;
      expect(declar.active()).to.be.false;
    });

    test("not deactivate cloned paths", function() {
      var ast = buildAST();

      var prog, declar;
      var finalAst = pathRoot(ast, (path) => {
        prog = path.child("program");

        path.context(() => {
          declar = prog.child("body", 0).clone();
        });

        expect(prog.type).to.equal("Program");
        expect(declar.type).to.equal("VariableDeclaration");
        expect(prog.active()).to.be.true;
        expect(declar.active()).to.be.true;
      });
      expect(finalAst).to.equal(ast);

      expect(() => prog.type).to.throw(Error);
      expect(declar.type).to.equal("VariableDeclaration");
      expect(prog.active()).to.be.false;
      expect(declar.active()).to.be.true;
    });
  });
});
