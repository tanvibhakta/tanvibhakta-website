# Notes threading

**Date:** 2026-10-05
**Status:** Design agreed. The UI was settled by prototyping on branch
`thread-ui-lab` (`src/pages/thread-lab/`, served at `/thread-lab/spine`).
That page is a reference, not code to merge, and is deleted once the
implementation lands. Open questions answered 2026-10-06 (see the end).
The feed overlay was replaced by each note's own page on 2026-10-10 (issue
#133); see "A note's page".

## Goal

Notes can reply to other notes, and the site shows those threads. There are
two sources of replies:

- **Telegram:** replying to a message in the bot chat replies to that note.
- **Twitter archive import:** self-threads from the 2018–2022 archive keep
  their threading.

Build order: thread data and UI, then Telegram reply-to. The tweet import is
not part of this implementation: Tanvi runs it herself, in batches, when she
wants to. The "Twitter import" section records the conventions those batches
should follow.

## Data model

Each reply stores a pointer to its parent:

```yaml
---
publishedOn: 2026-10-05T15:51:36
inReplyTo: 2026-10-05-1549 # parent note's file id
---
```

- `inReplyTo` is optional: a plain string (the parent's file id), not
  Astro's `reference()`. A missing parent must **not** fail the build;
  see "Missing parent".
- Threads are worked out at build time by following pointers up to the
  root. A note with replies is a thread root; a note with neither a parent
  nor replies is a standalone note.
- Branching works without special handling: two notes can point at the same
  parent.
- The pointer is the file id, not the URL slug. Slugs can shift when a note
  is back-dated onto a day; file ids never change.

Rejected:

- **Each note stores its thread's root.** Loses branching, and the webhook
  would have to look up the root anyway.
- **Each parent lists its children.** Every reply would mean editing an old
  file, which is two commits per Telegram reply.

### Missing parent

If `inReplyTo` names a note that doesn't exist (deleted, or never
published), the reply still builds. Following X's convention rather than
Mastodon's silent cut:

- **The note's page:** a placeholder sits where the parent would be, at the
  top of the ancestors: "↳ replying to a note that no longer exists". It has no
  link and no "N of M".
- **Thread maths:** the chain stops at the gap. The reply becomes the root of
  its own thread for the line and for "N of M"; a missing note is never
  counted.
- **Feed:** nothing extra. The feed shows only notes that exist.

## Numbering: "N of M"

Each thread note shows its position as plain text, e.g. "3 of 11".

- **Counted by time.** In the feed, a thread always counts down cleanly. On
  a note's page, which follows the reply chain, the numbers jump only at a
  branch, and the branch marker (below) explains the jump. Numbering by
  reply chain was tried: the conversation read 1…M, but the feed showed
  unexplained jumps such as 9, 11, 8, … 4, 10, 3.
- **Ties need milliseconds.** Tweets in a self-thread are often posted in
  the same second, so `created_at` alone puts them in the wrong order. The
  import takes `publishedOn` from the tweet ID, to the millisecond (see
  "Twitter import").
- **No word "thread".** Just "3 of 11".

## Feed (`/notes`)

**Strictly newest first. A note's position never depends on its thread.**
Thread notes sit at their own dates, mixed in with everything else.

Rejected:

- **Thread as one block at the root's date.** A two-month thread (Nov 2018 –
  Jan 2019 in the archive) sat below every note from those two months.
  Reading down, time went backwards, then forwards inside the thread, then
  backwards again.
- **Moving a thread up when a reply arrives.** Twitter grouped conversations
  in its feed this way in 2013; it was unpopular.
- **Opening the thread inline in the feed.** It shifted the reading position
  and repeated notes.

### The spine

A thread note gets a vertical line in its left margin. The note's text stays
aligned with every other note; nothing is indented.

- **Solid** between thread notes that are next to each other in the feed,
  bridging the gap so a run reads as one block.
- **Stops** at the thread's first and latest notes.
- **Short dashed tail (1rem)** where the thread continues, but further away
  in the feed.
- **No dots, no legend.** Role marks (ring for first, filled dot for latest,
  small dot between) needed a legend, so they were dropped, and then the
  dot too, since it carried no information.
- **stone-300, 1.5px, square ends.** A light line, chosen by eye
  (2026-10-10). stone-500 (4.39:1 against the stone-100 page) would clear
  WCAG 1.4.11's 3:1 for graphics, but read too heavy; stone-300 is 1.37:1. The line isn't
  the only cue: "N of M" says the same thing in text, which is also what
  screen readers get.
- `aria-hidden`: the "N of M" text carries the same information for screen
  readers.

### Note footer

`time · 3 of 11 · permalink` (permalink always last, 2026-10-10)

- "3 of 11" is plain text.
- Clicking anywhere on any note, threaded or not, opens its own page
  (`src/scripts/open-note-on-click.ts`). Links, photos (the lightbox) and
  selecting text keep their own behaviour; the permalink link stays the
  keyboard and no-JavaScript route.
- The permalink is no longer in the link colour (`text-inherit!` in
  `Note.astro`). Tags in the same footer still use the link colour; this is
  undecided.

## A note's page

Every note's page (`/2026oct05-02`, `src/pages/[note].astro`) shows its
conversation. Settled 2026-10-10 by prototyping on branch `permalink-lab`
(issue #133); the experiments stay on that branch, unmerged.

### Contents and order

The order is Mastodon's (checked in its source,
`app/javascript/mastodon/features/status/`), worked out by `conversation()`
in `src/utils/note-threads.ts`:

1. **Ancestors:** the direct reply chain up to the root, root first. Never
   sibling branches.
2. **The note itself.**
3. **Descendants:** depth-first, so each branch's chain stays together.
   Among siblings, the reply with the longest unbroken chain below it comes
   first; a reply with nothing below it waits until the longer chains end.
   Equal chains read oldest first. (Changed 2026-10-10 from "oldest first":
   in the LHTL thread, a one-off quote tweet led and the main chain was
   pushed down.)

Quote tweets of a thread note are imported as replies to it. The
longest-chain rule keeps a stand-alone quote out of the main chain.

A standalone note is a conversation of one: just the note, with no line.

How lines and branches are drawn:

- A line joins two notes only if one is the other's parent and they are
  adjacent. At a branch the line breaks.
- Where a reply's parent isn't directly above it, the reply shows
  "↳ replying to 2 of 11" above its text, linking to the parent's page.
- Every thread note shows its "N of M".

### The note in focus

- **Larger:** the note's text is 1.25×.
- **Room around it:** 18vh of whitespace above and below, much more than
  between notes, but not a whole empty screen. A screen of its own
  (`alone` on the lab branch) was tried and rejected: too empty.
- **Centred on arrival:** the page opens with the note in the vertical
  centre of the screen, scrolled before first paint. 40vh of room below
  the conversation lets a note late in its thread still reach the centre.
- **The line swells:** beside the note, the thread line thickens (3.5px)
  and darkens (stone-500), fading in and out (`NoteFocusLine.astro`). It
  stays where the line runs, so it needs no margin to move into and holds
  up on phones. Tried and rejected: the line bowing or stepping out into
  the margin, and a darker bracket with ticks.
- **No permalink** in its footer; the page is the permalink.

### Navigation

- Clicking any other note in the conversation opens that note's page, as
  in the feed. Back returns to where you were.
- **Plain page changes, no animation.** A cross-document view transition
  (the note gliding from the feed to its place on the page, 200ms,
  decelerating) was tried and rejected: the plain jump felt better, and
  Firefox doesn't support it anyway.
- Rejected, also from the lab: one note per screen with scroll-snapping
  (`snap`), and stepping through the thread by links one note at a time.

### The overlay (retired 2026-10-10)

Until 2026-10-10, clicking a thread note in the feed opened its
conversation in a `<dialog>` over the feed, kept the clicked note at its
exact screen position, and pushed a history entry per re-focus. The note's
page replaced it: it shows the same conversation, works without
JavaScript, and needs none of the overlay's scroll locking, positioning or
history handling. Its design and code are in git history (PR #134,
`src/components/NoteThreadOverlay.astro`).

## Telegram reply-to

When a message is a reply, the webhook works out the parent note's filename
from `reply_to_message` and writes `inReplyTo`.

| What was replied to                  | Parent filename                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Text note                            | `<stem>-<messageId>.md` if it exists (a same-minute collision), otherwise `<stem>.md`                                 |
| A photo in an album                  | `<stem>-<media_group_id>.md`                                                                                          |
| A forwarded note                     | stem built from `forward_origin.date`                                                                                 |
| The bot's "Published …" confirmation | the slug in the link, mapped back to a filename through the `posts/notes/` listing (inverse of `noteSlugFromListing`) |

`<stem>` is the `YYYY-MM-DD-HHmm` prefix the webhook already builds with
`noteStem` (`src/utils/telegram-note.ts`). Each candidate is checked with a
GitHub contents GET.

- **Parent not found** (skipped, failed, or sent before the bot existed):
  publish the reply as a standalone note, and the bot's reply says no parent
  was found. Nothing is lost.
- **Photo replies** follow the same rules. A reply is always threading,
  never attachment (this was settled in the photo-notes design).

## Twitter import

Out of scope for the threading implementation: Tanvi imports in batches,
when she wants to. These are the conventions an import should follow.

- **Source:** Tanvi's 2022 export,
  `~/Code/tanvi-data/twitter/twitter-2022-11-19-*/data/tweets.js` (account
  @tanvibhakta_, user id 826504033892380674; Jun 2018 – Nov 2022, 8,682
  tweets). The 63k-tweet `tanvi-data/twitter/tweets.js` belongs to
  @abhishekmadan and is out of scope.
- **Scope, to begin with:** original tweets and self-threads.
  - Excluded: retweets and replies to other people.
  - Also excluded: threads whose root is a reply to someone else, since they
    open mid-conversation.
  - That leaves about 1,783 tweets over 529 days; the busiest day has 56, so
    two-digit slugs suffice.
- **Imported tweets are ordinary notes.** No separate URLs. They take
  `/yyyymondd-nn` slugs from the shared per-day count like any other note.
- **Images are included.** The colocated-images pipeline already covers
  notes; images go through `pnpm img` to the standard profile. 500 tweets
  have media.
- **`publishedOn`:** from the tweet ID to the millisecond,
  `(BigInt(id) >> 22n) + 1288834974657n`. It is written as a naive IST wall
  clock, the site's convention (see `src/utils/note-slug.ts`). Checked: all
  258 sample IDs fall within the same second as their `created_at`.
- **Filenames:** `YYYY-MM-DD-HHmm-<tweetId>.md`. Tweet IDs are 19 digits
  and increase with time, so sorting filenames still sorts by time, which
  `noteSlugFromListing` relies on.
- **Frontmatter:** `tweetId`, for re-runs without duplicates and for
  mapping `in_reply_to_status_id` to `inReplyTo`.
- **Text:** expand `t.co` links to `expanded_url`, strip media links, decode
  HTML entities, and convert to markdown.

## RSS

Replies stay ordinary feed items. A reply's item content starts with a
"↳ replying to" line linking to its parent's permalink (omitted when the
parent is missing).

## Mobile

The swelling line was chosen partly because it works on phones, where
there's little margin for the line to move into (2026-10-10). A real-phone
check of the note's page happens on the PR's deploy preview.

## Decided later

- **Ignored for now:** tag colour in the footer, tweets after Nov 2022, and
  how other collections moving to root slugs share the per-day count.

## Prototype reference

Branch `thread-ui-lab`, `src/pages/thread-lab/`. **Delete the whole
`src/pages/thread-lab/` directory as the last step of the implementation**;
the shipped UI replaces it, and nothing else may import from it.

- `_lib.ts`: building threads, time-order positions, feed adjacency, and
  the depth-first reading order.
- `_Spine.astro`: the margin line.
- `spine.astro`: the feed, the overlay `<dialog>`, and its script
  (ancestors and descendants, anchored scroll, history, scroll lock).
- `_fixture.json`: 258 real tweets, everything inside the time spans of
  three threads, with millisecond timestamps from the tweet IDs.
