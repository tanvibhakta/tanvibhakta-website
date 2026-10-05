# Notes threading

**Date:** 2026-10-05
**Status:** Design agreed. The UI was settled by prototyping on branch
`thread-ui-lab` (`src/pages/thread-lab/`, served at `/thread-lab/spine`).
That page is a reference, not code to merge, and is deleted once the
implementation lands. Open questions answered 2026-10-06 (see the end).

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

- **Overlay:** a placeholder sits where the parent would be, at the top of
  the ancestors: "↳ replying to a note that no longer exists". It has no
  link and no "N of M".
- **Thread maths:** the chain stops at the gap. The reply becomes the root of
  its own thread for the line and for "N of M"; a missing note is never
  counted.
- **Feed:** nothing extra. The feed shows only notes that exist.

## Numbering: "N of M"

Each thread note shows its position as plain text, e.g. "3 of 11".

- **Counted by time.** In the feed, a thread always counts down cleanly. In
  the overlay, which follows the reply chain, the numbers jump only at a
  branch, and the branch marker (below) explains the jump. Numbering by
  reply chain was tried: the overlay read 1…M, but the feed showed
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
- **Colour stone-500, 1px.** That is 4.39:1 against the stone-100 page,
  which clears WCAG 1.4.11's 3:1 for graphics needed to understand content.
  stone-300 was 1.37:1 and stone-400 is 2.37:1; a thicker line doesn't
  change the ratio.
- `aria-hidden`: the "N of M" text carries the same information for screen
  readers.

### Note footer

`time · permalink · 3 of 11`

- "3 of 11" is a `<button>` that opens the overlay. Clicking anywhere on a
  thread note (except links) also opens it.
- The permalink is no longer in the link colour (`text-inherit!` in
  `Note.astro`). Tags in the same footer still use the link colour; this is
  undecided.

## The overlay

Clicking a thread note opens its conversation in a native `<dialog>`.

### Contents and order

The order is Mastodon's (checked in its source,
`app/javascript/mastodon/features/status/`):

1. **Ancestors:** the direct reply chain up to the root, root first. Never
   sibling branches.
2. **The note you clicked.**
3. **Descendants:** depth-first, siblings oldest first, so each branch's
   chain stays together.

How lines and branches are drawn:

- A line joins two notes only if one is the other's parent and they are
  adjacent. At a branch the line breaks.
- Where a reply's parent isn't directly above it, the reply shows
  "↳ replying to 2 of 11" above its text. "2 of 11" is a button that
  re-focuses the overlay on that parent.
- Every note in the overlay shows its "N of M".

### Navigation

- Clicking any other note in the overlay re-focuses it: that note's own
  ancestors above and replies below.
- Each focus is a history entry (`pushState`), so Back steps through the
  notes visited. Closing (✕, Esc, or clicking outside the box) unwinds all
  of them at once with `history.go(-depth)`.

### The clicked note doesn't move

A different note appearing where you clicked was jarring. The overlay keeps
the clicked note at exactly the same screen position:

- **Horizontal:** the box is positioned so its text column matches the
  feed's column (`left = article.left − 48px`, width `article.width + 96px`).
- **Vertical:** the overlay scrolls so the focal note's top lands at the
  y-position it was clicked at. If there isn't enough content above, the
  list gets top padding instead.
- **Edges:** a note clicked very near the top or bottom of the screen is
  placed as close as the box allows (measured: up to about 25px off).
- **Size:** the focal note is not enlarged; a size change also reads as a
  different note.
- **Box height:** the box is always full height, with 60vh of bottom
  padding so a note near the end of its thread can still scroll to the
  anchor. Shrinking the box to fit the content was tried and rejected; a
  box that changes shape per note felt worse.
- Re-focusing inside the overlay uses the same rule: the note you click
  stays put while its context changes.
- Implementation notes: turn off the browser's own scroll anchoring
  (`overflow-anchor: none`), and use `behavior: "instant"` because the
  site's CSS scrolls smoothly. Otherwise the position is adjusted twice, or
  animated.

### Look

The aim was "not stark":

- **No header and no text in the chrome.** Only an icon ✕
  (`aria-label="Close thread"`), kept for touch screens.
- **Box:** the page colour (stone-100), a hairline stone-300 border,
  rounded-xl, and a soft diffuse shadow.
- **Backdrop:** a light wash of the page colour (stone-100/60) with a 2px
  blur, so the feed stays faintly visible. Not a dark scrim.
- **Edges:** content fades over 2rem at the top and 3rem at the bottom
  (`mask-image`), instead of being cut off.
- **No box at all** was trialled and rejected as uncanny. The blurred feed
  text sits directly behind the identical text column.

### Behaviour

- **Page scroll:** locked while open (`overflow: hidden` on `<html>`, with
  `scrollbar-gutter: stable` so the page doesn't shift sideways and break
  the alignment). The scroll area has `overscroll-behavior: contain`, so
  reaching its ends doesn't scroll the page.
- **Focus:** goes to the scroll area on open, not the ✕. There's no focus
  ring on open, and the arrow keys scroll the thread straight away.
- **Focal note:** marked with `aria-current="true"`.

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

A browser check at 390px (2026-10-06): the overlay holds up. The ✕ is a
32px touch target clear of the text, and the clicked note keeps its height
on screen. The page did overflow, but only because of long raw tweet URLs in
the prototype's rough text; the real import won't carry those, so no
wrapping change is needed. A real-phone check happens on the PR's deploy
preview.

## Decided later

- **A thread note's own page** (`/2026oct05-02`) needs its own design
  iteration, tracked in issue #133. For now it renders the note as it
  does today. Once threading ships, a couple of iterations go on a scratch
  page for Tanvi to compare in the browser.
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
