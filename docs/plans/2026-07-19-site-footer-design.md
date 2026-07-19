# Site-wide footer

## Context

The site has a three-layer footer system:

1. **Homepage `Footer.astro`** — the original mailto + `rel="me"` IndieAuth
   link. Homepage-only, unchanged by this work.
2. **`SectionFooter.astro`** (PR #112) — per-post prev/next navigation within
   a section. Lives inside `EntryPage`, i.e. inside the article.
3. **`SiteFooter.astro`** (this design) — a site-wide sign-off on every page
   except the homepage.

## Decisions

- **Job: a quiet door, not a directory.** The nav deliberately holds only
  three items while Poetry, Digital Garden, Tags, Subscribe, and Sitemap stay
  semi-hidden ("the inquisitive discerning reader's browsing experience").
  Enumerating every page in the footer would undo that choice. Instead the
  footer offers one doorway — `/sitemap` — plus identity essentials.
- **Contents:** © 2016–{current year} Tanvi Bhakta · sitemap · subscribe ·
  me@tanvibhakta.in. The year range starts at the repo's first commit (Sept 2016) and the upper bound is computed at build time, so it never goes stale
  (the site rebuilds on every publish).
- **Form: one quiet line.** Centered, small-caps, 0.8rem, ~60% opacity,
  middot-separated, flex-wrap for narrow screens, no border — the same
  visual register as `.post-meta` and `.tag`. It reads as a sign-off, not a
  section.
- **Mount point: `ProseLayout`, after the `<article>`.** Every page except
  the homepage renders through ProseLayout, so "site-wide except home" falls
  out with zero conditional logic. ProseLayout's body is already
  `min-h-screen flex flex-col`, so `margin-top: auto` pins the footer to the
  viewport bottom on short pages and lets it flow after long posts.
- **Registry, not copies:** the subscribe href comes from
  `STANDALONE_PAGES`; `/sitemap` is hardcoded because the sitemap is itself
  the index and belongs to no enumerated set.
- **PR #112 interplay:** SectionFooter arrives through ProseLayout's slot
  (inside the article); SiteFooter mounts after it. Different files, no
  conflict, and reading order on a post is content → prev/next → tags →
  site footer.
