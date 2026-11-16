# AGENTS.md

Instructions for coding agents working in this repository.

## Workflow

- All work should happen in its own git worktree. Create one under
  `.worktrees/<branch-name>` (`git worktree add .worktrees/<branch-name> -b <branch-name>`)
  before making changes; never commit directly from the main checkout.

## Prefer existing plugins

- Before writing a custom remark/rehype plugin, Astro integration, or
  component, check Astro's built-ins and the established Astro/unified
  ecosystem (e.g. the `rehypejs`/`remarkjs` orgs) for one that already does
  the job, and use it.
- Roll our own only when there's a concrete reason: the feature isn't
  supported, or the existing option can't be configured to behave the way we
  need. Record that reason in the custom code's header comment (see
  `src/plugins/rehype-external-links.mjs`).

## Components page

- `/components` (`src/showcase/components.mdx`) shows every custom
  component and markdown feature in each variant, with a usage snippet.
  Check it before building UI, and reuse what's there.
- Adding a component, a plugin or a new variant? Add it to that page.
  `tests/components-page.test.ts` fails for a component or plugin file
  missing from it.
- For a UI change, check `/components` at 375, 768 and 1280px, and read
  its colour table for contrast. New colours show up there automatically.

## Project guidance

See [CLAUDE.md](./CLAUDE.md), which imports this file and holds
architecture notes and pointers to development commands.
