/**
 * Finds (and, with archive.org keys, creates) Wayback Machine snapshots for
 * the links in a set of markdown documents, keeping them in a
 * `{ url: snapshotUrl }` map for a site to render archive links from. Run it
 * from a script or CI job, not during a build:
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
 * used reference links, `<autolinks>` and GFM bare URLs. Images, and
 * reference definitions nothing refers to, are excluded: neither renders as
 * a link.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function collectLinks(markdown) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  /** @type {Map<string, string>} */
  const definitions = new Map();
  /** @type {string[]} */
  const used = [];
  /** @type {string[]} */
  const urls = [];
  visit(tree, (node) => {
    if (node.type === "link") urls.push(node.url);
    else if (node.type === "linkReference") used.push(node.identifier);
    // As in markdown, the first definition of an identifier wins.
    else if (node.type === "definition" && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url);
    }
  });
  for (const identifier of used) {
    const url = definitions.get(identifier);
    if (url !== undefined) urls.push(url);
  }
  return urls.filter((url) => /^https?:\/\//i.test(url));
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
 * A request to archive.org that failed outright: a network error, a timeout,
 * or an HTTP error status (`status` undefined for the first two). Distinct
 * from a request that worked but found no snapshot.
 */
export class RequestError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

/**
 * Request counters, shared across calls so a run can tell an outage from
 * links that simply have no snapshot.
 *
 * @typedef {{ requests: number, requestErrors: number, authFailed: boolean }} Stats
 */

/**
 * @typedef {object} RequestOptions
 * @property {typeof fetch} [fetch]
 * @property {number} [requestTimeoutMs] abort a request after this long,
 *   default 30000
 * @property {number} [retryAfterMs] wait before the one retry of a
 *   rate-limited (429) request, default 60000
 * @property {Stats} [stats] counters to update
 */

/** @returns {Stats} */
const newStats = () => ({ requests: 0, requestErrors: 0, authFailed: false });

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {RequestOptions} [options]
 */
async function fetchJson(url, init = {}, options = {}) {
  const {
    fetch: f = fetch,
    requestTimeoutMs = 30_000,
    retryAfterMs = 60_000,
    stats = newStats(),
  } = options;
  const attempt = () =>
    f(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
  stats.requests++;
  try {
    let res = await attempt();
    if (res.status === 429) {
      // Rate limited: back off once, then let the caller skip this link.
      await sleep(retryAfterMs);
      res = await attempt();
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) stats.authFailed = true;
      throw new RequestError(`${res.status} from ${url}`, res.status);
    }
    return await res.json();
  } catch (error) {
    stats.requestErrors++;
    if (error instanceof RequestError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new RequestError(`${message} (${url})`);
  }
}

/**
 * The snapshot closest to `date` (YYYYMMDD; omit for the latest), via the
 * availability API. No key needed.
 *
 * @param {string} url
 * @param {string} [date]
 * @param {RequestOptions} [options]
 * @returns {Promise<string | null>}
 */
export async function findSnapshot(url, date = "", options = {}) {
  const query = new URLSearchParams({ url });
  if (date) query.set("timestamp", date);
  const data = await fetchJson(`${AVAILABLE}?${query}`, {}, options);
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
 * @param {RequestOptions & { pollMs?: number, timeoutMs?: number }} [options]
 * @returns {Promise<string | null>} null if it didn't finish in time
 * @throws {RequestError} when a request fails; a plain Error when Save Page
 *   Now refuses the capture
 */
export async function capture(url, keys, options = {}) {
  const { pollMs = 5000, timeoutMs = 3 * 60_000 } = options;
  const headers = {
    Accept: "application/json",
    Authorization: `LOW ${keys.access}:${keys.secret}`,
  };
  const job = await fetchJson(
    SAVE,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ url, skip_first_archive: "1" }),
    },
    options,
  );
  if (!job?.job_id) {
    throw new Error(job?.message ?? `no capture job for ${url}`);
  }
  for (let waited = 0; waited < timeoutMs; waited += pollMs) {
    await sleep(pollMs);
    const status = await fetchJson(
      `${SAVE}/status/${job.job_id}`,
      { headers },
      options,
    );
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
 * Failed capture attempts for one link, kept so a run tries never-attempted
 * links first and links that keep failing less often. ISO 8601 dates.
 *
 * @typedef {{
 *   failures: number,
 *   firstFailed: string,
 *   lastTried: string,
 *   lastError: string,
 * }} Attempt
 * @typedef {Record<string, Attempt>} AttemptMap
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Brings `archives` and `attempts` (both mutated in place) up to date with
 * `links` from gatherLinks: prunes entries no longer linked, then looks up
 * each missing link's snapshot and, given `keys`, captures ones that have
 * none.
 *
 * Missing links are visited never-attempted first, then least recently
 * tried, so links that always fail can't use up every run's captures. A link
 * that has failed `slowAfter` times is captured at most once per
 * `slowIntervalDays`; its lookup still runs every time.
 *
 * @param {ArchiveMap} archives
 * @param {Map<string, string>} links
 * @param {RequestOptions & {
 *   attempts?: AttemptMap,
 *   keys?: Keys,
 *   paceMs?: number,
 *   maxCaptures?: number,
 *   slowAfter?: number,
 *   slowIntervalDays?: number,
 *   pollMs?: number,
 *   captureTimeoutMs?: number,
 *   deadline?: number,
 *   now?: () => number,
 *   onChange?: (archives: ArchiveMap, attempts: AttemptMap) => Promise<void>,
 *   log?: (line: string) => void,
 * }} [options] `paceMs` (default 1000) spaces links to stay under the rate
 *   limit; `maxCaptures` (default 25) caps a run's capture attempts;
 *   `slowAfter` defaults to 5 and `slowIntervalDays` to 30; no link is
 *   started after `deadline` (epoch ms); `onChange` runs after every change
 *   to either map, so an interrupted run keeps its progress.
 * @returns {Promise<{
 *   added: number,
 *   pruned: number,
 *   missing: string[],
 *   deferred: string[],
 *   requests: number,
 *   requestErrors: number,
 *   authFailed: boolean,
 * }>} `missing`: links visited without getting a snapshot; `deferred`: links
 *   not visited because the deadline passed; the request counters tell an
 *   outage (many errors, or rejected keys) from ordinary misses.
 */
export async function updateArchives(archives, links, options = {}) {
  const {
    attempts = {},
    keys,
    paceMs = 1000,
    maxCaptures = 25,
    slowAfter = 5,
    slowIntervalDays = 30,
    pollMs,
    captureTimeoutMs,
    deadline = Infinity,
    now = Date.now,
    onChange = async () => {},
    log = () => {},
  } = options;
  const stats = newStats();
  /** @type {RequestOptions} */
  const request = { ...options, stats };

  let pruned = 0;
  for (const key of Object.keys(archives)) {
    if (!links.has(key)) {
      delete archives[key];
      pruned++;
    }
  }
  for (const key of Object.keys(attempts)) {
    if (!links.has(key) || archives[key]) delete attempts[key];
  }

  // Never-attempted first (in link order: sort is stable), then least
  // recently tried.
  const queue = [...links].filter(([url]) => !archives[url]);
  const lastTried = (/** @type {string} */ url) =>
    attempts[url] ? Date.parse(attempts[url].lastTried) : 0;
  queue.sort(([a], [b]) => lastTried(a) - lastTried(b));

  let added = 0;
  let captures = 0;
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const deferred = [];
  for (const [i, [url, date]] of queue.entries()) {
    if (now() >= deadline) {
      deferred.push(...queue.slice(i).map(([u]) => u));
      log(`deadline reached; ${deferred.length} links left for the next run`);
      break;
    }
    try {
      let snapshot = await findSnapshot(url, date, request);
      const attempt = attempts[url];
      const resting =
        attempt &&
        attempt.failures >= slowAfter &&
        now() - Date.parse(attempt.lastTried) < slowIntervalDays * DAY_MS;
      if (!snapshot && keys && captures < maxCaptures && !resting) {
        captures++;
        log(`capturing ${url}`);
        try {
          snapshot = await capture(url, keys, {
            ...request,
            pollMs,
            timeoutMs: captureTimeoutMs,
          });
          if (!snapshot) throw new Error("capture timed out");
        } catch (error) {
          const at = new Date(now()).toISOString();
          attempts[url] = {
            failures: (attempt?.failures ?? 0) + 1,
            firstFailed: attempt?.firstFailed ?? at,
            lastTried: at,
            lastError: error instanceof Error ? error.message : String(error),
          };
          await onChange(archives, attempts);
          throw error;
        }
      }
      if (snapshot) {
        archives[url] = snapshot;
        delete attempts[url];
        added++;
        log(`✓ ${url}`);
        await onChange(archives, attempts);
      } else {
        missing.push(url);
      }
    } catch (error) {
      log(`✗ ${url}: ${error instanceof Error ? error.message : error}`);
      missing.push(url);
    }
    await sleep(paceMs);
  }
  return { added, pruned, missing, deferred, ...stats };
}

/**
 * Stable JSON for committing an archive or attempts map: sorted keys,
 * two-space indent, trailing newline (Prettier-compatible).
 *
 * @param {ArchiveMap | AttemptMap} archives
 */
export function serializeArchives(archives) {
  const sorted = Object.fromEntries(
    Object.entries(archives).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
