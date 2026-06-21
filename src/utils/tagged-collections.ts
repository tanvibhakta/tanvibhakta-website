// The collections that carry tags — the single place to update when a
// collection gains or loses tagging. Display labels come from SECTIONS and
// entry URLs from getEntryPath (content.config.ts), so this is just the
// membership list. Kept free of astro imports so tests can import it
// directly; tests/cms-tags.test.ts checks it against the CMS config so the
// two can't drift.
export const TAGGED_COLLECTIONS = [
  "blog",
  "weeknotes",
  "poetry",
  "digitalGarden",
  "notes",
] as const;
