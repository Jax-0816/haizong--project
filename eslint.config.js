import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
      "public/uploads/**",
      ".codegraph/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".cursor/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-redeclare": "error",
      "no-unsafe-negation": "error",
      "no-unreachable": "error",
    },
  },
];
