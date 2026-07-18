// Single source of truth for content tags: the files in posts/tags/, which
// the CMS manages (see the tags collection in public/admin/config.yml).
// Derived here so the content schema validates against the exact same list
// the CMS offers. Lives outside content.config.ts so tests can import it
// without resolving the astro:content virtual module.
const tagFiles = import.meta.glob("../posts/tags/*.md");

export const TAGS = Object.keys(tagFiles)
  .map((file) => file.split("/").pop()!.replace(/\.md$/, ""))
  .sort();
export type Tag = (typeof TAGS)[number];
