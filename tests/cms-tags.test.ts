import { describe, test, expect } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { parse } from "yaml";
import { TAGGED_COLLECTIONS } from "../src/utils/tagged-collections";
import { TAG_SLUG_PATTERN } from "../src/utils/tag-slug";

// Tags are free-form: typing a new tag on a post in the CMS is all it takes
// to create it, and the site derives the tag list from the posts themselves
// (see getAllTags in src/utils/collections.ts). With no fixed enum, the
// failure mode shifts from "tag not in enum" to typos and near-duplicates,
// so these tests enforce tag hygiene instead: kebab-case slugs, no spelling
// variants, no singular/plural pairs.

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

/**
 * Groups of tags that are spelling variants of the same tag: identical once
 * lowercased and stripped of hyphens ("Health" / "health", "ai-usage" /
 * "aiusage"). The hyphenation case is the one the kebab-case format check
 * can't catch — both spellings are individually valid.
 */
function findSpellingCollisions(tags: string[]): string[][] {
  const byNormalized = new Map<string, string[]>();
  for (const tag of [...tags].sort()) {
    const normalized = tag.toLowerCase().replace(/-/g, "");
    byNormalized.set(normalized, [
      ...(byNormalized.get(normalized) ?? []),
      tag,
    ]);
  }
  return [...byNormalized.values()].filter((group) => group.length > 1);
}

/**
 * Pairs of tags where one looks like the plural of the other ("review" /
 * "reviews", "box" / "boxes"), which almost always means the same tag was
 * spelled two ways. Returns [singular, plural] pairs.
 */
function findPluralPairs(tags: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  const sorted = [...tags].sort();
  for (const a of sorted) {
    for (const b of sorted) {
      if (b === `${a}s` || b === `${a}es`) pairs.push([a, b]);
    }
  }
  return pairs;
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
  test("collections with a tags field match the TAGGED_COLLECTIONS registry", () => {
    // Both sides of the tagging system derive from the registry, so a
    // collection gaining or losing a tags field in the CMS must be
    // registered there too — otherwise its tags silently never surface.
    expect(collectionsWithTags.map((c) => c.name).sort()).toEqual(
      TAGGED_COLLECTIONS.map((c) => c.name).sort(),
    );
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
  const usedTags = new Map<string, string[]>(); // tag -> files using it

  for (const { path: dir } of TAGGED_COLLECTIONS) {
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
      ([tag]) => !TAG_SLUG_PATTERN.test(tag),
    );
    expect(invalid, `malformed tags: ${JSON.stringify(invalid)}`).toEqual([]);
  });

  test("no two tags are spelling variants of each other", () => {
    const collisions = findSpellingCollisions([...usedTags.keys()]);
    const detail = collisions
      .map((group) =>
        group
          .map((t) => `"${t}" (${usedTags.get(t)!.join(", ")})`)
          .join(" vs "),
      )
      .join("; ");
    expect(collisions, `same tag spelled differently: ${detail}`).toEqual([]);
  });

  test("no singular/plural near-duplicates", () => {
    const pairs = findPluralPairs([...usedTags.keys()]);
    const detail = pairs
      .map(
        ([a, b]) =>
          `"${a}" (${usedTags.get(a)!.join(", ")}) vs "${b}" (${usedTags.get(b)!.join(", ")})`,
      )
      .join("; ");
    expect(pairs, `similar tags, pick one spelling: ${detail}`).toEqual([]);
  });
});

describe("findSpellingCollisions", () => {
  test("flags case variants", () => {
    expect(findSpellingCollisions(["Health", "health"])).toEqual([
      ["Health", "health"],
    ]);
  });

  test("flags hyphenation variants", () => {
    expect(findSpellingCollisions(["ai-usage", "aiusage"])).toEqual([
      ["ai-usage", "aiusage"],
    ]);
  });

  test("flags combined case and hyphenation variants", () => {
    expect(findSpellingCollisions(["AI-Usage", "aiusage"])).toEqual([
      ["AI-Usage", "aiusage"],
    ]);
  });

  test("ignores genuinely distinct tags", () => {
    expect(
      findSpellingCollisions(["health", "philosophy", "ai-usage"]),
    ).toEqual([]);
  });
});

describe("findPluralPairs", () => {
  test("flags simple s-plurals", () => {
    expect(findPluralPairs(["review", "reviews"])).toEqual([
      ["review", "reviews"],
    ]);
  });

  test("flags es-plurals", () => {
    expect(findPluralPairs(["box", "boxes"])).toEqual([["box", "boxes"]]);
  });

  test("flags plurals in multi-word slugs", () => {
    expect(findPluralPairs(["book-review", "book-reviews"])).toEqual([
      ["book-review", "book-reviews"],
    ]);
  });

  test("ignores unrelated tags", () => {
    expect(findPluralPairs(["health", "philosophy", "reviews"])).toEqual([]);
  });
});
