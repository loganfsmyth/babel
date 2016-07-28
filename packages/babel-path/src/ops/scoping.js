import {
  defineOp,
} from "./";

import referencedBindings from "./referenced-bindings";
import declaredBindings from "./declared-bindings";

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
  const existingNames = getKnownBindings(root, path, kind, allowShadow);

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

function getKnownBindings(path: TraversalPath, kind, allowShadow: boolean) {
  if (allowShadow) {
    if (kind === 'var') {
      const blocks = [];
      let tmp = path;
      do {
        if (t.isFunction(tmp)){
          blocks.pop();
          blocks.push(tmp);
          break;
        }
        blocks.push(tmp);

        if (t.isProgram(tmp)) break;
      } while (tmp = tmp.parent().path);

    }



  }

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


