import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginAstro from "eslint-plugin-astro";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Generated/vendored output — without these, dist/ bundles and Astro's
  // generated .d.ts files produce ~145 junk findings.
  globalIgnores(["dist/", ".astro/", ".worktrees/", ".netlify/", "public/"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,astro}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,astro}"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Node-run code: content scripts, tests, CJS utilities
    files: ["scripts/**", "tests/**", "**/*.cjs", "**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  tseslint.configs.recommended,
  eslintPluginAstro.configs.recommended,
  eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
]);
