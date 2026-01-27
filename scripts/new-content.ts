import { existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { z } from "astro/zod";

// Schema matching src/content.config.ts
const frontmatterSchema = z.object({
  title: z.string(),
  publishedOn: z.date(),
});

const COLLECTIONS = {
  weeknotes: {
    dir: "posts/weeknotes",
    generateFilename: (input: string) => {
      const year = new Date().getFullYear();
      const slug = input.toLowerCase().replace(/\s+/g, "-");
      return `week-of-${slug}-${year}.md`;
    },
    generateTitle: (input: string) => {
      const year = new Date().getFullYear();
      return `Week of ${input}, ${year}`;
    },
  },
  blog: {
    dir: "posts/blog",
    generateFilename: (input: string) => {
      const slug = input
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      return `${slug}.md`;
    },
    generateTitle: (input: string) => {
      return input.charAt(0).toUpperCase() + input.slice(1);
    },
  },
} as const;

type CollectionName = keyof typeof COLLECTIONS;

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function generateFrontmatter(title: string, publishedOn: Date): string {
  // Validate with Zod before generating
  const validated = frontmatterSchema.parse({ title, publishedOn });

  return `---
title: "${validated.title}"
publishedOn: ${formatDate(validated.publishedOn)}
---

`;
}

function main() {
  const [collectionName, ...inputParts] = process.argv.slice(2);
  const input = inputParts.join(" ");

  if (!collectionName || !input) {
    console.error(`Usage: pnpm <collection>:new "<title>"`);
    console.error(`  pnpm weeknotes:new "Jan 26th"`);
    console.error(`  pnpm blog:new "my blog post title"`);
    process.exit(1);
  }

  if (!(collectionName in COLLECTIONS)) {
    console.error(`Unknown collection: ${collectionName}`);
    console.error(`Available: ${Object.keys(COLLECTIONS).join(", ")}`);
    process.exit(1);
  }

  const collection = COLLECTIONS[collectionName as CollectionName];
  const filename = collection.generateFilename(input);
  const title = collection.generateTitle(input);
  const publishedOn = new Date();

  const filePath = join(process.cwd(), collection.dir, filename);

  if (existsSync(filePath)) {
    console.log(`File already exists, opening: ${collection.dir}/${filename}`);
  } else {
    const content = generateFrontmatter(title, publishedOn);
    writeFileSync(filePath, content);
    console.log(`Created: ${collection.dir}/${filename}`);
  }

  execSync(`webstorm "${filePath}"`, { stdio: "inherit" });
}

main();
