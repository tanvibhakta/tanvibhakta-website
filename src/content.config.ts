import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

export const TAGS = ["ai-usage", "konkani", "philosophy", "reviews"] as const;
export type Tag = (typeof TAGS)[number];

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

// Short-form, title-less posts (microblog / IndieWeb "notes"). Just a body,
// a timestamp, and optional tags — no `title`, so it gets its own schema.
const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/notes/" }),
  schema: z.object({
    publishedOn: z.date(),
    draft: z.boolean().optional(),
    tags: z.array(z.enum(TAGS)).optional().default([]),
    anchors: z.boolean().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/pages/" }),
  schema: z.object({
    title: z.string(),
    draft: z.boolean().optional(),
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
