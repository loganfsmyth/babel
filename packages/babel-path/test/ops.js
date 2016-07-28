require("babel-traverse")
var babylon = require("babylon");
var expect = require("chai").expect;

var children = require("../lib/ops/children").Children;
var directChildren = require("../lib/ops/children").Children;
var varDeclaredNames = require("../lib/ops/var-declared-names");
var lexDeclaredNames = require("../lib/ops/lex-declared-names");



suite("children", function() {
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

  test("basic functionality", function() {
    var ast = buildAST();
    var results = children(ast);

    expect(results.map(item => item.path)).to.eql([
      ["program"],
      ["program", "body", 0],
      ["program", "body", 0, "declarations", 0],
      ["program", "body", 0, "declarations", 0, "id"],
      ["program", "body", 0, "declarations", 0, "init"],
      ["program", "body", 0, "declarations", 1],
      ["program", "body", 0, "declarations", 1, "id"],
      ["program", "body", 0, "declarations", 1, "init"],
      ["program", "body", 1],
      ["program", "body", 1, "id"],
      ["program", "body", 1, "params", 0],
      ["program", "body", 1, "params", 0, "left"],
      ["program", "body", 1, "params", 0, "right"],
      ["program", "body", 1, "body"],
      ["program", "body", 1, "body", "body", 0],
      ["program", "body", 1, "body", "body", 0, "expression"],
      ["program", "body", 1, "body", "body", 0, "expression", "callee"],
      ["program", "body", 1, "body", "body", 0, "expression", "callee", "object"],
      ["program", "body", 1, "body", "body", 0, "expression", "callee", "property"],
      ["program", "body", 1, "body", "body", 0, "expression", "arguments", 0],
      ["program", "body", 2],
      ["program", "body", 2, "expression"],
      ["program", "body", 2, "expression", "callee"],
    ]);
    results.forEach(result => {
      expect(result.result).to.equal(result.path.reduce((acc, prop) => acc[prop], ast));
    });
  });
  test("type search", function() {
    var ast = buildAST();
    var results = children(ast, "Identifier");

    expect(results.map(item => item.path)).to.eql([
      ["program", "body", 0, "declarations", 0, "id"],
      ["program", "body", 0, "declarations", 1, "id"],
      ["program", "body", 1, "id"],
      ["program", "body", 1, "params", 0, "left"],
      ["program", "body", 1, "body", "body", 0, "expression", "callee", "object"],
      ["program", "body", 1, "body", "body", 0, "expression", "callee", "property"],
      ["program", "body", 1, "body", "body", 0, "expression", "arguments", 0],
      ["program", "body", 2, "expression", "callee"],
    ]);
    results.forEach(result => {
      expect(result.result).to.equal(result.path.reduce((acc, prop) => acc[prop], ast));
    });
  });
});

suite("var/lex declared names", function() {
  function buildAST(module) {
    return babylon.parse(`
      let zero;
      var one;
      var {two, three: {four: five = zero}} = {};
      let six;
      const seven = 3;

      function func() {
        var inner;
      }

      {
        let block;
        var eight;
        function func2(){
          var nine;

          function fn(){
            var fourteen;
          }
          {
            let seventeen;
            var thirteen;
          }
        }
      }

      switch (true) {
        case false:
          var ten;
          let eighteen;
        case true:
          let nineteen;
      }

      try {
        var eleven;
        let fifteen;
      } catch (e) {
        var twelve;
        let sixteen;
      }

      for (var i;;) {
        var j;
      }

      for (let k;;) {
        let l;
      }

      ${module ? `
        import def, * as namespace from "foo";
        import {spec, specEx as specIm} from "foo";
      ` : ''}
    `, { sourceType: module ? 'module' : 'script' });
  }

  it('should work as expected in a module', function() {
    var ast = buildAST(true /* module */);

    expect(varDeclaredNames(ast.program).map(item => [item.result, item.path])).to.eql([
      ["one", ["body", 1, "declarations", 0, "id"]],
      ["two", ["body", 2, "declarations", 0, "id", "properties", 0, "value"]],
      ["five", ["body", 2, "declarations", 0, "id", "properties", 1, "value", "properties", 0, "value", "left"]],
      ["eight", ["body", 6, "body", 1, "declarations", 0, "id"]],
      ["ten", ["body", 7, "cases", 0, "consequent", 0, "declarations", 0, "id"]],
      ["eleven", ["body", 8, "block", "body", 0, "declarations", 0, "id"]],
      ["twelve", ["body", 8, "handler", "body", "body", 0, "declarations", 0, "id"]],
      ["i", ["body", 9, "init", "declarations", 0, "id"]],
      ["j", ["body", 9, "body", "body", 0, "declarations", 0, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program).map(item => [item.result, item.path])).to.eql([
      ["zero", ["body", 0, "declarations", 0, "id"]],
      ["six", ["body", 3, "declarations", 0, "id"]],
      ["seven", ["body", 4, "declarations", 0, "id"]],
      ["func", ["body", 5, "id"]],
      ["def", ["body", 11, "specifiers", 0, "local"]],
      ["namespace", ["body", 11, "specifiers", 1, "local"]],
      ["spec", ["body", 12, "specifiers", 0, "local"]],
      ["specIm", ["body", 12, "specifiers", 1, "local"]],
    ]);
    expect(varDeclaredNames(ast.program.body[6].body[2]).map(item => [item.result, item.path])).to.eql([
      ["nine", ["body", "body", 0, "declarations", 0, "id"]],
      ["fn", ["body", "body", 1, "id"]],
      ["thirteen", ["body", "body", 2, "body", 1, "declarations", 0, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program.body[6].body[2]).map(item => [item.result, item.path])).to.eql([]);
    expect(lexDeclaredNames(ast.program.body[6]).map(item => [item.result, item.path])).to.eql([
      ["block", ["body", 0, "declarations", 0, "id"]],
      ["func2", ["body", 2, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program.body[7]).map(item => [item.result, item.path])).to.eql([
      ["eighteen", ["cases", 0, "consequent", 1, "declarations", 0, "id"]],
      ["nineteen", ["cases", 1, "consequent", 0, "declarations", 0, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program.body[10].body).map(item => [item.result, item.path])).to.eql([
      ["l", ["body", 0, "declarations", 0, "id"]],
    ]);
  });

  it('should work as expected in a script', function() {
    var ast = buildAST(false /* module */);

    expect(varDeclaredNames(ast.program).map(item => [item.result, item.path])).to.eql([
      ["one", ["body", 1, "declarations", 0, "id"]],
      ["two", ["body", 2, "declarations", 0, "id", "properties", 0, "value"]],
      ["five", ["body", 2, "declarations", 0, "id", "properties", 1, "value", "properties", 0, "value", "left"]],
      ["func", ["body", 5, "id"]],
      ["eight", ["body", 6, "body", 1, "declarations", 0, "id"]],
      ["ten", ["body", 7, "cases", 0, "consequent", 0, "declarations", 0, "id"]],
      ["eleven", ["body", 8, "block", "body", 0, "declarations", 0, "id"]],
      ["twelve", ["body", 8, "handler", "body", "body", 0, "declarations", 0, "id"]],
      ["i", ["body", 9, "init", "declarations", 0, "id"]],
      ["j", ["body", 9, "body", "body", 0, "declarations", 0, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program).map(item => [item.result, item.path])).to.eql([
      ["zero", ["body", 0, "declarations", 0, "id"]],
      ["six", ["body", 3, "declarations", 0, "id"]],
      ["seven", ["body", 4, "declarations", 0, "id"]],
    ]);
    expect(varDeclaredNames(ast.program.body[6].body[2]).map(item => [item.result, item.path])).to.eql([
      ["nine", ["body", "body", 0, "declarations", 0, "id"]],
      ["fn", ["body", "body", 1, "id"]],
      ["thirteen", ["body", "body", 2, "body", 1, "declarations", 0, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program.body[6].body[2]).map(item => [item.result, item.path])).to.eql([]);
    expect(lexDeclaredNames(ast.program.body[6]).map(item => [item.result, item.path])).to.eql([
      ["block", ["body", 0, "declarations", 0, "id"]],
      ["func2", ["body", 2, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program.body[7]).map(item => [item.result, item.path])).to.eql([
      ["eighteen", ["cases", 0, "consequent", 1, "declarations", 0, "id"]],
      ["nineteen", ["cases", 1, "consequent", 0, "declarations", 0, "id"]],
    ]);
    expect(lexDeclaredNames(ast.program.body[10].body).map(item => [item.result, item.path])).to.eql([
      ["l", ["body", 0, "declarations", 0, "id"]],
    ]);
  });
});
