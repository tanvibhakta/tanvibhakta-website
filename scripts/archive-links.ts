import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  gatherLinks,
  serializeArchives,
  SOCIAL_DOMAINS,
  updateArchives,
  type ArchiveMap,
  type AttemptMap,
} from "rehype-wayback/sync";

/**
 * Records a Wayback Machine snapshot for every archivable external link in
 * posts/ in src/data/archive-links.json, which rehype-wayback attaches to links
 * at build time as data-archive attributes. The generic work lives in
 * packages/rehype-wayback; this is the site's wiring: where posts are, how
 * their dates are written, which domains to leave alone, and how hard to try.
 *
 * Failed captures are tracked in src/data/archive-attempts.json, so links
 * that keep failing are retried less often and can't starve the rest. Draft
 * posts are skipped until published. The run exits non-zero, after saving
 * what it got, when archive.org looks down or rejects the keys.
 *
 * Captures need ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY (archive.org
 * → account → S3 API keys); without them only existing snapshots are
 * recorded. The Archive links GitHub Action runs this on content pushes and
 * weekly.
 */

const POSTS_DIR = "posts";
const DATA_FILE = "src/data/archive-links.json";
const ATTEMPTS_FILE = "src/data/archive-attempts.json";
// After this many failed captures, a link is retried once a month instead
// of every run.
const SLOW_AFTER = 5;
const SLOW_INTERVAL_DAYS = 30;
// Stop starting new links after an hour, leaving the workflow step's
// 75-minute timeout as headroom to finish the current one and save.
const RUN_BUDGET_MS = 60 * 60 * 1000;
// More than this share of requests failing outright means an outage, not a
// run of links without snapshots.
const MAX_ERROR_RATE = 0.5;

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

/**
 * Splits off YAML frontmatter, returning the body, a YYYYMMDD date, and
 * whether the post is a draft.
 */
export function parsePost(text: string): {
  markdown: string;
  date?: string;
  draft?: boolean;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { markdown: text };
  const date = /^(?:publishedOn|lastUpdatedOn):\s*['"]?(\d{4})-(\d{2})-(\d{2})/m
    .exec(match[1])
    ?.slice(1)
    .join("");
  const draft = /^draft:\s*true\s*$/m.test(match[1]);
  return {
    markdown: text.slice(match[0].length),
    date,
    ...(draft && { draft }),
  };
}

/** Published posts only: a draft's links wait until it goes live. */
async function readPosts(dir: string) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const posts = await Promise.all(
    entries
      .filter((e) => e.isFile() && /\.mdx?$/.test(e.name))
      .map(async (e) =>
        parsePost(await readFile(join(e.parentPath, e.name), "utf8")),
      ),
  );
  return posts.filter((post) => !post.draft);
}

/**
 * Why a run should fail, or null. Links without snapshots are normal; most
 * requests failing outright, or rejected keys, are not.
 */
export function outage(result: {
  requests: number;
  requestErrors: number;
  authFailed: boolean;
}): string | null {
  if (result.authFailed) {
    return "archive.org rejected the request (401/403): check ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY.";
  }
  if (
    result.requests > 0 &&
    result.requestErrors / result.requests > MAX_ERROR_RATE
  ) {
    return `${result.requestErrors} of ${result.requests} requests to archive.org failed: it may be down or blocking this runner.`;
  }
  return null;
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
    const attempts: AttemptMap = JSON.parse(
      await readFile(ATTEMPTS_FILE, "utf8"),
    );
    const links = gatherLinks(await readPosts(POSTS_DIR), { exclude: EXCLUDE });
    const save = async () => {
      await writeFile(DATA_FILE, serializeArchives(archives));
      await writeFile(ATTEMPTS_FILE, serializeArchives(attempts));
    };
    const result = await updateArchives(archives, links, {
      attempts,
      keys,
      slowAfter: SLOW_AFTER,
      slowIntervalDays: SLOW_INTERVAL_DAYS,
      deadline: Date.now() + RUN_BUDGET_MS,
      onChange: save,
      log: (line) => console.log(line),
    });
    await save();
    console.log(
      `\n${Object.keys(archives).length} archived, ${result.added} new, ${result.pruned} pruned, ${result.missing.length} without a snapshot yet, ${result.deferred.length} left for the next run.` +
        `\n${result.requests} requests, ${result.requestErrors} failed; ${Object.keys(attempts).length} links with failed captures (see ${ATTEMPTS_FILE}).`,
    );
    const failure = outage(result);
    if (failure) {
      console.error(`\n${failure}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
