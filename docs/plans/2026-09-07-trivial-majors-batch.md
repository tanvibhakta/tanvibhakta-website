# Trivial Majors Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Take the zero-risk major bumps — markdown-it 15, @types/node 26, lint-staged 17 — in one small PR.

**Architecture:** All three are majors whose breaking changes don't touch this codebase: markdown-it 15 is a TS/ESM rewrite with an unchanged public API (our entire usage is `new MarkdownIt()` + `.render()` in `src/utils/feeds.ts:17`, and its headline break — fuzzy autolinking off by default — is moot because `linkify` was never enabled); lint-staged 17's breaks are Windows/YAML-config concerns (ours is a JSON glob→prettier in package.json); @types/node 26 is type tracking. markdown-it 15 bundles its own types, so `@types/markdown-it` gets removed.

**Tech Stack:** markdown-it 15.x, lint-staged 17.x, @types/node 26.x. NOT in this batch: globals 17 (rides with the eslint-10 plan), sharp 0.35 (rides with the astro-7 plan — it's currently inert anyway, since Astro 5.x resolves its own sharp 0.34 under pnpm).

**Branch/worktree:** `.worktrees/chore-majors`, branched from `main` after PR #119 merges (`git worktree add .worktrees/chore-majors -b chore-majors` from an up-to-date main checkout). No dependency on the other tracks.

---

### Task 1: Bump and prune

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

**Step 1: Upgrade via CLI**

```bash
cd /Users/tanvibhakta/Code/website/tanvibhakta.in/.worktrees/chore-majors
pnpm add markdown-it@latest
pnpm add -D @types/node@latest lint-staged@latest
pnpm remove @types/markdown-it
```

Expected: markdown-it 15.0.x, @types/node 26.x, lint-staged 17.x installed; @types/markdown-it gone. No peer warnings expected.

**Step 2: Verify the types actually resolve from the package**

```bash
pnpm typecheck
```

Expected: exit 0. If `src/utils/feeds.ts` errors on the MarkdownIt import, the bundled types export shape changed — check `node_modules/markdown-it/package.json` `exports`/`types` fields before touching code.

---

### Task 2: Verify behavior and gates

**Step 1: Run the test suite (bare, never piped)**

```bash
pnpm test
```

Expected: all tests pass (101+, including the feeds tests that snapshot markdown-it's rendered HTML, plus full build + link check). Known risk: markdown-it 15's CommonMark-compliance fixes (link destinations, entity decoding, image alt text) can shift feed HTML by a character — if a feeds test fails, eyeball the diff; if it's a spec-compliance improvement, update the expectation, and say so in the commit message.

**Step 2: Verify lint-staged still fires**

The commit in Task 3 exercises it — husky runs lint-staged on pre-commit. Watch for prettier running on staged files in the commit output.

---

### Task 3: Commit and PR

**Step 1: Commit** (message via Write tool + `git commit -F`, never a heredoc):

```
update markdown-it, lint-staged, and @types/node across majors
```

Body: note the @types/markdown-it removal (types now bundled) and that linkify was never enabled so the autolink change is moot. Confirm the commit landed with `git log -1` — the pre-commit gate can reject silently.

**Step 2: Push and open PR**

```bash
git push -u origin chore-majors
```

`gh pr create --body-file <scratch-file>` — body: what bumped, what each major's breaking changes were and why none apply here, test results.
