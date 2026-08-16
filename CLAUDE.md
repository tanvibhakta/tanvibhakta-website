# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cross-tool agent rules (worktree workflow) live in AGENTS.md, imported here:

@AGENTS.md

## Development Commands

See README.md for the full list of commands including dev server, build, and test.

## Project Architecture

This is an Astro-based personal website with a content-driven architecture:

### Content Collections System

The site uses Astro's content collections defined in `src/content.config.ts`:

- **blog**: Blog posts in `/posts/blog/` with title and publishedOn frontmatter
- **poetry**: Poetry posts in `/posts/poetry/` with title and publishedOn frontmatter
- **weeknotes**: Weekly notes in `/posts/weeknotes/` with title and publishedOn frontmatter

Each collection uses glob loaders to automatically discover markdown files in their respective directories.

### Page Structure

- Dynamic routes use `[...slug].astro` pattern for content collections
- Index pages provide listing views for each content type
- Content is rendered using Astro's `getCollection()` and `render()` APIs

### Layouts

- `Layout.astro`: Base HTML layout with meta tags, analytics, and IndieAuth setup
- `ProseLayout.astro`: Content-focused layout for blog posts and articles

### Redirects

External redirects configured in `astro.config.mjs`:

- `/weeknotes` → https://tanvibhakta.mataroa.blog (external weeknotes)
- `/resume` → `/resume.pdf`
- `/code` → https://github.com/tanvibhakta

### Styling

Uses Tailwind CSS 4.x with @tailwindcss/vite plugin and @tailwindcss/typography for content styling.

**Reach for Tailwind utilities first.** New components should carry their
styling in `class` attributes, not an Astro scoped `<style>` block. Scoped CSS
is the exception, and each surviving block exists for a reason that a utility
can't cover:

- **Styling elements the component doesn't author.** `ul`/`li` coming out of a
  slot or markdown have no `class` to hang a utility on — hence the bare
  element selectors in `sitemap.astro` and `weeknotes/index.astro`, and the
  `:global(h1)` override in `ProseLayout.astro`.
- **Layouts with no utility equivalent**, e.g. `sitemap.astro`'s
  `grid-template-columns: max-content 1fr` with `display: contents` rows.
- **Winning a specificity fight cheaply.** Global CSS lives outside
  `@layer`, so an unlayered rule beats every Tailwind utility. A scoped block
  is also unlayered, which is why `.arrow-link`'s underline rules override
  prose. In Tailwind, the same override needs `!` — see SiteFooter's
  `text-inherit!`, which beats the global `a` color.

Site-wide element defaults, `@theme`/`@plugin` config, and classes emitted by
rehype plugins (`.anchor-link`) belong in `src/styles/global.css`.

### Code Quality

- ESLint with TypeScript support configured in `eslint.config.js`
- Prettier + lint-staged + Husky for pre-commit formatting and tests (see README for details)

## Development Notes

- Content files should follow the established frontmatter schema (title, publishedOn)
- New content types require updates to both `src/content.config.ts` and corresponding page routes
- The site deploys to Netlify with build status badge in README
