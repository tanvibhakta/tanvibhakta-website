# Telegram photo notes: implementation plan

Design: `2026-10-05-telegram-photo-notes-design.md`. Branch
`telegram-photo-notes`, worktree `.worktrees/telegram-photo-notes`.

Each task is TDD where there's logic to test: write the failing test, watch
it fail, implement, watch it pass. `pnpm check` must pass before every
commit.

## Task 1: Shared image profile (buffer in, buffer out)

- New `src/utils/image-profile.ts`: `toSiteWebp(input: Buffer | string):
Promise<Buffer>`, holding the `sharp` chain now in
  `scripts/optimize-image.ts` (rotate → fit inside 3000 → WebP q95, effort
  6, smartSubsample; metadata stripped by default).
- `scripts/optimize-image.ts` calls it and writes the buffer. Its behaviour
  and tests are unchanged.
- Test (`tests/optimize-image.test.ts`): `toSiteWebp` on an EXIF-carrying
  4000px JPEG buffer returns a 3000px WebP with no EXIF.

## Task 2: Message model (`src/utils/telegram-note.ts`)

Extend `TelegramMessage` with `caption`, `caption_entities`, `photo`
(PhotoSize[]), `document` (file_id, mime_type, file_size),
`media_group_id`, and `forward_origin` (type, date, sender_user.id).

Pure functions, all unit-tested in `tests/telegram-note.test.ts`:

- `noteDate(message, ownerId)`: `forward_origin.date` when the origin is a
  user whose id is `ownerId`, else `message.date`.
- `messageImage(message)`: `{ fileId, fileSize }` for the largest `photo`
  size or an `image/*` document; `null` otherwise.
- `isUnsupportedMedia(message)`: true for a message with media but no
  usable image and no text (non-image document, video, voice, sticker...).
- `buildNote(message, timeZone, ownerId?)`: unchanged output for text, but
  dated via `noteDate`.
- `noteStem(epoch, timeZone)`: the `YYYY-MM-DD-HHmm` stem `buildNote`
  already derives, exported for the photo path.
- `noteNumberFromListing(filenames, filename)`: the note's 1-based position
  among `.md` files sorted by stem. It replaces "count of files", which is
  wrong once a backdated forward lands mid-list.

## Task 3: Photo note planning (`src/utils/photo-note.ts`)

`planPhotoNote(message, timeZone, ownerId, readNote)`, where
`readNote(path) → Promise<string | null>` reads the branch. Returns one of:

- `{ kind: "create", notePath, imagePath, content }`
- `{ kind: "append", notePath, imagePath, content }` (album item)
- `{ kind: "duplicate", notePath }` (Telegram redelivery: the note already
  references this message's image)

Rules:

- Image path: `posts/notes/images/<stem>-<message_id>.webp`. Keying on
  `message_id` (not an index) makes redelivery detection a string check.
- Single photo: note `<stem>.md`. If taken by another note, use
  `<stem>-<message_id>.md` (same rule as text notes).
- Album: note `<stem>-<media_group_id>.md`. If absent, create. If present,
  insert the image line after the last image line; if this item carries the
  caption, add it below the images.
- Content: image lines on adjacent lines, a blank line, then the
  caption as markdown (via `entitiesToMarkdown` with `caption_entities`).
  Caption-less notes are image lines only.

Tests: create single, create with caption + entities, collision fallback,
duplicate detection (single and album), album create, album append,
late caption, and that the output groups into one `rehype-gallery` figure
(run it through the existing remark/rehype test pipeline).

## Task 4: GitHub client (`src/utils/github-commit.ts`)

Fetch is injected, so tests use a recording fake.

- `readRepoFile(path, branch)`: Contents API GET; `null` on 404; decoded
  UTF-8.
- `commitFiles(files, message, branch)`: Git Data API. Get the ref, then
  the head commit's tree, then a blob per binary file, then a tree on
  `base_tree` (text inline), then a commit, then `PATCH` the ref with
  `force: false`. On a 422 from the ref update, rebuild once from the new
  head. Throws on any other non-2xx.
- `listNoteFiles(branch)`: Contents API listing of `posts/notes`.

Tests: the call sequence and payloads; the retry on 422; a thrown error on 500.

## Task 5: Telegram file download (`src/utils/telegram-api.ts`)

`downloadTelegramFile(token, fileId, fetch)`: `getFile`, then fetch
`https://api.telegram.org/file/bot<token>/<file_path>`. Throws "image too
large" if `file_size` exceeds 20MB. Tested with a fake fetch.

## Task 6: Webhook wiring (`netlify/functions/telegram-webhook.mts`)

- Branch: `process.env.NOTES_BRANCH || "main"` for every read and write.
- Text notes: existing Contents API path, now dated via `noteDate` and
  committed to the branch.
- Photo notes: `messageImage`, then `downloadTelegramFile`, then
  `toSiteWebp`, then `planPhotoNote`, then `commitFiles` (note and image
  in one commit). Duplicate: ack silently. Album append: no reply.
  Create: "Published <link>".
- Unsupported media: "Skipped: only text and images become notes."
- Note link: `noteNumberFromListing(listing, filename)`.
- Error handling unchanged: 200 + "❌ Not published" reply.
- `netlify.toml`: `[functions] external_node_modules = ["sharp"]`.

## Task 7: Per-note lightbox

- Extract the image-collection rule into `src/utils/lightbox-scope.ts`:
  `stripImages(clicked, root)` returns the `.prose img`s inside
  `clicked.closest("article")`, or all of them in `root` when there's no
  article.
- `Lightbox.astro` builds the strip from `stripImages(img, document)` at
  open time, and opens at the clicked image's index within it.
- Test with `happy-dom` (dev dependency, per-file
  `@vitest-environment happy-dom`): two articles, then a page with no
  article.

## Task 8: Docs

Update the design doc's status, the image section of `CLAUDE.md` (Telegram
is now an authoring path), and the comment block at the top of the
webhook.

## Task 9: Ship to a deploy preview

1. Push the branch and open the PR.
2. Set `NOTES_BRANCH=telegram-photo-notes` for the deploy-preview context
   only.
3. Smoke-test the preview: `GET` returns 405, and a `POST` with a bad
   secret returns 403. The 403 proves the function module, `sharp`
   included, loaded on Linux.
4. Stop. The webhook swap and the end-to-end test need Tanvi sending
   messages (design doc, "Testing").
