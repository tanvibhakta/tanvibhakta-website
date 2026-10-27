/**
 * Node-side half of rehype-wayback: finds (and, with archive.org keys,
 * creates) Wayback Machine snapshots for the links in a set of markdown
 * documents, keeping them in a `{ url: snapshotUrl }` map that the rehype
 * plugin renders from. Run it from a script or CI job, not during a build:
 * captures take seconds to minutes each and archive.org rate-limits.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { archiveKey } from "./lib/key.js";

export { archiveKey };

/** @typedef {Record<string, string>} ArchiveMap */
/** @typedef {{ access: string, secret: string }} Keys */

const AVAILABLE = "https://archive.org/wayback/available";
const SAVE = "https://web.archive.org/save";

/**
 * Social networks and video sites: pages that are login-walled, rendered by
 * script, or otherwise make poor snapshots. A starting point for `exclude`.
 */
export const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "x.com",
  "twitter.com",
  "t.co",
  "xcancel.com",
  "linkedin.com",
  "threads.net",
  "threads.com",
  "bsky.app",
  "mastodon.social",
  "tiktok.com",
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "t.me",
  "strava.com",
];

/** Links into archives themselves never need archiving. */
const ARCHIVE_DOMAINS = [
  "archive.org",
  "archive.ph",
  "archive.today",
  "archive.is",
];

const sleep = (/** @type {number} */ ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every absolute http(s) URL a markdown document links to — inline links,
 * reference definitions, `<autolinks>` and GFM bare URLs. Images excluded.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function collectLinks(markdown) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  /** @type {string[]} */
  const urls = [];
  visit(tree, (node) => {
    if (node.type === "link" || node.type === "definition") {
      if (/^https?:\/\//i.test(node.url)) urls.push(node.url);
    }
  });
  return urls;
}

/**
 * Whether `href` is an absolute http(s) URL outside `exclude` (domains,
 * subdomains included; a leading `www.` is ignored) and not already an
 * archive link.
 *
 * @param {string} href
 * @param {string[]} [exclude]
 */
export function shouldArchive(href, exclude = []) {
  const key = archiveKey(href);
  if (!key) return false;
  const host = new URL(key).hostname.replace(/^www\./, "");
  return ![...exclude, ...ARCHIVE_DOMAINS].some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/**
 * Archivable link key → the earliest date (YYYYMMDD) of a document linking
 * it; "" when none of them is dated.
 *
 * @param {{ markdown: string, date?: string }[]} documents
 * @param {{ exclude?: string[] }} [options]
 * @returns {Map<string, string>}
 */
export function gatherLinks(documents, options = {}) {
  /** @type {Map<string, string>} */
  const links = new Map();
  for (const { markdown, date = "" } of documents) {
    for (const url of collectLinks(markdown)) {
      if (!shouldArchive(url, options.exclude)) continue;
      const key = /** @type {string} */ (archiveKey(url));
      const seen = links.get(key);
      if (seen === undefined || (date && (!seen || date < seen))) {
        links.set(key, date);
      }
    }
  }
  return links;
}

/**
 * @param {typeof fetch} f
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchJson(f, url, init) {
  let res = await f(url, init);
  if (res.status === 429) {
    // Rate limited: back off once, then let the caller skip this link.
    await sleep(60_000);
    res = await f(url, init);
  }
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

/**
 * The snapshot closest to `date` (YYYYMMDD; omit for the latest), via the
 * availability API. No key needed.
 *
 * @param {string} url
 * @param {string} [date]
 * @param {typeof fetch} [f]
 * @returns {Promise<string | null>}
 */
export async function findSnapshot(url, date = "", f = fetch) {
  const query = new URLSearchParams({ url });
  if (date) query.set("timestamp", date);
  const data = await fetchJson(f, `${AVAILABLE}?${query}`);
  const closest = data?.archived_snapshots?.closest;
  // Redirect captures (3xx) replay fine; 4xx/5xx captures are error pages.
  if (!closest?.available || !/^[23]/.test(String(closest.status))) {
    return null;
  }
  return String(closest.url).replace(/^http:/, "https:");
}

/**
 * Asks Save Page Now for a capture and waits for it to finish. Needs
 * archive.org S3 API keys (archive.org → account → S3 API keys).
 *
 * @param {string} url
 * @param {Keys} keys
 * @param {{ fetch?: typeof fetch, pollMs?: number, timeoutMs?: number }} [options]
 * @returns {Promise<string | null>} null if it didn't finish in time
 */
export async function capture(url, keys, options = {}) {
  const { fetch: f = fetch, pollMs = 5000, timeoutMs = 3 * 60_000 } = options;
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
  for (let waited = 0; waited < timeoutMs; waited += pollMs) {
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
 * Brings `archives` (mutated in place) up to date with `links` from
 * gatherLinks: prunes entries no longer linked, then looks up each missing
 * link's snapshot and, given `keys`, captures ones that have none.
 *
 * @param {ArchiveMap} archives
 * @param {Map<string, string>} links
 * @param {{
 *   keys?: Keys,
 *   fetch?: typeof fetch,
 *   paceMs?: number,
 *   maxCaptures?: number,
 *   pollMs?: number,
 *   onChange?: (archives: ArchiveMap) => Promise<void>,
 *   log?: (line: string) => void,
 * }} [options] `paceMs` (default 1000) spaces requests to stay under the
 *   rate limit; `maxCaptures` (default 25) caps a run's captures;
 *   `onChange` runs after each addition, so an interrupted run keeps
 *   progress.
 * @returns {Promise<{ added: number, pruned: number, missing: string[] }>}
 */
export async function updateArchives(archives, links, options = {}) {
  const {
    keys,
    fetch: f = fetch,
    paceMs = 1000,
    maxCaptures = 25,
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
  /** @type {string[]} */
  const missing = [];
  for (const [url, date] of links) {
    if (archives[url]) continue;
    try {
      let snapshot = await findSnapshot(url, date, f);
      if (!snapshot && keys && captures < maxCaptures) {
        captures++;
        log(`capturing ${url}`);
        snapshot = await capture(url, keys, { fetch: f, pollMs });
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

/**
 * Stable JSON for committing an archive map: sorted keys, two-space indent,
 * trailing newline (Prettier-compatible).
 *
 * @param {ArchiveMap} archives
 */
export function serializeArchives(archives) {
  const sorted = Object.fromEntries(
    Object.entries(archives).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
