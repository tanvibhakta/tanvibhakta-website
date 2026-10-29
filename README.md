# Tanvi's web home

[![Netlify Status](https://api.netlify.com/api/v1/badges/93203410-0cf6-43bd-8527-49e274e0e091/deploy-status)](https://app.netlify.com/sites/tanvibhakta/deploys)

This project uses astro.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command             | Action                                                  |
| :------------------ | :------------------------------------------------------ |
| `pnpm install`      | Installs dependencies                                   |
| `pnpm dev`          | Starts local dev server at `localhost:4321`             |
| `pnpm build`        | Build your production site to `./dist/`                 |
| `pnpm preview`      | Preview your build locally, before deploying            |
| `pnpm test`         | Run tests with Vitest                                   |
| `pnpm img <file>`   | Optimize an image for posts (≤3000px WebP, no metadata) |
| `pnpm archive`      | Record Wayback Machine snapshots for links in posts     |
| `pnpm astro ...`    | Run CLI commands like `astro add`, `astro check`        |
| `pnpm astro --help` | Get help using the Astro CLI                            |

### Git Hooks

Pre-commit hook runs automatically:

- **lint-staged**: Formats staged files with Prettier
- **tests**: Runs the test suite

## 🧪 Tests

| Test                                    | What it does                                                                                                                                                                                                                                                                                                                             |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linkChecker.test.ts`                   | Builds site, validates all internal links resolve to existing files                                                                                                                                                                                                                                                                      |
| `feeds.test.ts`                         | Tests RSS feed config, collection exclusions, markdown→HTML rendering                                                                                                                                                                                                                                                                    |
| `horizontal-scroll.integration.test.ts` | Loads every built page in headless Chromium at 375px and 1280px; fails if any page scrolls sideways. Needs `pnpm exec playwright install --only-shell chromium` once, or `PLAYWRIGHT_CHROMIUM_PATH` set to an existing Chromium binary. That fallback may not match the build Playwright expects, so a result there can differ from CI's |

## ✍️ Writing Content

**Links in markdown:** Always use relative paths, not full URLs.

```markdown
<!-- ✅ Do this -->

[my post](/blog/my-post)

<!-- ❌ Not this -->

[my post](http://localhost:4321/blog/my-post)
```

Relative paths work in both dev and production. The link checker validates them on every commit.

**Archive links:** the Archive links GitHub Action runs `pnpm archive` after
each content push and weekly. It records a Wayback Machine snapshot for every
external link in published posts (drafts wait until they're published) in
`src/data/archive-links.json` and commits it, except social media, Goodreads,
Spotify, Letterboxd and IMDb (the list is `EXCLUDE` in
`scripts/archive-links.ts`). Creating snapshots that don't exist yet needs the
`ARCHIVE_ORG_ACCESS_KEY` / `ARCHIVE_ORG_SECRET_KEY` repository secrets
(archive.org → account → S3 API keys); without them only existing snapshots
are recorded. Links whose capture keeps failing are listed, with their last
error, in `src/data/archive-attempts.json` and retried less often. The run
goes red when archive.org looks down or rejects the keys. The build adds each
snapshot to its link as an invisible `data-archive` attribute; nothing
displays them yet.

## 📜 Custom Scripts

### transform-files.cjs

Transforms Mataroa blog export files to Astro-compatible frontmatter format.

**Example:**

```bash
node src/utils/transform-files.cjs posts/weeknotes
```

This script converts Mataroa's markdown format (with title and date in the content) to Astro's YAML frontmatter format. It can be run multiple times safely on the same files.
