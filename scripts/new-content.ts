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
    generateFilename: (input: string, now: Date) => {
      const slug = input.toLowerCase().replace(/\s+/g, "-");
      return `week-of-${slug}-${now.getFullYear()}.md`;
    },
    generateTitle: (input: string, now: Date) => {
      return `Week of ${input}, ${now.getFullYear()}`;
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
    generateFilename: (_input: string, now: Date) => {
      // Reshape "YYYY-MM-DDTHH:mm:ss" into "YYYY-MM-DD-HHmm.md" so the
      // filename always agrees with the publishedOn frontmatter.
      const timestamp = formatLocalTimestamp(now);
      return `${timestamp.slice(0, 10)}-${timestamp.slice(11, 16).replace(":", "")}.md`;
    },
  },
} as const;

type CollectionName = keyof typeof COLLECTIONS;

// Seconds-precision ISO timestamp so same-day posts have a defined order.
// Matches the CMS, which stores publishedOn as YYYY-MM-DDTHH:mm:ssZ.
function formatDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// A naive local wall-clock timestamp ("YYYY-MM-DDTHH:mm:ss", no offset) stamped
// at creation time. Notes display this exact wall clock (see formatNoteTimestamp).
function formatLocalTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
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
publishedOn: ${formatLocalTimestamp(publishedOn)}
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

  // A single timestamp for both filename and frontmatter, so a minute tick
  // between the two can't make them disagree.
  const publishedOn = new Date();
  const filename = collection.generateFilename(input, publishedOn);

  const filePath = join(process.cwd(), collection.dir, filename);

  if (existsSync(filePath)) {
    console.log(`File already exists, opening: ${collection.dir}/${filename}`);
  } else {
    const content =
      "generateTitle" in collection
        ? generateFrontmatter(
            collection.generateTitle(input, publishedOn),
            publishedOn,
          )
        : generateTitlelessFrontmatter(publishedOn);
    writeFileSync(filePath, content);
    console.log(`Created: ${collection.dir}/${filename}`);
  }

  execSync(`zed "${filePath}"`, { stdio: "inherit" });
}

main();
