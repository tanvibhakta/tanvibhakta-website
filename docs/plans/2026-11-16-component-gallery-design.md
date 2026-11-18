# Component gallery (`/components`)

## Why

One page that renders every custom-built component and markdown feature in
each of its variants. It replaces what Storybook would do, without installing
and maintaining Storybook. It exists for agents (and Tanvi) to:

1. **Reuse** — see what already exists, with a copyable usage snippet, before
   building something new.
2. **Check colour accessibility** — every colour the site uses, with its
   contrast against the page background.
3. **Check responsiveness** — every component on one page, at full width, so
   one pass at 375 / 768 / 1280px covers them all.
4. **Prepare for dark mode** — the colour inventory is the list of hard-coded
   colours that each need a dark counterpart or a theme token.

## Goals / non-goals

- Goal: complete — a test fails if a component or plugin is missing.
- Goal: real — markdown features render through the real remark/rehype
  pipeline, with real notes and photos, not hand-copied HTML.
- Non-goal: dark mode itself; an automated axe check (a good follow-up).
- Anti-goal: a second component framework to maintain (Storybook et al.).

## Approaches

- **MDX rendered by an Astro page (chosen).** `src/showcase/components.mdx`
  holds the content; `src/pages/components.astro` renders it inside
  ProseLayout and fills `Astro.locals.headings` so TableOfContents works.
  Markdown features go through the real plugins, so the page cannot drift.
- Plain `.astro` page with hand-written HTML for markdown output. Rejected:
  it drifts from what the plugins actually emit.
- Storybook. Rejected: the software Tanvi no longer wants to maintain.

## Decisions

- URL `/components`, not in the nav, `noindex` (it is a working page, not
  writing). Branch `component-gallery` off `delhi-travelogue`, which adds
  NoteEmbed and TableOfContents.
- Each entry: what it is, its file, a usage snippet, then each variant under
  a label naming its props.
- Site chrome (Header, Nav, Footer, SiteFooter) and EntryPage are skipped:
  they are on every page. The skip list lives in the completeness test.
- Colour inventory (`src/utils/colour-inventory.ts`) scans `src/` at build
  time for Tailwind colour utilities, `var(--color-*)` and `oklch()` literals,
  resolves them against Tailwind's theme and `global.css`, and computes WCAG
  contrast against the page background (stone-100) with `culori`. Text
  colours are held to 4.5:1, everything else to 3:1 (WCAG 1.4.11). It cannot
  see opacity applied on top (e.g. Note's footer at `opacity-75`).
- Responsiveness is already enforced: `tests/horizontal-scroll.integration.test.ts`
  loads every built page at 375 and 1280px, so `/components` is covered.
- AGENTS.md gains a rule: check `/components` before building UI, add new
  components to it.
