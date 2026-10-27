import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import {
  archiveKey,
  shouldArchive,
  type ArchiveMap,
} from "../src/utils/archive-links.ts";

/**
 * Finds a Wayback Machine snapshot for every archivable external link in
 * posts/ and records it in src/data/archive-links.json, which the
 * rehype-external-links plugin reads at build time to add an "[archive]" link.
 *
 * - A link already recorded is never looked up again.
 * - Otherwise the snapshot closest to the earliest post linking it is used
 *   (availability API, no key needed), so the archive shows the page as it
 *   was when written about.
 * - No snapshot yet → ask Save Page Now for one, but only when
 *   ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY are set (archive.org →
 *   account → S3 API keys). Without them the link is skipped and retried on
 *   the next run.
 * - Entries for links no longer in posts (or now on SKIP_DOMAINS) are pruned.
 *
 * Network calls run here, never during the Astro build. The Archive links
 * GitHub Action runs this on pushes to posts/ and weekly.
 *
 * Why not an existing package: no remark/rehype plugin finds or creates
 * Wayback snapshots; the closest (an Obsidian plugin) isn't a unified plugin.
 */

const SITE_HOST = "tanvibhakta.in";
const POSTS_DIR = "posts";
const DATA_FILE = "src/data/archive-links.json";
const API = "https://archive.org/wayback/available";
const SAVE = "https://web.archive.org/save";
// Archive.org rate-limits hard; a request a second stays well under it.
const PACE_MS = 1000;
// Save Page Now captures take seconds to minutes each; cap a run's share so
// the first run (hundreds of links) spreads across a few.
const MAX_CAPTURES = 25;
const CAPTURE_POLL_MS = 5000;
const CAPTURE_TIMEOUT_MS = 3 * 60 * 1000;

type Fetch = typeof fetch;
type Keys = { access: string; secret: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Splits off YAML frontmatter, returning the body and a YYYYMMDD date. */
export function parsePost(text: string): { body: string; date?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { body: text };
  const date = /^(?:publishedOn|lastUpdatedOn):\s*['"]?(\d{4})-(\d{2})-(\d{2})/m
    .exec(match[1])
    ?.slice(1)
    .join("");
  return { body: text.slice(match[0].length), date };
}

/**
 * Every absolute http(s) URL a markdown body links to — inline links,
 * reference definitions, `<autolinks>` and GFM bare URLs — exactly what
 * Astro's GFM pipeline would turn into an `<a>`.
 */
export function collectLinks(markdown: string): string[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const urls: string[] = [];
  visit(tree, (node) => {
    if (node.type === "link" || node.type === "definition") {
      if (/^https?:\/\//i.test(node.url)) urls.push(node.url);
    }
  });
  return urls;
}

/**
 * Archivable link key → the earliest YYYYMMDD date a post linking it was
 * published (empty when no linking post is dated).
 */
export function gatherLinks(
  posts: { text: string }[],
  siteHost = SITE_HOST,
): Map<string, string> {
  const links = new Map<string, string>();
  for (const { text } of posts) {
    const { body, date = "" } = parsePost(text);
    for (const url of collectLinks(body)) {
      if (!shouldArchive(url, siteHost)) continue;
      const key = archiveKey(url)!;
      const seen = links.get(key);
      if (seen === undefined || (date && (!seen || date < seen))) {
        links.set(key, date);
      }
    }
  }
  return links;
}

async function fetchJson(f: Fetch, url: string, init?: RequestInit) {
  let res = await f(url, init);
  if (res.status === 429) {
    // Rate limited: back off once, then give up on this link for the run.
    await sleep(60_000);
    res = await f(url, init);
  }
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

/** The snapshot closest to `date` (YYYYMMDD), if the archive has one. */
export async function findSnapshot(
  url: string,
  date: string,
  f: Fetch = fetch,
): Promise<string | null> {
  const query = new URLSearchParams({ url });
  if (date) query.set("timestamp", date);
  const data = await fetchJson(f, `${API}?${query}`);
  const closest = data?.archived_snapshots?.closest;
  // Redirect captures (3xx) replay fine; 4xx/5xx captures are error pages.
  if (!closest?.available || !/^[23]/.test(String(closest.status))) {
    return null;
  }
  return String(closest.url).replace(/^http:/, "https:");
}

/** Asks Save Page Now for a capture and waits for it to finish. */
export async function capture(
  url: string,
  keys: Keys,
  f: Fetch = fetch,
  pollMs = CAPTURE_POLL_MS,
): Promise<string | null> {
  const headers = {
    Accept: "application/json",
    Authorization: `LOW ${keys.access}:${keys.secret}`,
  };
  const job = await fetchJson(f, SAVE, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ url, skip_first_archive: "1" }),
  });
  if (!job?.job_id) {
    throw new Error(job?.message ?? `no capture job for ${url}`);
  }
  for (let waited = 0; waited < CAPTURE_TIMEOUT_MS; waited += pollMs) {
    await sleep(pollMs);
    const status = await fetchJson(f, `${SAVE}/status/${job.job_id}`, {
      headers,
    });
    if (status.status === "success") {
      return `https://web.archive.org/web/${status.timestamp}/${status.original_url ?? url}`;
    }
    if (status.status !== "pending") {
      throw new Error(status.message ?? status.status_ext ?? "capture failed");
    }
  }
  return null;
}

/**
 * Brings `archives` up to date with `links`: prunes entries no longer
 * linked, then looks up (and, given keys, captures) each missing one.
 * `onChange` runs after every addition so an interrupted run keeps progress.
 */
export async function updateArchives(
  archives: ArchiveMap,
  links: Map<string, string>,
  options: {
    keys?: Keys;
    fetch?: Fetch;
    paceMs?: number;
    maxCaptures?: number;
    pollMs?: number;
    onChange?: (archives: ArchiveMap) => Promise<void>;
    log?: (line: string) => void;
  } = {},
): Promise<{ added: number; pruned: number; missing: string[] }> {
  const {
    keys,
    fetch: f = fetch,
    paceMs = PACE_MS,
    maxCaptures = MAX_CAPTURES,
    pollMs,
    onChange = async () => {},
    log = () => {},
  } = options;

  let pruned = 0;
  for (const key of Object.keys(archives)) {
    if (!links.has(key)) {
      delete archives[key];
      pruned++;
    }
  }

  let added = 0;
  let captures = 0;
  const missing: string[] = [];
  for (const [url, date] of links) {
    if (archives[url]) continue;
    try {
      let snapshot = await findSnapshot(url, date, f);
      if (!snapshot && keys && captures < maxCaptures) {
        captures++;
        log(`capturing ${url}`);
        snapshot = await capture(url, keys, f, pollMs);
      }
      if (snapshot) {
        archives[url] = snapshot;
        added++;
        log(`✓ ${url}`);
        await onChange(archives);
      } else {
        missing.push(url);
      }
    } catch (error) {
      log(`✗ ${url}: ${error instanceof Error ? error.message : error}`);
      missing.push(url);
    }
    await sleep(paceMs);
  }
  return { added, pruned, missing };
}

async function readPosts(dir: string): Promise<{ text: string }[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return Promise.all(
    entries
      .filter((e) => e.isFile() && /\.mdx?$/.test(e.name))
      .map(async (e) => ({
        text: await readFile(join(e.parentPath, e.name), "utf8"),
      })),
  );
}

/** Stable, prettier-compatible JSON: sorted keys, two-space indent. */
function serialize(archives: ArchiveMap): string {
  const sorted = Object.fromEntries(
    Object.entries(archives).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
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
    const links = gatherLinks(await readPosts(POSTS_DIR));
    const save = (a: ArchiveMap) => writeFile(DATA_FILE, serialize(a));
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
