import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import http from "http";
import path from "path";
import fs from "fs";
import type { AddressInfo } from "net";

// Layout only exists in a real browser — cheerio/happy-dom can't measure
// widths — so this test serves dist/ and loads every page in Chromium.

const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

// Phone (the usual culprit) and desktop.
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
];

const CONCURRENCY = 8;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

let server: http.Server;
let baseUrl: string;
let browser: Browser;

// Minimal static server for dist/: `/foo/` → `/foo/index.html`.
function serveDist(): Promise<http.Server> {
  const srv = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url!, "http://x").pathname);
    let file = path.join(distDir, pathname);
    if (!file.startsWith(distDir)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    srv.listen(0, "127.0.0.1", () => resolve(srv)),
  );
}

async function findPages(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    for (const entry of await fs.promises.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".html")) {
        // Redirect stubs (astro.config `redirects`) navigate away on load,
        // so there's no layout of their own to check.
        const html = await fs.promises.readFile(full, "utf8");
        if (/http-equiv="refresh"/i.test(html)) continue;
        const rel = path.relative(distDir, full).split(path.sep).join("/");
        out.push("/" + rel.replace(/(^|\/)index\.html$/, "$1"));
      }
    }
  }
  await walk(dir);
  return out.sort();
}

beforeAll(async () => {
  // Reuse dist if it exists; linkChecker.test.ts builds it in a full run.
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    execSync("pnpm run build", { stdio: "inherit" });
  }
  server = await serveDist();
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch();
}, 120000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

describe("no page scrolls horizontally", () => {
  test.each(VIEWPORTS)(
    "every built page fits a $width px viewport",
    async (viewport) => {
      const pages = await findPages(distDir);
      expect(pages.length).toBeGreaterThan(0);

      const context = await browser.newContext({ viewport });
      // External requests (embeds, analytics, fonts) slow the run and can't
      // be relied on offline; layout must hold without them anyway.
      await context.route(
        (url) => !url.href.startsWith(baseUrl),
        (route) => route.abort(),
      );

      const violations: string[] = [];
      const queue = [...pages];

      async function worker() {
        const page = await context.newPage();
        for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
          await page.goto(baseUrl + p, { waitUntil: "load" });
          const result = await page.evaluate(() => {
            const root = document.documentElement;
            const viewportWidth = root.clientWidth;
            if (root.scrollWidth <= viewportWidth) return null;
            // Name the element reaching furthest right (the deepest one, on a
            // tie) so a failure points at the culprit, not the whole <main>
            // it stretched.
            let culprit: Element | null = null;
            let furthest = viewportWidth;
            for (const el of document.body.querySelectorAll("*")) {
              const right = el.getBoundingClientRect().right;
              if (right >= furthest) {
                culprit = el;
                furthest = right;
              }
            }
            const describe = (el: Element | null) => {
              if (!el) return "unknown element";
              const cls =
                typeof el.className === "string" && el.className.trim()
                  ? "." + el.className.trim().split(/\s+/).join(".")
                  : "";
              const text = (el.textContent ?? "").trim().slice(0, 60);
              return `<${el.tagName.toLowerCase()}${cls}> "${text}"`;
            };
            return {
              scrollWidth: root.scrollWidth,
              viewportWidth,
              culprit: describe(culprit),
            };
          });
          if (result) {
            violations.push(
              `${p}: scrollWidth ${result.scrollWidth} > ${result.viewportWidth} — ${result.culprit}`,
            );
          }
        }
        await page.close();
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      await context.close();

      expect(violations.sort()).toEqual([]);
    },
    300000,
  );
});
