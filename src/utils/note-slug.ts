// Notes are permalinked at the site root by day and position within that
// day: the second note of 5 Oct 2026 lives at /2026oct05-02. The position is
// zero-padded to two digits; a 100th note that day would just widen.
// Numbering per day (not across all notes) means back-dating a note can only
// shift the slugs of notes on that same day. Lowercase throughout, since URLs
// are case-sensitive.
//
// Kept free of astro:content so the Telegram webhook can share it.

// Whether a path segment is a note slug, e.g. "2026oct05-02". Notes share
// the root with pages, so this is how a root path is known to be a note.
export function isNoteSlug(segment: string): boolean {
  return /^\d{4}[a-z]{3}\d{2}-\d{2,}$/.test(segment);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// en-US pinned: other locales differ (en-GB's September is "Sept").
// timeZone UTC: notes store a naive IST wall clock that parses as UTC (see
// formatNoteTimestamp), so reading it in UTC gives the authored date.
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
});

/** "2026oct05" for a note's publishedOn. */
export function noteDayKey(publishedOn: Date): string {
  const parts = Object.fromEntries(
    DAY_FORMAT.formatToParts(publishedOn).map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`.toLowerCase();
}

interface SlugInput {
  id: string;
  publishedOn: Date;
}

/**
 * Slug for every note, keyed by id. Within a day, notes are ordered by
 * publish time, ties broken by id.
 */
export function assignNoteSlugs(notes: SlugInput[]): Map<string, string> {
  const sorted = [...notes].sort((a, b) => {
    const byDate = a.publishedOn.getTime() - b.publishedOn.getTime();
    if (byDate !== 0) return byDate;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const perDay = new Map<string, number>();
  const slugs = new Map<string, string>();
  for (const note of sorted) {
    const day = noteDayKey(note.publishedOn);
    const position = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, position);
    slugs.set(note.id, `${day}-${pad2(position)}`);
  }
  return slugs;
}

/**
 * The slug of a note, given the filenames in posts/notes/. Filenames start
 * with the publish date and minute (YYYY-MM-DD-HHMM), so sorting the stems
 * that share a date approximates assignNoteSlugs — exact except for two notes
 * in the same minute, where that compares seconds. Stems, not full names:
 * "-" sorts before ".", so `1200-77.md` would otherwise precede `1200.md`.
 */
export function noteSlugFromListing(
  filenames: string[],
  filename: string,
): string {
  const stem = filename.replace(/\.md$/, "");
  const date = stem.slice(0, 10);
  const sameDay = filenames
    .filter((name) => name.endsWith(".md") && name.startsWith(date))
    .map((name) => name.slice(0, -3))
    .sort();
  const day = noteDayKey(new Date(`${date}T00:00:00Z`));
  return `${day}-${pad2(sameDay.indexOf(stem) + 1)}`;
}
