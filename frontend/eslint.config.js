import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/test/**",
      "tests/**",
      "playwright.config.ts",
      "vitest.config.ts",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  { files: ["eslint.config.js"], languageOptions: { sourceType: "module" } },
);
