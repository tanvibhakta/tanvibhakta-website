import { describe, test, expect, beforeAll } from "vitest";
import * as cheerio from "cheerio";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

const ANCHORABLE = ["p", "li", "h2", "h3", "h4", "h5", "h6"];

beforeAll(() => {
  // Reuse dist if it exists; otherwise build. linkChecker.test.ts also builds —
  // running both tests together is safe; running this one alone triggers a build.
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    execSync("pnpm run build", { stdio: "inherit" });
  }
}, 60000);

async function findHtmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    for (const entry of await fs.promises.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".html")) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

describe("anchor invariants across all built pages", () => {
  test("every anchored element has at most one well-formed .anchor-link", async () => {
    const violations: string[] = [];
    const htmlFiles = await findHtmlFiles(distDir);

    for (const file of htmlFiles) {
      const rel = path.relative(distDir, file);
      const $ = cheerio.load(await fs.promises.readFile(file, "utf8"));

      // Per-page id uniqueness — duplicate ids break in-page navigation.
      const seenIds = new Set<string>();
      $("[id]").each((_, el) => {
        const id = $(el).attr("id")!;
        if (seenIds.has(id)) violations.push(`${rel}: duplicate id="${id}"`);
        seenIds.add(id);
      });

      $(ANCHORABLE.join(",")).each((_, el) => {
        const $el = $(el);
        // The runtime-built selector string types this Cheerio as AnyNode,
        // but the selector only matches tag elements; narrow via `in`.
        const tag = "tagName" in el ? el.tagName : "";
        const id = $el.attr("id");
        const directAnchors = $el.children("a.anchor-link");

        // Loose-list <li><p>...</p></li> defers to inner <p>.
        if (tag === "li" && $el.children("p").length > 0) {
          if (directAnchors.length > 0) {
            violations.push(
              `${rel}: <li> wrapping <p> shouldn't have its own anchor`,
            );
          }
          return;
        }

        if (directAnchors.length > 1) {
          violations.push(
            `${rel}: <${tag} id="${id ?? "?"}"> has ${directAnchors.length} anchor-links (expected 1)`,
          );
        }

        if (directAnchors.length === 1) {
          const href = directAnchors.attr("href");
          if (!id) {
            violations.push(
              `${rel}: <${tag}> has anchor-link but no id attribute`,
            );
          } else if (href !== `#${id}`) {
            violations.push(
              `${rel}: <${tag} id="${id}"> anchor href "${href}" doesn't match id`,
            );
          }
        }
      });
    }

    expect(violations).toEqual([]);
  }, 60000);
});

describe("kitchen-sink fixture snapshot", () => {
  test("anchored elements in _anchor-fixture render with stable structure", async () => {
    const fixturePath = path.join(distDir, "_anchor-fixture", "index.html");
    expect(fs.existsSync(fixturePath)).toBe(true);

    const $ = cheerio.load(await fs.promises.readFile(fixturePath, "utf8"));
    const article = $("article, main, .prose").first();
    const root = article.length > 0 ? article : $("body");

    const lines: string[] = [];
    root.find(ANCHORABLE.join(",")).each((_, el) => {
      const $el = $(el);
      const tag = el.tagName;
      const id = $el.attr("id") ?? "(no-id)";
      const anchor = $el.children("a.anchor-link");
      const href = anchor.length > 0 ? anchor.attr("href") : "(no-anchor)";
      const summary = $el
        .clone()
        .children("a.anchor-link")
        .remove()
        .end()
        .text()
        .trim()
        .slice(0, 50);
      lines.push(`<${tag} id="${id}"> → ${href}  | "${summary}"`);
    });

    expect(lines.join("\n")).toMatchSnapshot();
  }, 60000);
});
