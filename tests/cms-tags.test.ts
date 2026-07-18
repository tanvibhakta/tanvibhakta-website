import { describe, test, expect } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { parse } from "yaml";
import { TAGS } from "../src/tags";

// The CMS duplicates the tag list in every collection's select widget, so it
// can silently drift from the TAGS enum that the content schema validates
// against (see the "health" incident). This test fails the build when they
// disagree, in either direction.

interface CmsField {
  name: string;
  widget?: string;
  options?: { label: string; value: string }[];
}

interface CmsCollection {
  name: string;
  fields: CmsField[];
}

const configPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/admin/config.yml",
);
const config = parse(fs.readFileSync(configPath, "utf8"));
const collections: CmsCollection[] = config.collections;

const collectionsWithTags = collections.filter((c) =>
  c.fields.some((f) => f.name === "tags"),
);

describe("CMS config tags", () => {
  test("at least one collection exposes a tags field", () => {
    expect(collectionsWithTags.length).toBeGreaterThan(0);
  });

  test.each(collectionsWithTags.map((c) => [c.name, c] as const))(
    "%s tag options match the TAGS enum",
    (_name, collection) => {
      const tagsField = collection.fields.find((f) => f.name === "tags")!;
      expect(tagsField.widget).toBe("select");
      const values = tagsField.options?.map((o) => o.value) ?? [];
      expect([...values].sort()).toEqual([...TAGS].sort());
    },
  );
});
