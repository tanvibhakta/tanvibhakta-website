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
  poetry: {
    dir: "posts/poetry",
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
  // Title-less short posts. No input needed; the filename is a timestamp.
  notes: {
    dir: "posts/notes",
    titleless: true,
    generateFilename: (_input: string) => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
        now.getDate(),
      )}-${pad(now.getHours())}${pad(now.getMinutes())}.md`;
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

function generateTitlelessFrontmatter(publishedOn: Date): string {
  return `---
publishedOn: ${formatDate(publishedOn)}
---

`;
}

function main() {
  const [collectionName, ...inputParts] = process.argv.slice(2);
  const input = inputParts.join(" ");

  if (!collectionName || !(collectionName in COLLECTIONS)) {
    console.error(`Usage: pnpm <collection>:new "<title>"`);
    console.error(`  pnpm weeknotes:new "Jan 26th"`);
    console.error(`  pnpm blog:new "my blog post title"`);
    console.error(`  pnpm notes:new            (title-less, no input needed)`);
    if (collectionName && !(collectionName in COLLECTIONS)) {
      console.error(`\nUnknown collection: ${collectionName}`);
      console.error(`Available: ${Object.keys(COLLECTIONS).join(", ")}`);
    }
    process.exit(1);
  }

  const collection = COLLECTIONS[collectionName as CollectionName];
  const titleless = "titleless" in collection && collection.titleless;

  if (!titleless && !input) {
    console.error(`A title is required: pnpm ${collectionName}:new "<title>"`);
    process.exit(1);
  }

  const filename = collection.generateFilename(input);
  const publishedOn = new Date();

  const filePath = join(process.cwd(), collection.dir, filename);

  if (existsSync(filePath)) {
    console.log(`File already exists, opening: ${collection.dir}/${filename}`);
  } else {
    const content =
      "generateTitle" in collection
        ? generateFrontmatter(collection.generateTitle(input), publishedOn)
        : generateTitlelessFrontmatter(publishedOn);
    writeFileSync(filePath, content);
    console.log(`Created: ${collection.dir}/${filename}`);
  }

  execSync(`zed "${filePath}"`, { stdio: "inherit" });
}

main();
