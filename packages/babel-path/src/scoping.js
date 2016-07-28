import {
  defineOp,
  LexicallyDeclaredNames,
  TopLevelLexicallyDeclaredNames,
  TopLevelVarDeclaredNames,
  DirectChildren,
} from "./";

/**
 * Given a name and a location in the AST, find it's declaration(s). While lexical declarations
 * will only have a single declaration, var declarations and function-scoped function declarations may have multiple declarations.
 */
export function getBinding(root, path, name): Array<Node> {


  return { references, bindings };
}

/**
 * Given a name and a location in the AST,
 */
export function renameBinding(root, path, name, newName): string {
  const binding = getBinding(root, path, name);

  binding.references.forEach(reference.set('name', newName));
  binding.bindings.forEach(reference.set('name', newName));
}

/**
 * Given an array of variable names, return a matching array of variable names that can be used without
 * breaking code if they were inserted into the given scope.
 */
export function createBindingIdentifiers(root, path, nameHints: Array<string>, kind: 'var'|'fn'|'let'|'const' = 'var',
    allowShadow: boolean = true): Array<string> {
  const existingNames = getKnownBindings(root, path, allowShadow);

  return nameHints.map(hint => {
    hint = "_" + hint;

    let result = existingNames.has(hint) ? null : hint;
    for (let i = 0; !result; i++) {
      const possibility = hint + i;
      if (!existingNames.has(possibility)) result = possibility;
    }

    existingNames.add(result);
    return result;
  });
}

function getKnownBindings(root, path, allowShadow: boolean) {
  const { parents } = path.reduce((acc, parent) => ({
    parents: [acc.node[parent], ...acc.parents],
    node: acc.node[parent],
  }), {
    parents: [root],
    node: root,
  });

  // Find all scoping blocks up
  const scopeParents = parents.reduce((acc, parent) => {
    // For If shadowing is allowed, we only need to care about the current function and blocks,
    // so we don't have to check all of the parents, just some of them.
    if (allowShadow && acc.root) return acc;

    if (t.isFunction(parent) && parent.type === "BlockStatement") {
      acc.root = parent;
      acc.blocks.pop();
      acc.blocks.push(parent);
    }
    else if (BINDING_TYPES.has(parent.type)) {
      acc.blocks.push(parent);
    }

    return acc;
  }, {
    root: null,
    blocks: [],
  }).blocks;

  let existingNames;
  if (!allowShadow) {
    // FIXME: This isn't quite right because it could shadow variables in child scopes
    existingNames = new Set([
      ...scopeParents.reduce((acc, item) => acc.reduce(DeclaredBindings(item)), []),
      ...ReferencedBindings(scopeParents[0]),
      ...ReferencedBindings(scopeParents[scopeParents.length - 1])
    ]);
  } else if (kind === 'var' || (kind === 'fn' && (t.isFunction(scopeParents[0]) || t.isProgram(scopeParents[0])))) {
    existingNames = new Set([
      ...scopeParents.reduce((acc, item) => acc.reduce(DeclaredBindings(item)), []),
      ...ReferencedBindings(scopeParents[0]),
    ]);
  } else {
    existingNames = new Set([
      ...DeclaredBindings(scopeParents[0]),
      ...ReferencedBindings(parents[0]),
    ]);
  }

  return existingNames;
}



const DirectChildrenReferences = (node, excludeKeys) => {
  const items = Array.isArray(node) ? node : DirectChildren(node, excludeKeys);

  return items.reduce((acc, child) => acc.concat(ReferencedBindings(child)));
};

const ReferencedBindings = defineOp('ReferencedBindings', {
  any(node) {
    // Automatically drill down into all child nodes.
    return DirectChildrenReferences(node);
  },

  Identifier(node) {
    return BoundNames(node);
  },

  ThisExpression(node) {
    return ["this"];
  },

  MemberExpression(node) {
    // yes: PARENT[NODE]
    // yes: NODE.child
    // no: parent.NODE
    return DirectChildrenReferences(node, node.computed ? [] : ['property']);
  },
  JSXMemberExpression(node) {
    // yes: PARENT[NODE]
    // yes: NODE.child
    // no: parent.NODE
    return DirectChildrenReferences(node, node.computed ? [] : ['property']);
  },
  MetaProperty(node) {
    return DirectChildrenReferences(node, ['object', 'property']);
  },
  ObjectProperty(node) {
    // yes: { [NODE]: "" }
    // yes: { NODE }
    // no: { NODE: "" }
    return DirectChildrenReferences(node, node.computed ? [] : ['key']);
  },
  ClassProperty(node) {
    // no: class { NODE = value; }
    // yes: class { key = NODE; }
    return DirectChildrenReferences(node, node.computed ? [] : ['key']);
  },
  JSXAttribute(node) {
    // no: <div NODE="foo" />
    return DirectChildrenReferences(node, ['name']);
  },
  LabeledStatement(node) {
    // no: NODE: for (;;) {}
    return DirectChildrenReferences(node, ['label']);
  },
  ExportDeclaration(node) {
    return DirectChildrenReferences(node, node.source ? ['specifiers'] : []);
  },
  ExportSpecifier(node){
    return DirectChildrenReferences(node, ['exported']);
  },
  ExportNamespaceSpecifier(node) {
    return DirectChildrenReferences(node, ['exported']);
  },
  ExportDefaultSpecifier(node) {
    return DirectChildrenReferences(node, ['exported']);
  },
  ImportSpecifier(node) {
    return DirectChildrenReferences(node, ['imported']);
  },


  Program(node) {
    const bindings = DeclaredBindings(node);

    return DirectChildrenReferences(node).filter(name => bindings.indexOf(name) === -1);
  },

  // Not used for function bodies.
  BlockStatement(node) {
    const bindings = DeclaredBindings(node);

    return DirectChildrenReferences(node).filter(name => bindings.indexOf(name) === -1);
  },

  SwitchStatement(node) {
    const bindings = DeclaredBindings(node);

    return DirectChildrenReferences(node).filter(name => bindings.indexOf(name) === -1);
  },

  Function(node) {
    const fnBindings = DeclaredBindings(node);
    const bodyBindings = DeclaredBindings(node.body, true /* functionBody */);

    const keyRefs = (node.key && node.computed) ? DirectChildrenReferences(node.key) : [];
    const decoratorRefs = DirectChildrenReferences(node.decorators);
    const paramRefs = DirectChildrenReferences(node.params);
    const bodyRefs = DirectChildrenReferences(node.body);

    return [
      ...keyRefs,
      ...decoratorRefs,
      ...paramRefs.filter(name => fnBindings.indexOf(name) === -1),
      ...bodyRefs.filter(name => fnBindings.indexOf(name) === -1 && bodyBindings.indexOf(name) === -1),
    ];
  },

  Class(node) {
    const classBindings = DeclaredBindings(node);

    const decoratorsRefs = DirectChildrenReferences(node.decorators);
    const superRefs = node.superClass ? DirectChildrenReferences(node.superClass) : [];
    const bodyRefs = DirectChildrenReferences(node.body);

    return [
      ...decoratorsRefs,
      ...superRefs.filter(name => classBindings.indexOf(name) === -1),
      ...bodyRefs.filter(name => classBindings.indexOf(name) === -1),
    ];
  },

  ClassProperty(node) {
    // TODO: How should this handle computed class props, e.g. `[this] = this;`
    const propBindings = DeclaredBindings(node);

    return DirectChildrenReferences(node).filter(name => bindings.indexOf(name) === -1);
  },

  For(node) {
    const bindings = DeclaredBindings(node);

    return ReferencedBindings(node).filter(name => bindings.indexOf(name) === -1);
  },

  CatchClause(node) {
    const bindings = DeclaredBindings(node);

    return DirectChildrenReferences(node).filter(name => bindings.indexOf(name) === -1);
  },
});

const BINDING_TYPES = new Set([
  'Program',
  'BlockStatement',
  'SwitchStatement',
  'ClassProperty',
  'Function',
  'Class',
  'For',
  'CatchClause',
])


const DeclaredBindings = defineOp1('ReferencedBindings', {
  Program(node) {
    return [
      ...TopLevelLexicallyDeclaredNames(node),
      ...TopLevelVarDeclaredNames(node),
    ];
  },

  Function(node) {
    const specialBindings = node.type === "ArrowFunctionExpression" ? ['this', 'arguments'] : [];

    return [
      ...specialBindings,
      ...(node.id ? BoundNames(node.id) : []),
      ...node.params.reduce((acc, param) => acc.concat(BoundNames(param))),
    ];
  },

  // Not used for function bodies.
  BlockStatement(node, functionStatement) {
    if (functionStatement) {
      return [
        ...TopLevelLexicallyDeclaredNames(node),
        ...TopLevelVarDeclaredNames(node),
      ];
    }

    return LexicallyDeclaredNames(node);
  },

  SwitchStatement(node) {
    return LexicallyDeclaredNames(node);
  },

  ClassProperty(node) {
    return node.static ? [] : ['this'];
  },

  Class(node) {
    return node.id ? BoundNames(node.id) : [];
  },

  ForStatement(node) {
    if (node.init && node.init.type === "VariableDeclaration" && node.init.kind !== "var") {
      return BoundNames(node.init);
    }
    return [];
  },

  ForXStatement(node) {
    if (node.left.type === "VariableDeclaration" && node.left.kind !== "var") {
      return BoundNames(node.left);
    }
    return [];
  },

  CatchClause(node) {
    return LexicallyDeclaredNames(node);
  },
});

