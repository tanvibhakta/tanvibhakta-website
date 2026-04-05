# Audio Player Component Design

**Date:** 2026-04-05
**Status:** Approved (revised after review), ready for implementation

## Goal

Replace the raw HTML `<audio>` tag currently used in blog posts with a styled
wavesurfer.js-based audio player. Make audio attachable to blog and poetry
posts through the Sveltia CMS admin UI.

## Scope

- Blog and poetry collections support an optional audio attachment
- Audio files are managed through Sveltia's media library, scoped to `/media/audio/`
- Custom waveform player with site-matching styling
- Graceful fallback to native `<audio>` controls when JS is disabled or wavesurfer fails

## Current state notes

- `posts/blog/define-partner.md` has an inline `<audio>` tag pointing at
  `/public/audio/define-partner.oga` — this path is **already broken** (Astro
  serves `public/` at the root, so `/public/...` 404s). The MIME type is also
  wrong (`audio/mpeg` on a `.oga` file). This replacement doubles as a bug fix.
- `public/media/` exists but is empty. The migration creates
  `public/media/audio/`.

## Changes

### 1. File reorganization

- Create `public/media/audio/` directory
- Move `public/audio/define-partner.oga` → `public/media/audio/define-partner.oga`
- Remove the now-empty `public/audio/` directory

All media lives under `public/media/` going forward.

### 2. Content schema (`src/content.config.ts`)

The current schema uses a single shared `collectionSchema` across all four
collections. Do **not** add audio fields to the base schema — that would
leak them into weeknotes and digitalGarden. Instead, use `.extend()` on
the blog and poetry collection schemas specifically:

```ts
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/blog/" }),
  schema: collectionSchema.extend({
    audio: z.string().optional(),
    audioTitle: z.string().optional(),
  }),
});

const poetry = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/poetry/" }),
  schema: collectionSchema.extend({
    audio: z.string().optional(),
    audioTitle: z.string().optional(),
  }),
});
```

### 3. Sveltia CMS config (`public/admin/config.yml`)

Add to blog and poetry collections:

```yaml
- label: Audio
  name: audio
  widget: file
  required: false
  media_folder: /public/media/audio
  public_folder: /media/audio
- { label: Audio Title, name: audioTitle, widget: string, required: false }
```

The `file` widget opens Sveltia's media library. Per-field `media_folder`
and `public_folder` scope audio uploads to `/public/media/audio/` without
affecting image uploads elsewhere.

**Note:** The field does not hard-restrict to audio-only MIME types. Sveltia
does not have a universally-documented per-field `allowed_file_types` key
equivalent to Netlify CMS. Editors will pick the correct file by the label
("Audio"). If a wrong file is attached, the frontmatter path is still a
plain string and the player will fail to render audio — not a build failure,
just a broken player at runtime.

### 4. Dependency

Install `wavesurfer.js@latest`.

### 5. Component: `src/components/AudioPlayer.astro`

Props:

- `src: string` (required) — audio file path
- `title: string` (required) — label shown above the player

Renders:

- A labelled container `<figure>` with `data-audio-src` attribute and
  a `<figcaption>` for the title
- A native `<audio controls preload="metadata" src={src}>` element as
  fallback/accessibility layer (no `type` attribute — let the browser
  sniff from the file extension and server headers)
- An Astro `<script>` that dynamically imports wavesurfer, finds all
  `[data-audio-src]` elements, initializes a wavesurfer instance for each,
  and **only hides the native `<audio>` element after wavesurfer fires `ready`**.
  On any wavesurfer error, the native element stays visible. This guarantees
  the user is never left without a working player.

Wavesurfer config:

```js
{
  waveColor: "oklch(70.8% 0 0)",         // neutral-400
  progressColor: "oklch(20.5% 0 0)",     // neutral-900
  cursorColor: "oklch(50.5% 0.213 27.518)", // red-800
  barWidth: 1,
  barGap: 2,
  fillParent: true,
  dragToSeek: true,
  mediaControls: true,
  height: 60,
}
```

### 6. Template integration

The audio player needs to be added to **two** slug templates (there is no
shared `[collection]/[...slug].astro` route for post rendering):

- `src/pages/blog/[...slug].astro` — default title: `"Listen to this blog"`
- `src/pages/poetry/[...slug].astro` — default title: `"Listen to this poem"`

`post.data.audioTitle` overrides the default when set.

**Placement:** Render `<AudioPlayer>` **inside** `<ProseLayout>`, after the
`<Content />` slot content, so it sits at the bottom of the prose container
and inherits the page width. The component's own styles should reset
typography plugin effects (margins, bullet styles) inside the figure so
wavesurfer renders cleanly — the `.not-prose` Tailwind Typography utility
handles this in one line.

Example shape for `src/pages/blog/[...slug].astro`:

```astro
<ProseLayout frontmatter={blogPost.data}>
  <Content />
  {blogPost.data.audio && (
    <AudioPlayer
      src={blogPost.data.audio}
      title={blogPost.data.audioTitle ?? "Listen to this blog"}
    />
  )}
</ProseLayout>
```

### 7. Content update

Update `posts/blog/define-partner.md`:

- Remove the inline `<audio>` tag and the "Listen to a first draft..." paragraph
- Add frontmatter: `audio: /media/audio/define-partner.oga`
- Optionally: `audioTitle: "Listen to a first draft of this blog"` to keep
  the original framing

## Out of scope

- Inline audio embeds within post body (only one audio per post, at the bottom)
- Audio support for weeknotes or digital garden collections
- Playlist or multi-track support
- Hard MIME-type restriction in the CMS (soft restriction via field label only)
- Download link UI (native fallback element includes a download option)
