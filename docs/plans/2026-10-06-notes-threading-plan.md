# Notes threading: implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task by task.

**Goal:** Notes can reply to notes. The `/notes` feed shows threads with a
margin line and "N of M", a conversation overlay opens in place, and
Telegram replies become `inReplyTo` replies.

**Architecture:** A pure thread module (`src/utils/note-threads.ts`, no
`astro:content`) turns `{id, publishedOn, inReplyTo}` records into thread
positions. The feed page renders the line and footer from those positions.
The overlay is a `<dialog>` component whose script works from a JSON map of
parent pointers plus a `<template>` of pre-rendered thread notes, ported
from the `thread-ui-lab` prototype. The webhook resolves a reply's parent
filename with a pure candidate list plus GitHub existence checks.

**Tech stack:** Astro 5 content collections, Tailwind 4, vitest, Netlify
Functions.

**Design:** `2026-10-05-notes-threading-design.md`. Out of scope: the tweet
import (Tanvi runs batches herself) and the thread note's own page (#133).

---

### Task 1: `inReplyTo` in the notes schema

**Files:** modify `src/content.config.ts` (notes schema).

- Add `inReplyTo: z.string().optional()`, commented: the parent's file id; a
  plain string, not `reference()`, because a missing parent must not fail
  the build (it renders a placeholder).
- Verify: `pnpm exec astro sync` passes.

### Task 2: Thread module (TDD)

**Files:** create `src/utils/note-threads.ts` and `tests/note-threads.test.ts`.

API:

```ts
interface ThreadInput {
  id: string;
  publishedOn: Date;
  inReplyTo?: string;
}
interface ThreadPosition {
  threadId: string; // root note's id
  index: number; // 0-based, by time (ties by id)
  size: number;
  older?: string; // previous thread member in time
  newer?: string; // next thread member in time
  missingParent: boolean; // inReplyTo names a note that doesn't exist
}
function threadPositions(notes: ThreadInput[]): Map<string, ThreadPosition>;
// Only notes in a thread of 2+ appear, plus any note with a missing parent.
function feedLinks(
  newestFirst: string[],
  positions,
): Map<string, { up: Link; down: Link }>;
// Link = "solid" | "stub" | null, the margin line around each feed item.
```

Tests:

1. A standalone note has no position.
2. A root and two replies → one thread of size 3, indexed by time.
3. A branch (two replies to one parent) is one thread; indices follow time,
   not reply order.
4. Same-millisecond ties break by id.
5. A missing parent: the reply roots its own thread and is flagged
   `missingParent`. A missing note is never counted in `size`.
6. A cycle or self-reference doesn't loop forever: it's treated as a
   missing parent.
7. `feedLinks`: adjacent thread neighbours get "solid"; a non-adjacent
   neighbour gets "stub"; ends get null.

Run `pnpm vitest run tests/note-threads.test.ts`, commit.

### Task 3: Threaded notes for pages

**Files:** modify `src/utils/notes.ts`.

- Add `getThreadedNotes()`: the slugged notes, oldest first, each with
  `position?: ThreadPosition`.

### Task 4: Note footer slot and permalink colour

**Files:** modify `src/components/Note.astro`.

- Add `<slot name="meta" />` at the end of the footer.
- Permalink class `text-inherit!`, so the global `a` colour doesn't win.

### Task 5: Margin line component

**Files:** create `src/components/NoteSpine.astro`, ported from the lab's
`_Spine.astro`.

- Props `up` and `down`, each `"solid" | "stub" | null`.
- stone-500, 1px, `aria-hidden`.

### Task 6: Feed renders threads

**Files:** modify `src/pages/notes/index.astro`.

- Each note sits in a wrapper (`relative flow-root py-4
[&>article]:my-0 [&>article>p:first-child]:mt-0`) with a `data-note` id.
  Thread notes also get `data-thread` and a `NoteSpine`.
- Thread notes get the footer button `{index + 1} of {size}`
  (`data-open`, `aria-haspopup="dialog"`).
- Check that standalone notes look unchanged (spacing: the wrapper's py-4
  replaces the article's my-8 collapse).

### Task 7: Conversation overlay

**Files:** create `src/components/NoteThreadOverlay.astro`; modify
`src/pages/notes/index.astro`.

- Props: the thread notes with their slug, position and rendered `Content`.
  It renders:
  - a `<template>` with each thread note once (`data-member`,
    `data-position`, `data-line`, a hidden `data-branch` marker, and the
    "N of M" meta);
  - the JSON parent map, with an entry for a missing parent so the
    placeholder can render;
  - the `<dialog>`.
- Script: a straight port of the lab's `spine.astro` script:
  - ancestors, then the note, then depth-first descendants (siblings oldest
    first);
  - lines join only parent and child; the branch marker is a button;
  - anchored scroll with top padding and a clamp at the edges;
  - `placeDialog` alignment;
  - history depth and close unwinding;
  - scroll lock and `overscroll-contain`;
  - focus on the scroll area;
  - `overflow-anchor: none` and `behavior: "instant"`.
- New: when the root of the shown chain has `missingParent`, put a
  placeholder row above it: "↳ replying to a note that no longer exists",
  with no link and no "N of M".
- Styling exactly as settled in the design: no header, an icon ✕, a
  stone-100 box with a hairline border and soft shadow, a stone-100/60
  backdrop with a 2px blur, edge fades, and 60vh bottom padding.

### Task 8: RSS reply line

**Files:** modify `src/utils/feeds.ts`; extend `tests/feeds.test.ts` if its
mocks allow, otherwise extract a pure `replyPrefix(parentSlug)` and test
that.

- A notes item whose parent exists starts with
  `<p>↳ replying to <a href="{SITE}/{parentSlug}/">{parentSlug}</a></p>`.
- If the parent is missing: no line.

### Task 9: Telegram parent candidates (TDD)

**Files:** create `src/utils/note-reply.ts` and `tests/note-reply.test.ts`;
modify `src/utils/telegram-note.ts` (types) and
`src/utils/note-slug.ts` (inverse lookup).

- Add to `TelegramMessage`: `reply_to_message?: TelegramMessage`, and
  `from.is_bot?`.
- Add to `note-slug.ts`: `filenameForSlug(filenames, slug)`, the inverse of
  `noteSlugFromListing`. Test that it round-trips.
- `parentCandidates(reply, timeZone, ownerId)` returns `posts/notes/*.md`
  paths in order:
  - album item: `<stem>-<media_group_id>.md`;
  - otherwise `<stem>-<message_id>.md`, then `<stem>.md`;
  - stems built with `noteDate` (forwards use `forward_origin.date`).
- `slugInBotReply(reply)` returns the slug when `reply.from.is_bot` and the
  text holds a site link (`/(\d{4}[a-z]{3}\d{2}-\d{2,})`).
- Tests: text note, same-minute suffix, album, forward, bot confirmation,
  and a non-reply (empty list).

### Task 10: Webhook writes `inReplyTo`

**Files:** modify `src/utils/telegram-note.ts` (`noteContent` and
`buildNote` take an optional `inReplyTo`), `src/utils/photo-note.ts` (a
created note carries it; appends to an album don't), and
`netlify/functions/telegram-webhook.mts`.

- `resolveParent(message)`: bot-link slug → `filenameForSlug` over
  `listDir`; otherwise the first candidate that `readFile` finds. Returns
  the file id (filename without `.md`) or null.
- If it's a reply and the parent isn't found, publish anyway, and the
  confirmation says: "Published … — couldn't find the note you replied to,
  so it's standalone."
- Tests: extend `tests/telegram-note.test.ts` and `tests/photo-note.test.ts`
  for the frontmatter line.

### Task 11: Verify

- Run `pnpm check` and `pnpm build`.
- Browser:
  - temporary fixture notes (a thread, a branch, a missing parent) in a
    scratch commit, dropped before the PR;
  - check alignment, overlay anchoring, Back and close, scroll lock, and
    390px width;
  - screenshot the results for Tanvi.
- Real-phone check on the deploy preview.

### Task 12: Thread permalink iterations (#133)

- After threading is in, build two or three design iterations of a thread
  note's own page on a scratch route, then open them in Tanvi's browser.

### Task 13: Delete the lab

- Remove the `thread-ui-lab` worktree and branch. The design doc already
  lives on this branch.
