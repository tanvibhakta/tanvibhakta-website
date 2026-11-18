import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// /components (src/showcase/components.mdx) must show every component and
// markdown plugin, so agents find them before building duplicates. Adding a
// file to src/components or src/plugins fails this until it's on the page
// or, if it's site chrome every page already shows, in SKIP with a reason.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(
  path.join(root, "src/showcase/components.mdx"),
  "utf8",
);

const SKIP: Record<string, string> = {
  "Header.astro": "site chrome, on every page",
  "Nav.astro": "site chrome, on every page",
  "Footer.astro": "site chrome, on every page",
  "SiteFooter.astro": "site chrome, on every page",
  "EntryPage.astro": "the post template, not a component to place",
};

const files = (dir: string) =>
  fs
    .readdirSync(path.join(root, dir))
    .filter((f) => !SKIP[f])
    .map((f) => `${dir}/${f}`);

describe("/components page", () => {
  test.each([...files("src/components"), ...files("src/plugins")])(
    "names %s",
    (file) => {
      expect(page).toContain(file);
    },
  );

  test("skip list only names files that exist", () => {
    for (const name of Object.keys(SKIP))
      expect(fs.existsSync(path.join(root, "src/components", name))).toBe(true);
  });
});
