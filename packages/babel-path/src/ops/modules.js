import * as t from "../";
import { defineOp } from "./helper";
import {BoundNames} from "./bound-names";

/**
 * Get the set of module paths that should be loaded.
 */
export const ModuleRequests = defineOp('ModuleRequests', {
  Program(node) {
    if (node.sourceType !== "module") return [];

    return node.body.reduce((acc, child) => acc.concat(ModuleRequests(child)), []);
  },

  ExportNamedDeclaration(node) {
    return node.source ? ModuleRequests(node.source) : [];
  },

  ExportDefaultDeclaration(node) {
    return [];
  },

  ExportAllDeclaration(node) {
    return ModuleRequests(node.source);
  },

  ImportDeclaration(node) {
    return node.source ? ModuleRequests(node.source) : [];
  },

  StringLiteral(node) {
    return [node.value];
  },

  Declaration(node) {
    return [];
  },
  Statement(node) {
    return [];
  },
});

/**
 * Get the names of the local bindings that are being exported.
 */
export const ExportedBindings = defineOp('ExportedBindings', {
  Program(node) {
    if (node.sourceType !== "module") return [];

    return node.body.reduce((acc, child) => acc.concat(ExportedBindings(child)), []);
  },

  ExportNamedDeclaration(node) {
    if (node.source) return [];
    if (node.declaration) return BoundNames(node.declaration);

    return node.specifiers.reduce((acc, spec) => acc.concat(ExportedBindings(spec)), []);
  },

  ExportDefaultDeclaration(node) {
    return BoundNames(node);
  },

  ExportAllDeclaration(node) {
    return [];
  },

  Identifier(node) {
    return [ node.name ];
  },
  ExportSpecifier(node) {
    return ExportedBindings(node.local);
  },
  ExportDefaultSpecifier(node) {
    return [];
  },
  ExportNamespaceSpecifier(node) {
    return [];
  },

  Declaration(node) {
    return [];
  },
  Statement(node) {
    return [];
  },
});

/**
 * Get the names of the variables exported from this module.
 */
export const ExportedNames = defineOp('ExportedNames', {
  Program(node) {
    if (node.sourceType !== "module") return [];

    return node.body.reduce((acc, child) => acc.concat(ExportedNames(child)), []);
  },

  ExportNamedDeclaration(node) {
    if (node.declaration) return BoundNames(node.declaration);

    return node.specifiers.reduce((acc, spec) => acc.concat(ExportedNames(spec)), []);
  },

  ExportDefaultDeclaration(node) {
    return ['default'];
  },

  ExportAllDeclaration(node) {
    return [];
  },

  Identifier(node) {
    return [ node.name ];
  },
  ExportSpecifier(node) {
    return ExportedBindings(node.exported);
  },
  ExportDefaultSpecifier(node) {
    return ExportedBindings(node.exported);
  },
  ExportNamespaceSpecifier(node) {
    return ExportedBindings(node.exported);
  },

  Declaration(node) {
    return [];
  },
  Statement(node) {
    return [];
  },
});

/**
 * Get the names of the variables exported from this module.
 */
export const ExportedEntries = defineOp('ExportedEntries', {
  Program(node) {
    if (node.sourceType !== "module") return [];

    return node.body.reduce((acc, child) => acc.concat(ExportedEntries(child)), []);
  },

  ExportNamedDeclaration(node) {
    if (node.declaration){
      return BoundNames(node.declaration).map(name => ({
        request: null,
        importName: null,
        localName: name,
        exportName: name,
      }));
    }

    return node.specifiers.reduce((acc, spec) => {
      if (t.isExportSpecifier(spec)) {
        return acc.concat({
          request: node.source ? node.source.value : null,
          importName: node.source ? spec.local.name : null,
          localName: node.source ? null : spec.local.name,
          exportName: spec.exported.name,
        });
      } else if (t.isDefaultExportSpecifier(spec)) {
        return acc.concat({
          request: node.source ? node.source.value : null,
          importName: node.source ? 'default' : null,
          localName: node.source ? null : 'default',
          exportName: spec.exported.name,
        });
      } else if (t.isNamespaceExportSpecifier(spec)) {
        return acc.concat({
          request: node.source ? node.source.value : null,
          importName: '*',
          localName: null,
          exportName: spec.exported.name,
        });
      }
    }, []);
  },

  ExportDefaultDeclaration(node) {
    return BoundNames(node.declaration).map(name => ({
      request: null,
      importName: null,
      localName: name,
      exportName: "default",
    }));
  },

  ExportAllDeclaration(node) {
    return [{
      request: node.source.value,
      importName: '*',
      localName: null,
      exportName: null,
    }];
  },

  Declaration(node) {
    return [];
  },
  Statement(node) {
    return [];
  },
});
