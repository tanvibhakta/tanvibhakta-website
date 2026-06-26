import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

export const TAGS = [
  "ai-usage",
  "health",
  "konkani",
  "philosophy",
  "reviews",
] as const;
export type Tag = (typeof TAGS)[number];

/**
 * Single source of truth for page/section blurbs.
 *
 * SECTIONS are listing pages backed by a content collection — they show a
 * count of their children. Keyed by collection name so we can look up the
 * blurb from the section's own index page and count its entries.
 *
 * STANDALONE_PAGES are hand-built routes with no child collection. Markdown
 * pages (the `pages` collection, e.g. /care, /now) are NOT listed here — they
 * carry their own `description` in frontmatter and are discovered
 * automatically, so adding one needs no edit here.
 *
 * Consumed by /sitemap, by each section's index page (title + share-card
 * description), and available anywhere else a blurb is useful.
 */
export type SectionMeta = { href: string; title: string; description: string };

export const SECTIONS = {
  blog: { href: "/blog", title: "Blog", description: "coherent ideas" },
  poetry: {
    href: "/poetry",
    title: "Poetry",
    description: "Poems, some with audio readings.",
  },
  weeknotes: {
    href: "/weeknotes",
    title: "Weeknotes",
    description: "Short, (ir)regular notes on life and work.",
  },
  digitalGarden: {
    href: "/digital-garden",
    title: "Digital Garden",
    description: "(abandoned) garden",
  },
} as const satisfies Record<string, SectionMeta>;

export const STANDALONE_PAGES = [
  { href: "/", title: "Home", description: "home" },
  { href: "/work", title: "Work", description: "resume ++" },
  {
    href: "/subscribe",
    title: "Subscribe",
    description: "RSS feeds for every section",
  },
  {
    href: "/tags",
    title: "Tags",
    description: "lists all tags used across the site. cross-category",
  },
] as const satisfies readonly SectionMeta[];

// Lookup by href so a standalone page can pull its own title/description.
export const PAGE_META: Record<string, SectionMeta> = Object.fromEntries(
  STANDALONE_PAGES.map((page) => [page.href, page]),
);

// Common schema for all collections.
// `anchors` toggles the rehype-anchors plugin per entry — set false to skip
// generating per-paragraph / per-list-item `#` links. Collection-wide
// defaults are configured via the plugin's `skip` option in astro.config.
const collectionSchema = z.object({
  title: z.string(),
  publishedOn: z.date(),
  draft: z.boolean().optional(),
  tags: z.array(z.enum(TAGS)).optional().default([]),
  anchors: z.boolean().optional(),
});

// Manually define collections for now
// TODO: Make this dynamic when Astro supports it better
const audioSchema = {
  audio: z.string().optional(),
  audioTitle: z.string().optional(),
};

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/blog/" }),
  schema: collectionSchema.extend(audioSchema),
});

const weeknotes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/weeknotes/" }),
  schema: collectionSchema,
});

const poetry = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/poetry/" }),
  schema: collectionSchema.extend(audioSchema),
});

const digitalGarden = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/digital-garden/" }),
  schema: collectionSchema.extend({
    description: z.string().optional(),
    lastUpdatedOn: z.date(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/pages/" }),
  schema: z.object({
    title: z.string(),
    draft: z.boolean().optional(),
    // Blurb shown on /sitemap and used for the page's share-card description.
    description: z.string().optional(),
  }),
});

export const collections = {
  blog,
  weeknotes,
  poetry,
  digitalGarden,
  pages,
};
