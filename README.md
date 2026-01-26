# Tanvi's web home

[![Netlify Status](https://api.netlify.com/api/v1/badges/93203410-0cf6-43bd-8527-49e274e0e091/deploy-status)](https://app.netlify.com/sites/tanvibhakta/deploys)

This project uses astro.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command             | Action                                           |
| :------------------ | :----------------------------------------------- |
| `pnpm install`      | Installs dependencies                            |
| `pnpm dev`          | Starts local dev server at `localhost:4321`      |
| `pnpm build`        | Build your production site to `./dist/`          |
| `pnpm preview`      | Preview your build locally, before deploying     |
| `pnpm test`         | Run tests with Vitest                            |
| `pnpm astro ...`    | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro --help` | Get help using the Astro CLI                     |

### Git Worktree Commands

| Command                              | Action                                       |
| :----------------------------------- | :------------------------------------------- |
| `pnpm worktree:create <branch-name>` | Create an isolated worktree for feature work |
| `pnpm worktree:list`                 | List all active worktrees                    |
| `pnpm worktree:delete <branch-name>` | Clean up a worktree when done                |

### Git Hooks

Pre-commit hook runs automatically:

- **lint-staged**: Formats staged files with Prettier
- **tests**: Runs the test suite

## 🧪 Tests

| Test                  | What it does                                                          |
| :-------------------- | :-------------------------------------------------------------------- |
| `linkChecker.test.ts` | Builds site, validates all internal links resolve to existing files   |
| `feeds.test.ts`       | Tests RSS feed config, collection exclusions, markdown→HTML rendering |

## ✍️ Writing Content

**Links in markdown:** Always use relative paths, not full URLs.

```markdown
<!-- ✅ Do this -->

[my post](/blog/my-post)

<!-- ❌ Not this -->

[my post](http://localhost:4321/blog/my-post)
```

Relative paths work in both dev and production. The link checker validates them on every commit.

## 📜 Custom Scripts

### transform-files.cjs

Transforms Mataroa blog export files to Astro-compatible frontmatter format.

**Example:**

```bash
node src/utils/transform-files.cjs posts/weeknotes
```

This script converts Mataroa's markdown format (with title and date in the content) to Astro's YAML frontmatter format. It can be run multiple times safely on the same files.
