import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { TAG_SLUG_PATTERN } from "./utils/tag-slug";

// Tags are free-form; the site-wide tag list is derived from posts (see
// getAllTags in src/utils/collections.ts). Enforce a consistent slug shape
// so typos like "AI Usage" or trailing spaces fail the build.
const tagSchema = z
  .string()
  .regex(TAG_SLUG_PATTERN, "tags must be kebab-case slugs, e.g. ai-usage");

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
 * Consumed by /sitemap, by the nav (labels come from `title`), and by each
 * page itself (title + share-card description).
 */
export type SectionMeta = { href: string; title: string; description: string };

/**
 * Collection name → URL path segment. The single source of truth for where
 * each collection's entries are served: published entries at
 * /<segment>/<id>, drafts at /drafts/<segment>/<id>. `pages` entries are
 * served at the site root, so their segment is empty. Section hrefs below
 * derive from this map so the two can never drift.
 */
export const COLLECTION_SEGMENTS = {
  blog: "blog",
  poetry: "poetry",
  weeknotes: "weeknotes",
  digitalGarden: "digital-garden",
  notes: "notes",
  pages: "",
} as const satisfies Record<keyof typeof collections, string>;

export const SECTIONS = {
  blog: {
    href: `/${COLLECTION_SEGMENTS.blog}`,
    title: "Blog",
    description: "coherent ideas",
  },
  poetry: {
    href: `/${COLLECTION_SEGMENTS.poetry}`,
    title: "Poetry",
    description: "Poems, some with audio readings.",
  },
  weeknotes: {
    href: `/${COLLECTION_SEGMENTS.weeknotes}`,
    title: "Weeknotes",
    description: "Short, (ir)regular notes on life and work.",
  },
  digitalGarden: {
    href: `/${COLLECTION_SEGMENTS.digitalGarden}`,
    title: "Digital Garden",
    description: "(abandoned) garden",
  },
  notes: {
    href: `/${COLLECTION_SEGMENTS.notes}`,
    title: "Notes",
    description: "short, title-less posts",
  },
} as const satisfies Record<string, SectionMeta>;

export const STANDALONE_PAGES = {
  home: { href: "/", title: "Home", description: "home" },
  work: { href: "/work", title: "Work", description: "resume ++" },
  subscribe: {
    href: "/subscribe",
    title: "Subscribe",
    description: "RSS feeds for every section",
  },
  tags: {
    href: "/tags",
    title: "Tags",
    description: "lists all tags used across the site. cross-category",
  },
} as const satisfies Record<string, SectionMeta>;

// Common schema for all collections.
// `anchors` toggles the rehype-anchors plugin per entry — set false to skip
// generating per-paragraph / per-list-item `#` links. Collection-wide
// defaults are configured via the plugin's `skip` option in astro.config.
const collectionSchema = z.object({
  title: z.string(),
  publishedOn: z.date(),
  draft: z.boolean().optional(),
  tags: z.array(tagSchema).optional().default([]),
  anchors: z.boolean().optional(),
  // Share-card / meta description; surfaces via ProseLayout → Layout.
  description: z.string().optional(),
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
    lastUpdatedOn: z.date(),
  }),
});

// Short-form, title-less posts (microblog / IndieWeb "notes"). The markdown
// body is the content; frontmatter is just a full-precision timestamp and
// optional tags — no `title`, no `draft` (notes publish immediately), and no
// `anchors` (the rehype-anchors plugin is skipped for notes in astro.config).
const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/notes/" }),
  schema: z.object({
    publishedOn: z.date(),
    tags: z.array(tagSchema).optional().default([]),
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
  notes,
  pages,
};
