import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const poetry = defineCollection({
  // loader: glob({ pattern: "**/*.md", base: "./src/poetry/" }),
  loader: glob({ pattern: "**/*.md", base: "./posts/poetry/" }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { poetry };
