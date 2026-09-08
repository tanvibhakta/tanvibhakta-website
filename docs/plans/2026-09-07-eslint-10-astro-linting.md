# ESLint 10 + Astro Template Linting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade to ESLint 10 and finally wire up `eslint-plugin-astro` + jsx-a11y so `.astro` templates are actually linted, with a `lint` script and CI enforcement.

**Architecture:** The existing flat config in `eslint.config.js` is the April-2025 init scaffold: it lints only `js/mjs/cjs/ts` (a later edit added ` astro` to the glob with a stray space, which matches nothing), never registered the Astro parser, and has no `ignores`, so generated output (`dist/`, `.astro/`) drowns real findings. We rewrite the config: global ignores, Node globals for scripts/tests/CJS, then `eslint-plugin-astro`'s recommended + jsx-a11y flat configs, which register `astro-eslint-parser` for `.astro` files. Enforcement is a `lint` script + a GitHub Actions job; pre-commit stays prettier+tests (unchanged).

**Tech Stack:** eslint 10.x, @eslint/js 10.x, eslint-plugin-astro 3.x (requires eslint ≥10, typescript-eslint ≥8.61 — satisfied by 8.69 from PR #119), eslint-plugin-jsx-a11y 6.10.2 (peer range lags eslint 10 — warning only, functionally compatible), globals 17.x, typescript-eslint 8.69 (unchanged).

**Branch/worktree:** `.worktrees/eslint-10`, branched from `update-deps` (needs PR #119's typescript-eslint 8.69). If PR #119 merges before this PR opens, rebase onto `main`; otherwise open the PR with base `update-deps` and retarget after merge.

**Known baseline:** `pnpm exec eslint .` currently reports 159 errors: ~145 in generated files (`.astro/*.d.ts`, `dist/` bundles), ~12 in `src/utils/transform-files.cjs` (CJS `require`/`process` under a browser-globals config), 2 real ones in `tests/linkChecker.test.ts`. `.astro` source files: zero, because they're never parsed.

---

### Task 1: Bump the packages

**Files:**

- Modify: `package.json` (devDependencies + `pnpm` key)

**Step 1: Upgrade via CLI (always `@latest`, never hand-edited versions)**

```bash
cd /Users/tanvibhakta/Code/website/tanvibhakta.in/.worktrees/eslint-10
pnpm add -D eslint@latest @eslint/js@latest eslint-plugin-astro@latest globals@latest
```

Expected: installs eslint 10.10.x, @eslint/js 10.0.x, eslint-plugin-astro 3.1.x, globals 17.x. Two warnings are expected and OK:

- unmet peer `eslint@^9` from `eslint-plugin-jsx-a11y` (fixed in Step 2)
- engines warning from eslint-plugin-astro (`node ^24.16.0` vs local 24.13) — advisory only; see Task 5.

**Step 2: Silence the jsx-a11y peer warning**

Add to `package.json` (top level, after `"packageManager"`):

```json
"pnpm": {
  "peerDependencyRules": {
    "allowedVersions": {
      "eslint-plugin-jsx-a11y>eslint": "^10"
    }
  }
},
```

Then re-run `pnpm install` and confirm the peer warning is gone. (Why this is safe: 6.10.2 uses none of the APIs eslint 10 removed — verified by grepping the installed package — and eslint-plugin-astro 3.x itself declares eslint ≥10 and jsx-a11y ≥6.10.2 as simultaneous peers. Remove this override when jsx-a11y ships eslint-10 peer support: upstream issue jsx-eslint/eslint-plugin-jsx-a11y#1075.)

**Step 3: Verify versions**

```bash
pnpm exec eslint --version
```

Expected: `v10.x.x`

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "bump eslint to 10, eslint-plugin-astro to 3, globals to 17"
```

---

### Task 2: Rewrite eslint.config.js

**Files:**

- Modify: `eslint.config.js` (full replacement, it's 17 lines)

**Step 1: Replace the config with:**

```js
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
```

Notes for the implementer:

- The glob fix (`ts,astro` — no space) plus the two plugin configs at the end are the point of this task. The plugin configs register `astro-eslint-parser` for `*.astro`; order matters — they come after `tseslint.configs.recommended` so their parser settings win for `.astro` files.
- `defineConfig` flattens nested arrays, so the plugin's config arrays can be listed directly.
- `node_modules` is ignored by ESLint automatically; the `globalIgnores` entries are the repo-specific ones.

**Step 2: Verify `.astro` files are now parsed**

```bash
pnpm exec eslint --print-config src/pages/index.astro | head -20
```

Expected: JSON output whose `languageOptions.parser` mentions `astro-eslint-parser` (before this task, `--print-config` on an `.astro` file reports the file is ignored/unmatched).

**Step 3: Verify the junk findings are gone**

```bash
pnpm exec eslint . 2>&1 | tail -5
```

Expected: total drops from 159 to roughly a dozen problems, none in `dist/`, `.astro/`, or `src/utils/transform-files.cjs`. Findings in `tests/linkChecker.test.ts` and possibly new findings in `.astro`/`.ts` files remain — fixed in Task 3.

**Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "wire astro + jsx-a11y plugins into eslint config, add ignores"
```

---

### Task 3: Triage and fix the findings

**Files:**

- Modify: `tests/linkChecker.test.ts:36` (unused `error` binding in catch)
- Modify: `tests/linkChecker.test.ts:157` (`prefer-const` for `pathname`)
- Modify: whatever the newly-linted `.astro` files and ESLint 10's three new recommended rules (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`) surface — unknown until the config lands.

**Step 1: Get the full list**

```bash
pnpm exec eslint . > /tmp/eslint-findings.txt 2>&1; cat /tmp/eslint-findings.txt
```

**Step 2: Fix the two known ones**

- `linkChecker.test.ts:36`: change `catch (error) {` to `catch {` (the binding is unused).
- `linkChecker.test.ts:157`: change `let pathname` to `const pathname`.

**Step 3: Triage the rest — rules of engagement**

- Genuine bugs or dead code: fix.
- jsx-a11y findings in templates (missing alt, click-without-key, etc.): fix the markup — these are the whole reason we wired the plugin in. If a fix needs a design decision (e.g. what alt text), leave a `TODO` comment, add an inline `eslint-disable-next-line` with the rule name, and list it in the PR description for Tanvi.
- A rule that's wrong for this codebase across the board: turn it off in `eslint.config.js` with a one-line comment saying why — but expect zero or one of these; do not mass-disable to get to green.

**Step 4: Verify clean**

```bash
pnpm exec eslint .
```

Expected: exit 0, no output (or only the deliberately-TODO'd disables).

**Step 5: Run the full gates (bare, never piped through tail)**

```bash
pnpm typecheck
pnpm test
```

Expected: both exit 0; tests are 101+ passing including build + link check.

**Step 6: Commit**

```bash
git add -A
git commit -m "fix lint findings surfaced by astro-aware eslint"
```

---

### Task 4: Add the lint script and CI job

**Files:**

- Modify: `package.json` (scripts)
- Create: `.github/workflows/lint.yml`

**Step 1: Add the script** — in `package.json` scripts, after `"typecheck"`:

```json
"lint": "eslint .",
```

**Step 2: Create `.github/workflows/lint.yml`** (mirrors the setup steps of `content-validation.yml`):

```yaml
name: Lint

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: "package.json"
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - run: pnpm lint
```

Pre-commit is deliberately left unchanged (prettier + tests): lint runs in CI where a failure blocks merge but not a commit. If Tanvi later wants it in pre-commit, add `"*.{js,mjs,cjs,ts,astro}": ["eslint --max-warnings 0"]` to lint-staged — not part of this plan.

**Step 3: Verify the script**

```bash
pnpm lint
```

Expected: exit 0.

**Step 4: Commit**

```bash
git add package.json .github/workflows/lint.yml
git commit -m "add lint script and CI lint job"
```

---

### Task 5: Node engines footnote (no code change)

`eslint-plugin-astro@3.1.0` declares engines `node ^22.22.3 || ^24.16.0 || >=26.3.0`; local Node is 24.13.0. pnpm warns but does not fail, and nothing observed breaks. Housekeeping (outside this plan's commits): update Node to the latest 24.x locally when convenient; Netlify's `NODE_VERSION = "24"` already tracks latest 24.x images.

---

### Task 6: Open the PR

**Step 1: Push**

```bash
git push -u origin eslint-10
```

**Step 2: PR** — write the body with the Write tool to a scratch file, then `gh pr create --body-file` (never a heredoc). Base: `main` if PR #119 has merged (rebase first), else `update-deps` with a note to retarget. Body must cover: the history (scaffold config never wired the plugins, glob typo), what's newly linted, every jsx-a11y TODO left for Tanvi's judgment, and the jsx-a11y peer-override removal condition (upstream #1075).
