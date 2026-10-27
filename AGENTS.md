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

## Project guidance

See [CLAUDE.md](./CLAUDE.md), which imports this file and holds
architecture notes and pointers to development commands.
