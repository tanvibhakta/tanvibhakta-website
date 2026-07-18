// Registry of the collections that carry tags — the single place to update
// when a collection gains or loses tagging. Everything else derives from it:
// getAllTaggedPosts/getAllTags (src/utils/collections.ts), the /tags pages,
// and tests/cms-tags.test.ts, which also checks this list against the CMS
// config so the two can't drift. Kept free of astro imports so tests can
// import it directly.
export const TAGGED_COLLECTIONS = [
  { name: "blog", label: "Blog", path: "blog" },
  { name: "weeknotes", label: "Weeknotes", path: "weeknotes" },
  { name: "poetry", label: "Poetry", path: "poetry" },
  { name: "digitalGarden", label: "Digital Garden", path: "digital-garden" },
] as const;
