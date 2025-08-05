# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start local development server at localhost:4321
- `npm run build` - Build production site to ./dist/
- `npm run preview` - Preview build locally before deploying
- `npm test` - Run tests with Vitest
- `npm run astro` - Run Astro CLI commands

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

### Code Quality

- ESLint with TypeScript support configured in eslint.config.js
- Prettier formatting with lint-staged for pre-commit hooks
- Husky for git hooks

## Development Notes

- Content files should follow the established frontmatter schema (title, publishedOn)
- New content types require updates to both `src/content.config.ts` and corresponding page routes
- The site deploys to Netlify with build status badge in README
