import { describe, test, expect } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { parse } from "yaml";

// Tags are free-form: typing a new tag on a post in the CMS is all it takes
// to create it, and the site derives the tag list from the posts themselves
// (see getAllTags in src/utils/collections.ts). With no fixed enum, the
// failure mode shifts from "tag not in enum" to typos and near-duplicates,
// so these tests enforce tag hygiene instead: kebab-case slugs and no
// case-insensitive collisions.

interface CmsField {
  name: string;
  widget?: string;
  options?: unknown;
  field?: unknown;
  fields?: unknown;
}

interface CmsCollection {
  name: string;
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

describe("CMS tags field", () => {
  test("at least one collection exposes a tags field", () => {
    expect(collectionsWithTags.length).toBeGreaterThan(0);
  });

  test.each(collectionsWithTags.map((c) => [c.name, c] as const))(
    "%s allows free-form tag entry via a simple list widget",
    (_name, collection) => {
      const tagsField = collection.fields.find((f) => f.name === "tags")!;
      expect(tagsField.widget).toBe("list");
      // No subfields and no options: a plain string list, so new tags can
      // be typed directly on the post.
      expect(tagsField.options).toBeUndefined();
      expect(tagsField.field).toBeUndefined();
      expect(tagsField.fields).toBeUndefined();
    },
  );
});

describe("tag hygiene", () => {
  const contentDirs = ["blog", "poetry", "weeknotes", "digital-garden"];
  const usedTags = new Map<string, string[]>(); // tag -> files using it

  for (const dir of contentDirs) {
    const folder = path.join(root, "posts", dir);
    for (const file of fs.readdirSync(folder)) {
      if (!file.endsWith(".md")) continue;
      const raw = fs.readFileSync(path.join(folder, file), "utf8");
      const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
      if (!frontmatter) continue;
      const tags: unknown = parse(frontmatter)?.tags;
      if (!Array.isArray(tags)) continue;
      for (const tag of tags) {
        const files = usedTags.get(String(tag)) ?? [];
        files.push(`posts/${dir}/${file}`);
        usedTags.set(String(tag), files);
      }
    }
  }

  test("some tags are in use", () => {
    expect(usedTags.size).toBeGreaterThan(0);
  });

  test("every tag is a kebab-case slug", () => {
    const invalid = [...usedTags.entries()].filter(
      ([tag]) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag),
    );
    expect(invalid, `malformed tags: ${JSON.stringify(invalid)}`).toEqual([]);
  });

  test("no two tags collide case-insensitively", () => {
    const byLower = new Map<string, string[]>();
    for (const tag of usedTags.keys()) {
      const lower = tag.toLowerCase();
      byLower.set(lower, [...(byLower.get(lower) ?? []), tag]);
    }
    const collisions = [...byLower.values()].filter((v) => v.length > 1);
    expect(collisions, `colliding tags: ${JSON.stringify(collisions)}`).toEqual(
      [],
    );
  });
});
