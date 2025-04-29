import { describe, test, expect } from "vitest";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { exec } from "child_process";

//TODO: https://linear.app/tanvibhakta-website/issue/TBW-44/query-all-external-links-periodically-and-add-a-little-[broken-link]
const IGNORE_EXTERNAL = true;

const IGNORE_PATTERNS = [
  /^mailto:/,
  /^tel:/,
  /^#/,
  /^javascript:/,
  /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|pdf)$/i,
];

type LinkCheckResult = {
  page: string;
  link: string;
  originalHref?: string;
  status: number | string;
};

function extractLinks(html: string, baseUrl: string): Map<string, string> {
  const $ = cheerio.load(html);
  const links = new Map<string, string>();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && !shouldSkipLink(href)) {
      try {
        const normalizedUrl = new URL(href, baseUrl).toString();
        links.set(normalizedUrl, href);
      } catch (error) {
        console.warn(`Invalid URL: ${href} on page ${baseUrl}`);
      }
    }
  });

  return links;
}

function shouldSkipLink(url: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(url));
}

function isInternalLink(url: string, baseUrl: string): boolean {
  try {
    const linkUrl = new URL(url);
    const siteUrl = new URL(baseUrl);
    return linkUrl.hostname === siteUrl.hostname;
  } catch {
    return false;
  }
}

async function findHtmlFiles(distDir: string): Promise<string[]> {
  const htmlFiles: string[] = [];

  async function scanDir(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.name.endsWith(".html")) {
        htmlFiles.push(fullPath);
      }
    }
  }

  await scanDir(distDir);
  return htmlFiles;
}

describe("check links", () => {
  test("All internal links in built files are valid", async () => {
    exec("npm run build");

    const distDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist",
    );

    const htmlFiles = await findHtmlFiles(distDir);
    if (htmlFiles.length === 0) {
      throw new Error(
        `No HTML files found in ${distDir}. Make sure the build produced HTML files.`,
      );
    }

    const brokenLinks: LinkCheckResult[] = [];
    const checkedUrls = new Set<string>();

    for (const htmlFile of htmlFiles) {
      const html = await fs.promises.readFile(htmlFile, "utf8");
      const fileUrl = `file://${htmlFile}`;
      const relativePath = path.relative(distDir, htmlFile);
      const pageUrl = `/${relativePath}`;

      const links = extractLinks(html, fileUrl);

      for (const [url, originalHref] of links.entries()) {
        if (
          url.startsWith("http") &&
          (!IGNORE_EXTERNAL || url.includes("localhost"))
        ) {
          if (checkedUrls.has(url)) continue;
          checkedUrls.add(url);

          try {
            console.log(`Checking link: ${url}`);
            const response = await fetch(url, { method: "HEAD" });
            if (!response.ok) {
              const getResponse = await fetch(url, { method: "GET" });
              if (!getResponse.ok) {
                brokenLinks.push({
                  page: pageUrl,
                  link: url,
                  originalHref,
                  status: getResponse.status,
                });
              }
            }
          } catch (error) {
            console.error(`Error or timeout for link: ${url}`, error);
            brokenLinks.push({
              page: pageUrl,
              link: url,
              originalHref,
              status: (error as Error).message,
            });
          }
        }
      }
    }

    for (const htmlFile of htmlFiles) {
      const html = await fs.promises.readFile(htmlFile, "utf8");
      const relativePath = path.relative(distDir, htmlFile);
      const pageUrl = `/${relativePath}`;

      const baseUrl = "https://localhost:4321";
      const links = extractLinks(html, baseUrl);

      for (const [url, originalHref] of links.entries()) {
        if (isInternalLink(url, baseUrl) || originalHref.startsWith("/")) {
          try {
            const urlObj = new URL(url);
            let pathname = urlObj.pathname;

            // Handle paths with or without trailing slash
            let filePath: string;
            if (pathname.endsWith("/")) {
              filePath = path.join(distDir, pathname, "index.html");
            } else if (!pathname.includes(".")) {
              // If no file extension, assume it's a directory
              filePath = path.join(distDir, pathname, "index.html");
            } else {
              filePath = path.join(distDir, pathname);
            }

            console.log(`Checking file: ${filePath}`);
            if (!fs.existsSync(filePath)) {
              brokenLinks.push({
                page: pageUrl,
                link: url,
                originalHref,
                status: "File not found",
              });
            }
          } catch (error) {
            console.error(`Error checking internal link: ${url}`, error);
            brokenLinks.push({
              page: pageUrl,
              link: url,
              originalHref,
              status: (error as Error).message,
            });
          }
        }
      }
    }

    if (brokenLinks.length > 0) {
      console.table(brokenLinks);
    }

    expect(brokenLinks).toEqual([]);
  }, 60000);
});
