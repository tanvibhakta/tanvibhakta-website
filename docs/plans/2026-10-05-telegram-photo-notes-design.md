# Telegram photo notes

**Date:** 2026-10-05
**Status:** Design agreed; not yet planned or implemented.
**Revisit:** album buffering, around 2026-11-05 (see "Albums").

## Goal

Photos sent to @NotesTanviBhaktaInBot publish as notes, the same way text
messages already do. This picks up the "Telegram photo ingestion" item that
`2026-09-07-colocated-images-design.md` left out of scope.

Today the webhook (`netlify/functions/telegram-webhook.mts`) skips every
photo: a photo message carries `photo` + `caption`, not `text`, so
`buildNote` returns null and the bot replies "Skipped".

## Evidence: how photos actually get sent

The Telegram Desktop chat export (2026-10-05) holds three photos, all from
notes taken during a talk on 2026-09-27:

- a photo with a caption, sent as its own post;
- two captionless photos, each sent ~5s after a text note.

All three are meant to be **independent notes**. A photo never attaches to
the text sent before or after it, and replies are threading, not
attachment. The webhook therefore never infers grouping across messages;
the only grouping is Telegram's own album (`media_group_id`).

## What becomes a note

| Message                         | Note                                                  |
| ------------------------------- | ----------------------------------------------------- |
| Text                            | Unchanged                                             |
| Photo with caption              | Image, then the caption as text                       |
| Photo without caption           | Image only                                            |
| Image sent as a file            | Same as a photo (`document` with `image/*` mime type) |
| Album                           | One note: all images, then the album's caption        |
| Anything else (PDF, voice, ...) | Skipped, with a reply saying so                       |

- **Markdown shape:** one `![](images/<file>.webp)` line per image, on
  adjacent lines, then a blank line, then the caption. This is exactly what
  `rehype-gallery` already groups, so layout (1/2/3 columns), `sizes`, and
  the lightbox come for free. No new rendering code.
- **Caption formatting:** `caption_entities` has the same shape as
  `entities`; `entitiesToMarkdown` converts it unchanged.
- **Alt text:** empty. A caption isn't an image description; generated alt
  text is issue #118.
- **Timestamp:** the message's send time, exactly as for text notes,
  except for forwards of your own messages (below).

## Forwarded messages keep their original date

On a forward, `message.date` is the time of the forward. Telegram keeps the
original send time in `forward_origin.date`. `buildNote` uses it **only when
the original sender is the allowlisted user** (`forward_origin.type ===
"user"` and `sender_user.id` matches `TELEGRAM_ALLOWED_USER_ID`). A forward
from anyone else's chat or channel keeps the forward time: the original
date there is when they posted, not when you shared it.

This applies to text and photo notes alike, and it is the backfill path:
forwarding an old message to the bot publishes it with its real timestamp.

## Rendering change: per-note lightbox

`Lightbox.astro` collects every `.prose img` on the page into one strip. On
the `/notes` feed that lets a reader swipe from one note's photos into
another's. Change: collect images from the clicked image's closest
`<article>`, falling back to the whole page when there is none. Blog posts
and single-note pages behave exactly as before.

This is the only change outside the webhook.

## Webhook pipeline

For each photo update:

1. **Pick the image:** the largest `photo` size, or a `document` whose
   `mime_type` starts with `image/`.
2. **Download:** `getFile`, then fetch from Telegram. The Bot API caps
   downloads at 20MB; larger files are skipped with a reply.
3. **Convert:** extract the `sharp` chain from `scripts/optimize-image.ts`
   into a buffer→buffer function used by both `pnpm img` and the webhook.
   One profile, one place: ≤3000px, WebP q95, orientation baked in,
   metadata stripped. The webhook's output passes the pre-commit metadata
   guard by construction. `sharp` also decoding the input is the check
   against mislabeled files.
4. **Commit:** switch from the Contents API (one file per commit) to the
   Git Data API, so the `.md` and its images land in **one commit**. A
   failed upload can never leave a note pointing at a missing image. The
   `.md` goes inline in the tree; each image needs a blob. About 4 write
   requests per photo note.

**Image naming:** the note's basename plus an index, e.g.
`posts/notes/images/2026-10-05-1432-1.webp`.

**Deploy risk, verify first:** `sharp` is a native module. Netlify builds on
Linux and installs the Linux binary, but the function bundler must leave it
external (`[functions] external_node_modules = ["sharp"]` in
`netlify.toml`). The plan's first task proves this on a deploy preview.

## Albums

Telegram sends each album photo as its own update, sharing
`media_group_id` and `date`; only one carries the caption. By default,
updates are delivered in parallel (up to 40 connections).

- **Serial delivery:** re-register the webhook with `max_connections=1`.
  Telegram waits for each response before sending the next update, so
  album items, and bursts generally, are processed one at a time with no
  locking in our code.
- **Deterministic file:** album notes are named
  `<YYYY-MM-DD-HHmm>-<media_group_id>.md`. Every item computes the same
  name. The first creates it; later items fetch it and append their image
  line after the last one (and the caption below the images, if they carry
  it). Filenames aren't public; URLs stay `/notes/N`.
- **Replies:** the first item replies "Published …/notes/N"; later items
  are silent unless they fail.

**Accepted trade-off:** an N-photo album is N commits. Netlify builds the
first and last queued build for a branch and skips the ones in between, so
there are at most two builds, but for one build cycle (~1–2 min) the note
is live with only its first photo. On the site this heals itself. A feed
reader that polls in that window may keep the partial item, since readers
key items by link and not all of them refetch changed content.

**Deferred alternative, revisit ~2026-11-05:** buffer album items (e.g. in
Netlify Blobs) and commit once after a quiet period. The Bot API never
reports album size, so "complete" can only mean "no new item for a few
seconds": that needs a delayed job, intermediate storage, and handling for
an album that never assembles. It can be added later without changing the
note format, naming, or commit logic.

## Bursts, retries, and errors

Notes are sent in bursts, so the design leans on serial delivery and
idempotency:

- **Idempotent retries:** before committing, check whether the target file
  already exists for this message (the name is derived from the message).
  A Telegram redelivery then converges instead of duplicating. Text notes
  keep their existing `-<message_id>` collision suffix.
- **Failure reply, 200 ack:** unchanged from today. Any failure (download,
  `sharp`, GitHub, including a secondary rate-limit 403) acks with 200 and
  replies "❌ Not published — …; resend to retry". A 500 would make
  Telegram redeliver for 24h.
- **Rate limits:** GitHub's secondary limit is ~80 write requests/min. At
  ~4 per photo note, bursts stay well under it.
- **Concurrent pushes:** commits build on the current `main` head with a
  non-forced ref update. If `main` moved (a Sveltia edit), re-read and retry
  once.

## Testing

- **Unit (vitest):** message → note mapping for every row of the table
  (caption, no caption, document image, non-image document, album first
  item, album later item); markdown shape matches what `rehype-gallery`
  groups; album append inserts after the last image line and places a late
  caption correctly; the shared image function strips metadata (extend the
  existing `optimize-image` test).
- **Lightbox:** with images in two `<article>`s, opening one only strips
  its own article's images; with no article, all page images.
- **Forward dating:** own-message forward uses `forward_origin.date`; a
  forward from another user or a channel uses `message.date`.
- **End-to-end on the PR's deploy preview** (no production testing):
  1. The webhook commits to `process.env.NOTES_BRANCH ?? "main"`. On
     Netlify, `NOTES_BRANCH=telegram-photo-notes` is scoped to the
     deploy-preview context only.
  2. Save `getWebhookInfo`, then point the webhook at the PR's stable
     alias, `deploy-preview-<N>--tanvibhakta.netlify.app/api/telegram-webhook`
     (each test commit triggers a new preview build; the alias always
     serves the newest).
  3. Send: a captioned photo, a captionless photo, a 3-photo album, an
     image as a file, a non-image file, and a forward of an old message.
     Test notes land on the PR branch, so the preview shows them; check
     the gallery, the per-note lightbox on `/notes`, and
     `/notes/feed.xml`.
  4. Re-register the production webhook (same URL, secret,
     `allowed_updates`, plus `max_connections=1`) and confirm with
     `getWebhookInfo`. No real notes during the window; any that slip in
     are cherry-picked to `main`.
  5. Drop the test commits from the branch before merging.

## Out of scope

- **Backfilling** the three photos from 2026-09-27. Once this ships, it's
  a matter of forwarding those messages to the bot (see "Forwarded
  messages"); no export script. Backdated notes change
  the `/notes/N` numbering of later notes, and feed readers use those links
  as item IDs, which is worth checking when the backfill is planned.
- Album buffering (above).
- Video, voice, and other non-image media.
- Editing a published note from Telegram (`edited_message`).
