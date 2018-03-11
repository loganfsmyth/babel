import { declare } from "@babel/helper-plugin-utils";
import transformTypeScript from "@babel/plugin-transform-typescript";

export default declare(
  (api, { jsxPragma, allExtensions = false, isTSX = false }) => {
    api.assertVersion(7);

    if (typeof allExtensions !== "boolean") {
      throw new Error(".allExtensions must be a boolean, or undefined");
    }
    if (typeof isTSX !== "boolean") {
      throw new Error(".isTSX must be a boolean, or undefined");
    }

    if (isTSX && !allExtensions) {
      throw new Error("isTSX:true requires allExtensions:true");
    }

    return {
      // Leave 'extensions' out of the 'overrides' because it should be activated
      // even if no filename has been given to Babel. This allows Babel to
      // potentially pick up the extension list when doing an up-front loading
      // of Babel's root config.
      extensions: {
        ".ts": true,
        ".tsx": true,

        // Ensure that Babel skips these, since otherwise it will just see them
        // as simple .ts files.
        ".d.ts": false,
      },
      overrides: allExtensions
        ? [
            {
              plugins: [[transformTypeScript, { jsxPragma, isTSX }]],
            },
          ]
        : [
            {
              // Only set 'test' if explicitly requested, since it requires that
              // Babel is being called`
              test: /\.ts$/,
              plugins: [[transformTypeScript, { jsxPragma }]],
            },
            {
              // Only set 'test' if explicitly requested, since it requires that
              // Babel is being called`
              test: /\.tsx$/,
              plugins: [[transformTypeScript, { jsxPragma, isTSX: true }]],
            },
          ],
    };
  },
);
