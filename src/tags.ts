// Single source of truth for content tags. Lives outside content.config.ts
// so tests can import it without resolving the astro:content virtual module.
export const TAGS = [
  "ai-usage",
  "health",
  "konkani",
  "philosophy",
  "reviews",
] as const;
export type Tag = (typeof TAGS)[number];
