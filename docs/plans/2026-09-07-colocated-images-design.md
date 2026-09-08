# Colocated images: storage, authoring, and serving

**Date:** 2026-09-07
**Status:** Implemented (PR #120, 2026-09-08). Execution log with all
review deviations: `2026-09-07-colocated-images-plan.md`. The build-time
alert was verified end-to-end on the deploy preview; the Sveltia
drag-and-drop smoke test remains as a post-merge check.

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

**Repo-size math** (the "feels wrong to commit images" numbers): full git
history is 34MB today (measured via `git count-objects`/`du .git` in the main
checkout — worktrees show less because their `.git` is a pointer file). At ~1–1.5MB per display-grade image, 1GB — where clones start
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

- A sibling `images/` folder per collection directory (same shape for
  poetry, digital-garden, notes, and pages). Note this folder is shared by
  every entry in the collection — Sveltia's relative `media_folder` resolves
  against the _collection_ folder, not per-entry — so ambiguous filenames
  (`sunset.webp`) should be prefixed with the post slug to avoid cross-post
  collisions.
- Markdown references are relative: `![alt](images/darjeeling-tea-garden.webp)`.
  This is the form Astro optimizes and the form Sveltia inserts.
- Committed files are **display-grade**: longest edge ≤3000px, WebP q95
  (bumped from q85 in PR #120 review). Rationale: the committed file is the
  _source_ Astro re-encodes derivatives from — readers never download it —
  so q95 eliminates generational loss at ~1.5–2MB per photo, while q100
  would double the bytes for an imperceptible gain. Full-resolution
  originals stay in the photo library; the repo archives what the site
  serves.
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
       quality: 95
       width: 3000
       height: 3000
   ```

   Every CMS upload lands as a ≤3000px WebP automatically. The canvas-based
   re-encode also strips EXIF/GPS structurally (edge case: an
   already-WebP file may pass through untransformed — the CI check below
   catches it). Smoke-test on first setup that `width` + `height` together
   act as a bounding box (non-square image stays undistorted), not a crop —
   Sveltia's docs describe each independently but not the combination.

## Astro rendering

- **`image: { layout: 'constrained' }`** in `astro.config.mjs`. Every
  relative markdown image site-wide gets responsive `srcset` widths, auto
  `sizes`, WebP output, explicit dimensions (no layout shift), and lazy
  loading. This one line is the "serve to each user as their bandwidth
  allows" requirement. **Depends on Astro ≥5.10** — the bump is part of
  this implementation (a regular in-range `pnpm update astro`).
  Set `image.breakpoints` explicitly (e.g. `[640, 960, 1280, 1600, 2048]`):
  the article column is `md:w-1/2` (~50vw on desktop), and Astro's default
  `sizes` is derived from intrinsic width, so without tuning, desktop
  browsers over-fetch. Accepted slack, minimized by the breakpoint set.
- **Albums via a grouping plugin — drag-and-drop IS album authoring.** A
  rehype plugin in the existing markdown pipeline wraps any run of
  consecutive image-only paragraphs in a gallery container
  (`<figure class="gallery" data-count="N">`). Two ordering/shape
  constraints discovered in review:
  - It must be registered in `markdown.rehypePlugins` **before**
    `rehypeAnchors`, which appends an anchor link to every `<p>` — grouping
    first means image paragraphs stop matching; grouping after would bake
    stray `#` links into galleries.
  - `remark-breaks` is active, so images on adjacent lines arrive as ONE
    `<p>` with `<br>` separators, while blank-line-separated images arrive
    as consecutive `<p>`s. The plugin must normalize both shapes (and drop
    the `<br>`s). Layout by
    count: 1 full-width, 2 side-by-side, 3+ a grid (`object-fit: cover`,
    shared `aspect-ratio`; classes styled in `global.css`, where
    plugin-emitted classes belong). Captions use markdown's title syntax:
    `![alt](images/chai.webp "Chai break")` → `<figcaption>`. Prose between
    images breaks the group — adjacency always means album; to stack
    full-width images, put text (even an HTML comment) between them.
    Sveltia only ever sees plain `![]()` lines, so dropping three files
    into a draft creates an album with zero extra syntax. Raw HTML `<img>`
    in markdown is never used — it bypasses the asset pipeline entirely.
- **No MDX, no `Images.astro`.** Considered and rejected: MDX-by-default
  breaks Sveltia (its Lexical editor outputs plain markdown and would
  mangle JSX on round-trip); Sveltia custom editor components would put
  nonstandard shortcodes in the content; `:::gallery` directives make you
  hand-type fences around drag-drops. The grouping plugin gets albums
  from structure the CMS already produces. Revisit a component only if a
  layout need ever exceeds what count-based grouping expresses.
- **Lightbox**: ~30 lines of vanilla JS + native `<dialog>`. Every
  `.prose img` opens full-size on tap (mobile full-view), scroll-snap to
  swipe between a post's images. Progressive: no JS → image is still
  visible in place. No library (PhotoSwipe rejected; wavesurfer stays the
  site's only JS dependency of note).
- **Derivative quality knob (documented, deliberately not turned).**
  Reader-facing derivatives encode at sharp's WebP default, q80 — Astro has
  no global `image.quality` config. But `rehype-images` spreads every img
  node property into the transform options, so `rehype-gallery` (which every
  post image passes through) is a de-facto global knob: one line adding
  `quality: 85` beside its `sizes` assignment raises site-wide derivative
  quality (+~25–30% reader bytes); mirror it in `feed-image-map.ts`'s
  `getImage()` for feeds. Left at q80 because derivatives from the clean q95
  source carry no compounded artifacts — turn it only if live images ever
  look soft.

## RSS feeds

`src/utils/feeds.ts` renders markdown itself, so relative image paths would
404 in readers. Fix inside the build: collect each entry's colocated images
via `import.meta.glob('/posts/**/images/*')`, call `getImage()`, and rewrite
feed-HTML `src` to `SITE_URL + result.src` at a single fixed width taken
from the `image.breakpoints` set (1280) so the transform is shared with the
on-page derivatives rather than an extra sharp run. `srcset` isn't reliable
in feed readers.

Related listing fix: `extractFirstParagraph()` in
`src/pages/digital-garden/index.astro` takes the first non-blank raw-body
line as a fallback description and would show literal `![...](…)` syntax
for an image-leading post — skip lines matching `/^!\[/`.

## Guard rails

- **`pnpm img <file>` script** (`scripts/optimize-image.ts`): sharp — already
  a dependency, no cwebp binary needed — `.rotate()` (bake orientation),
  resize to ≤3000px, WebP `{ quality: 95, effort: 6, smartSubsample: true }`
  (equivalent to `cwebp -q 85 -m 6 -sharp_yuv`). Strips all metadata (sharp's
  default). Prints the markdown snippet to paste.
- **lint-staged guard**: staged raster images under `posts/**/images/` must
  be ≤3000px and metadata-free, else the commit fails with a message
  pointing at `pnpm img`. Blocks, never auto-converts — silent
  `.png → .webp` renames would break already-written markdown references.
- **CI checks** (in the existing `content-validation.yml`, which already
  triggers on `posts/**`; no new secrets):
  - **EXIF/GPS backstop**: scan pushed images, fail on GPS metadata. This is
    the only layer that sees Sveltia commits — the CMS writes via the
    GitHub API from the browser, so pre-commit hooks never run for it.
    **Honest scope: this detects, it does not block.** Netlify deploys from
    the push regardless of the Actions result, so a GPS-carrying image is
    live (and in history) by the time the check fails. Notification path:
    GitHub emails workflow failures to the pusher — Sveltia commits are
    authored as Tanvi, so the failure email reaches her. Prevention lives
    upstream (Sveltia's canvas re-encode, `pnpm img`'s metadata strip);
    this is the alarm. Turning it into a real gate would mean routing
    Sveltia through PRs + required checks — rejected as too much friction
    for a personal site.
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
- **LLM alt-text generation** — tracked as issue #118; images ship with
  hand-written alt text (or empty) until then.
- **`og:image` share cards** — `Layout.astro` emits no `og:image` today;
  adding one (e.g. a post's first image) is a separate small feature, not
  part of this design.

## Sequencing

One implementation, starting with the in-range Astro update to ≥5.10 (first
task of the plan — no longer a separate blocking worktree).

Implementation plan: `docs/plans/2026-09-07-colocated-images-plan.md`.
