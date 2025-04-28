import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const poetry = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/poetry/" }),
  schema: z.object({
    title: z.string(),
    publishedOn: z.string(),
  }),
});

const weeknotes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/weeknotes/" }),
  schema: z.object({
    title: z.string(),
    publishedOn: z.string(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/blog/" }),
  schema: z.object({
    title: z.string(),
    publishedOn: z.string(),
  }),
});

export const collections = { poetry, weeknotes, blog };
