import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  gatherLinks,
  serializeArchives,
  SOCIAL_DOMAINS,
  updateArchives,
  type ArchiveMap,
} from "rehype-wayback/sync";

/**
 * Records a Wayback Machine snapshot for every archivable external link in
 * posts/ in src/data/archive-links.json, which rehype-wayback reads at build
 * time to add "[archive]" links. The generic work lives in
 * packages/rehype-wayback; this is the site's wiring: where posts are, how
 * their dates are written, and which domains to leave alone.
 *
 * Captures need ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY (archive.org
 * → account → S3 API keys); without them only existing snapshots are
 * recorded. The Archive links GitHub Action runs this on content pushes and
 * weekly.
 */

const POSTS_DIR = "posts";
const DATA_FILE = "src/data/archive-links.json";

/**
 * Domains never archived (subdomains included). Links already recorded for a
 * newly added domain are pruned on the next run.
 */
export const EXCLUDE = [
  "tanvibhakta.in",
  ...SOCIAL_DOMAINS,
  // Excluded by choice.
  "goodreads.com",
  "spotify.com",
  "letterboxd.com",
  "imdb.com",
  // Behind a login, or not a page a snapshot can hold.
  "docs.google.com",
  "drive.google.com",
  "maps.app.goo.gl",
  "linear.app",
  "claude.ai",
  "read.readwise.io",
];

/** Splits off YAML frontmatter, returning the body and a YYYYMMDD date. */
export function parsePost(text: string): { markdown: string; date?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { markdown: text };
  const date = /^(?:publishedOn|lastUpdatedOn):\s*['"]?(\d{4})-(\d{2})-(\d{2})/m
    .exec(match[1])
    ?.slice(1)
    .join("");
  return { markdown: text.slice(match[0].length), date };
}

async function readPosts(dir: string) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return Promise.all(
    entries
      .filter((e) => e.isFile() && /\.mdx?$/.test(e.name))
      .map(async (e) =>
        parsePost(await readFile(join(e.parentPath, e.name), "utf8")),
      ),
  );
}

// CLI entry, guarded because this module is imported by its test.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { ARCHIVE_ORG_ACCESS_KEY: access, ARCHIVE_ORG_SECRET_KEY: secret } =
      process.env;
    const keys = access && secret ? { access, secret } : undefined;
    if (!keys) {
      console.log(
        "No ARCHIVE_ORG_ACCESS_KEY/ARCHIVE_ORG_SECRET_KEY: looking up existing snapshots only.",
      );
    }
    const archives: ArchiveMap = JSON.parse(await readFile(DATA_FILE, "utf8"));
    const links = gatherLinks(await readPosts(POSTS_DIR), { exclude: EXCLUDE });
    const save = (a: ArchiveMap) => writeFile(DATA_FILE, serializeArchives(a));
    const { added, pruned, missing } = await updateArchives(archives, links, {
      keys,
      onChange: save,
      log: (line) => console.log(line),
    });
    await save(archives);
    console.log(
      `\n${Object.keys(archives).length} archived, ${added} new, ${pruned} pruned, ${missing.length} without a snapshot yet.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
