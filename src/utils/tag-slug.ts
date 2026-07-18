// The required shape for tags: kebab-case slugs. Shared by the content
// schema (authoritative, enforced at build) and tests/cms-tags.test.ts
// (fast feedback) — astro-free so the test can import it.
export const TAG_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
