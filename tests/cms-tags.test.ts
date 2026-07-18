import { describe, test, expect } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { parse } from "yaml";
import { TAGS } from "../src/tags";

// Tags are data, not config: one file per tag in posts/tags/. The CMS reads
// them through a relation widget (so a tag created in Sveltia is instantly
// selectable on every post) and src/tags.ts derives the TAGS enum from the
// same files at build time. These tests pin that wiring so tag options can
// never drift again (see the "health" incident).

interface CmsField {
  name: string;
  widget?: string;
  collection?: string;
  multiple?: boolean;
}

interface CmsCollection {
  name: string;
  folder: string;
  create?: boolean;
  fields: CmsField[];
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = parse(
  fs.readFileSync(path.join(root, "public/admin/config.yml"), "utf8"),
);
const collections: CmsCollection[] = config.collections;

const collectionsWithTags = collections.filter((c) =>
  c.fields.some((f) => f.name === "tags"),
);

describe("CMS tags collection", () => {
  const tagsCollection = collections.find((c) => c.name === "tags");

  test("exists, points at posts/tags, and allows creating new tags", () => {
    expect(tagsCollection).toBeDefined();
    expect(tagsCollection!.folder).toBe("posts/tags");
    expect(tagsCollection!.create).toBe(true);
  });
});

describe("post tag fields", () => {
  test("at least one collection exposes a tags field", () => {
    expect(collectionsWithTags.length).toBeGreaterThan(0);
  });

  test.each(collectionsWithTags.map((c) => [c.name, c] as const))(
    "%s sources tag options from the tags collection",
    (_name, collection) => {
      const tagsField = collection.fields.find((f) => f.name === "tags")!;
      expect(tagsField.widget).toBe("relation");
      expect(tagsField.collection).toBe("tags");
      expect(tagsField.multiple).toBe(true);
    },
  );
});

describe("TAGS enum", () => {
  test("is derived from the tag files in posts/tags", () => {
    const slugs = fs
      .readdirSync(path.join(root, "posts/tags"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(slugs.length).toBeGreaterThan(0);
    expect([...TAGS].sort()).toEqual(slugs);
  });
});
