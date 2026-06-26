import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginAstro from "eslint-plugin-astro";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Generated output, vendored code, and worktree checkouts should never be
  // linted. Worktrees under .claude/ and .worktrees/ are full repo copies, so
  // they carry their own dist/ and .astro/ that would otherwise be scanned.
  globalIgnores([
    "**/dist/",
    "**/.astro/",
    "node_modules/",
    ".claude/",
    ".worktrees/",
    "_posts/",
  ]),

  // Base JS + TS recommended rules for all source files.
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  tseslint.configs.recommended,

  // Astro-specific rules + JSX a11y checks for .astro templates.
  // These are flat-config presets that bring their own parser/processor.
  eslintPluginAstro.configs["flat/recommended"],
  eslintPluginAstro.configs["flat/jsx-a11y-recommended"],

  // CommonJS build utilities legitimately use require().
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  // Test mocks often need `any` to stub third-party signatures cheaply.
  {
    files: ["tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

  // The audio player hosts music / spoken-word poetry that ships without a
  // caption track, so the media-has-caption a11y rule doesn't apply here.
  {
    files: ["**/AudioPlayer.astro"],
    rules: { "astro/jsx-a11y/media-has-caption": "off" },
  },
]);
