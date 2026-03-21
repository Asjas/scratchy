import eslint from "@eslint/js";
import pluginN from "eslint-plugin-n";
import pluginPromise from "eslint-plugin-promise";
import security from "eslint-plugin-security";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  pluginPromise.configs["flat/recommended"],
  [
    {
      plugins: { "unused-imports": unusedImports },
      rules: {
        "unused-imports/no-unused-imports": "error",
        "unused-imports/no-unused-vars": [
          "warn",
          {
            vars: "all",
            varsIgnorePattern: "^_",
            args: "after-used",
            argsIgnorePattern: "^_",
          },
        ],
      },
    },
    {
      files: ["packages/*/src/**/*.ts", "examples/*/src/**/*.ts"],
      plugins: { security, n: pluginN },
      languageOptions: {
        globals: globals.node,
        parserOptions: {
          ecmaVersion: 2024,
          sourceType: "module",
        },
      },
      rules: {
        "n/no-unpublished-import": "off",
      },
    },
  ],
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      ".cache/**",
    ],
  },
);
