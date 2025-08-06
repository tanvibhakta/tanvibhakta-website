import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

// Common schema for all collections
const collectionSchema = z.object({
  title: z.string(),
  publishedOn: z.date(),
});

// Manually define collections for now
// TODO: Make this dynamic when Astro supports it better
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/blog/" }),
  schema: collectionSchema,
});

const weeknotes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/weeknotes/" }),
  schema: collectionSchema,
});

const poetry = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/poetry/" }),
  schema: collectionSchema,
});

const digitalGarden = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/digital-garden/" }),
  schema: collectionSchema.extend({
    description: z.string().optional(),
    lastUpdatedOn: z.date().optional(),
  }),
});

export const collections = {
  blog,
  weeknotes,
  poetry,
  digitalGarden,
};
