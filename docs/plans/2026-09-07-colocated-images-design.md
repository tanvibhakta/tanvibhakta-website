# Colocated images: storage, authoring, and serving

**Date:** 2026-09-07
**Status:** Validated design, not yet implemented

## Goal

Store and serve high-quality images across the site — blog posts, weeknotes,
notes, pages — with responsive delivery (each reader downloads the size and
format their device needs). Authoring works three ways: drag-and-drop in
Sveltia, manually in Zed, and (out of scope for now) via the Telegram notes
webhook.

## Decision summary

Images are committed to the repo, colocated with the content that uses them,
as ≤3000px WebP files. Astro's build-time pipeline generates all responsive
derivatives; Netlify's CDN serves them. No external image service.

**Rejected: Cloudflare (Images / R2 / Image Transformations).** The site
isn't proxied through Cloudflare (DNS is on Netlify/NS1), so edge transforms
would require a DNS migration — bought mostly to get request-time resizing
that build-time already provides at this scale. External storage is also a
second system of record: separate credentials, separate billing, links that
rot independently of the repo. Revisit only via the repo-size threshold below.

**Repo-size math** (the "feels wrong to commit images" numbers): the repo is
34MB today. At ~1–1.5MB per display-grade image, 1GB — where clones start
feeling slow — is 600+ images away. Git never forgets (deleting an image
doesn't shrink history), but photos are add-once content; they don't churn.

**Build-minutes math**: August 2026 (busiest month ever, 26 deploys) used
9.6 of 300 free minutes. Derivatives are cached in `node_modules/.astro`,
which Netlify persists between builds — only new images pay the sharp cost.

## Storage convention

```
posts/blog/2026-09-07-my-post.md
posts/blog/images/darjeeling-tea-garden.webp
posts/weeknotes/images/…
```

- A sibling `images/` folder per collection directory.
- Markdown references are relative: `![alt](images/darjeeling-tea-garden.webp)`.
  This is the form Astro optimizes and the form Sveltia inserts.
- Committed files are **display-grade**: longest edge ≤3000px, WebP q85
  (visually lossless on a 4K screen, ~1–1.5MB). Full-resolution originals
  stay in the photo library; the repo archives what the site serves.
- Filenames are descriptive slugs (`darjeeling-tea-garden.webp`, not
  `IMG_4032.webp`). Sveltia's `slugify_filename` handles its path; manual
  naming is a habit.
- `public/media/` stays as-is for audio and legacy assets.

## Sveltia configuration (`public/admin/config.yml`)

1. Each markdown collection (blog, poetry, weeknotes, digitalGarden, notes,
   pages) gets entry-relative media folders:

   ```yaml
   media_folder: images
   public_folder: images
   ```

   Drag-and-drop / paste into a draft stores the file in the sibling
   `images/` folder and inserts the relative reference. The global
   `media_folder: public/media` remains for the per-field audio overrides.

2. Extend the existing upload transformations with the size cap:

   ```yaml
   transformations:
     raster_image:
       format: webp
       quality: 85
       width: 3000
       height: 3000
   ```

   Every CMS upload lands as a ≤3000px WebP automatically. The canvas-based
   re-encode also strips EXIF/GPS structurally (edge case: an
   already-WebP file may pass through untransformed — the CI check below
   catches it).

## Astro rendering

- **`image: { layout: 'constrained' }`** in `astro.config.mjs`. Every
  relative markdown image site-wide gets responsive `srcset` widths, auto
  `sizes`, WebP output, explicit dimensions (no layout shift), and lazy
  loading. This one line is the "serve to each user as their bandwidth
  allows" requirement. **Depends on Astro ≥5.10** — the version bump happens
  first, in its own worktree/PR.
- **Side-by-side images (albums in posts)**: markdown images written on
  adjacent lines share a `<p>`; blank-line-separated images stack. CSS in
  `global.css` turns multi-image paragraphs into an equal-width row:

  ```css
  .prose p:has(> img + img) {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0.5rem;
  }
  ```

  (plus `object-fit: cover` and a shared `aspect-ratio` for tidy rows).
  Raw HTML `<img>` in markdown is never used — it bypasses the asset
  pipeline entirely.
- **MDX for curated layouts**: add `@astrojs/mdx`, widen loaders to
  `**/*.{md,mdx}`. Individual posts can opt into `.mdx` for component use,
  authored in Zed. MDX does **not** become the default: Sveltia has no MDX
  support (Lexical-based editor outputs plain markdown and would mangle
  JSX on round-trip), and drag-and-drop authoring is a core requirement.
- **`Images.astro`**: generic gallery component (`paths: string[]` +
  optional `sizes`), resolving via `import.meta.glob`, rendering
  `<Picture>` with AVIF/WebP, figure/figcaption for captions, grid for 3+.
  Used from `.mdx` posts now; ready for frontmatter-driven uses later.
- **Lightbox**: ~30 lines of vanilla JS + native `<dialog>`. Every
  `.prose img` opens full-size on tap (mobile full-view), scroll-snap to
  swipe between a post's images. Progressive: no JS → image is still
  visible in place. No library (PhotoSwipe rejected; wavesurfer stays the
  site's only JS dependency of note).

## RSS feeds

`src/utils/feeds.ts` renders markdown itself, so relative image paths would
404 in readers. Fix inside the build: collect each entry's colocated images
via `import.meta.glob('/posts/**/images/*')`, call `getImage()` (cache hit —
derivatives already exist), and rewrite feed-HTML `src` to
`SITE_URL + result.src` at a single fixed width (~1600px). `srcset` isn't
reliable in feed readers.

## Guard rails

- **`pnpm img <file>` script** (`scripts/optimize-image.ts`): sharp — already
  a dependency, no cwebp binary needed — `.rotate()` (bake orientation),
  resize to ≤3000px, WebP `{ quality: 85, effort: 6, smartSubsample: true }`
  (equivalent to `cwebp -q 85 -m 6 -sharp_yuv`). Strips all metadata (sharp's
  default). Prints the markdown snippet to paste.
- **lint-staged guard**: staged raster images under `posts/**/images/` must
  be ≤3000px and metadata-free, else the commit fails with a message
  pointing at `pnpm img`. Blocks, never auto-converts — silent
  `.png → .webp` renames would break already-written markdown references.
- **CI checks** (in the existing `content-validation.yml`, which already
  triggers on `posts/**`; no new secrets):
  - **EXIF/GPS backstop**: scan pushed images, fail on GPS metadata. This is
    the only layer that covers Sveltia commits — the CMS writes via the
    GitHub API from the browser, so pre-commit hooks never run for it.
  - **Repo-size threshold**: `GET /repos/{repo}` (automatic `GITHUB_TOKEN`)
    reports full-history size; fail past **750MB**. Tripping it is the
    signal to design the R2 originals split (repo keeps display grade,
    object storage holds full-res) — not needed before then.
- **Build-time watcher**: a local Netlify build plugin (registered in
  `netlify.toml`) stamps `onPreBuild`, measures at `onEnd`, and POSTs to
  Telegram `sendMessage` past `BUILD_TIME_ALERT_SECONDS` (default 120).
  Bot token and chat ID already exist in Netlify env vars — no new
  credentials, no polling. Best-effort: an alert failure must never fail
  the deploy. Measures the build phase, not full `deploy_time` — that's the
  image-processing regression this guards against.
- **Bandwidth**: no watcher needed; Netlify emails automatically at
  50/75/100% of the free 100GB/month.

## Out of scope (deliberately)

- **Telegram photo ingestion** (webhook download/commit, photo-vs-document
  quality paths, webhook-side EXIF stripping, `media_group_id` album
  machinery). The webhook keeps replying "only plain-text messages become
  notes." A future design can mine the 2026-08-24 brainstorming transcript.
- **R2 originals archive** — parked behind the 750MB CI threshold.
- **LLM alt-text generation** — tracked as a separate GitHub issue; images
  ship with hand-written alt text (or empty) until then.

## Sequencing

1. Astro update to ≥5.10 (separate worktree/PR, already planned).
2. Everything above in one implementation.
