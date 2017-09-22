import definitions from "./definitions";

const HELPER_BLACKLIST = ["interopRequireWildcard", "interopRequireDefault"];

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export default function({ types: t }) {
  return {
    pre(file) {
      const {
        moduleName,
        helpers,
        regenerator,
        useBuiltIns,
        useESModules,
      } = this.opts;

      if (this.opts.polyfill === false) {
        throw new Error(
          "babel-runtime's 'polyfill: false' option has been replaced by 'useBuiltIns: true'.",
        );
      }

      this.moduleName = moduleName || "babel-runtime";
      this.referenceCoreJS = !useBuiltIns;
      this.referenceHelpers = helpers !== false;
      this.referenceRegenerator = regenerator !== false;

      const helpersDir =
        "helpers" +
        (this.referenceCoreJS ? "/core-js" : "") +
        (useESModules ? "/es6" : "");

      if (this.referenceHelpers) {
        file.set("helperGenerator", name => {
          if (HELPER_BLACKLIST.indexOf(name) !== -1) return;

          return file.addImport(
            `${this.moduleName}/${helpersDir}/${name}`,
            "default",
            name,
          );
        });
      }
    },

    visitor: {
      ReferencedIdentifier(path, state) {
        const { node, parent, scope } = path;
        if (node.name === "regeneratorRuntime" && this.referenceRegenerator) {
          path.replaceWith(
            this.file.addImport(
              `${this.moduleName}/regenerator`,
              "default",
              "regeneratorRuntime",
            ),
          );
          return;
        }

        if (!this.referenceCoreJS) return;

        if (t.isMemberExpression(parent)) return;
        if (!has(definitions.builtins, node.name)) return;
        if (scope.getBindingIdentifier(node.name)) return;

        // Symbol() -> _core.Symbol(); new Promise -> new _core.Promise
        path.replaceWith(
          state.addImport(
            `${this.moduleName}/core-js/${definitions.builtins[node.name]}`,
            "default",
            node.name,
          ),
        );
      },

      // arr[Symbol.iterator]() -> _core.$for.getIterator(arr)
      CallExpression(path, state) {
        if (!this.referenceCoreJS) return;

        // we can't compile this
        if (path.node.arguments.length) return;

        const callee = path.node.callee;
        if (!t.isMemberExpression(callee)) return;
        if (!callee.computed) return;
        if (!path.get("callee.property").matchesPattern("Symbol.iterator")) {
          return;
        }

        path.replaceWith(
          t.callExpression(
            state.addImport(
              `${this.moduleName}/core-js/get-iterator`,
              "default",
              "getIterator",
            ),
            [callee.object],
          ),
        );
      },

      // Symbol.iterator in arr -> core.$for.isIterable(arr)
      BinaryExpression(path, state) {
        if (!this.referenceCoreJS) return;

        if (path.node.operator !== "in") return;
        if (!path.get("left").matchesPattern("Symbol.iterator")) return;

        path.replaceWith(
          t.callExpression(
            state.addImport(
              `${this.moduleName}/core-js/is-iterable`,
              "default",
              "isIterable",
            ),
            [path.node.right],
          ),
        );
      },

      // Array.from -> _core.Array.from
      MemberExpression: {
        enter(path, state) {
          if (!this.referenceCoreJS) return;
          if (!path.isReferenced()) return;

          const { node } = path;
          const obj = node.object;
          const prop = node.property;

          if (!t.isReferenced(obj, node)) return;
          if (node.computed) return;
          if (!has(definitions.methods, obj.name)) return;

          const methods = definitions.methods[obj.name];
          if (!has(methods, prop.name)) return;

          // doesn't reference the global
          if (path.scope.getBindingIdentifier(obj.name)) return;

          // special case Object.defineProperty to not use core-js when using string keys
          if (
            obj.name === "Object" &&
            prop.name === "defineProperty" &&
            path.parentPath.isCallExpression()
          ) {
            const call = path.parentPath.node;
            if (call.arguments.length === 3 && t.isLiteral(call.arguments[1])) {
              return;
            }
          }

          path.replaceWith(
            state.addImport(
              `${this.moduleName}/core-js/${methods[prop.name]}`,
              "default",
              `${obj.name}$${prop.name}`,
            ),
          );
        },

        exit(path, state) {
          if (!this.referenceCoreJS) return;
          if (!path.isReferenced()) return;

          const { node } = path;
          const obj = node.object;

          if (!has(definitions.builtins, obj.name)) return;
          if (path.scope.getBindingIdentifier(obj.name)) return;

          path.replaceWith(
            t.memberExpression(
              state.addImport(
                `${this.moduleName}/core-js/${definitions.builtins[obj.name]}`,
                "default",
                obj.name,
              ),
              node.property,
              node.computed,
            ),
          );
        },
      },
    },
  };
}

export { definitions };
