import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  gatherLinks,
  serializeArchives,
  SOCIAL_DOMAINS,
  updateArchives,
  type ArchiveMap,
  type AttemptMap,
  type RequestInfo,
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
 * posts are skipped until published. Both files are saved after every
 * change, crash-safely, so a run stopped partway keeps its progress.
 *
 * Captures need ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY (archive.org
 * → account → S3 API keys). Locally, without them, only existing snapshots
 * are recorded; in GitHub Actions their absence fails the run up front. The
 * run also exits non-zero, after saving, when archive.org rejects the keys.
 * Other failed requests are warnings (GitHub annotations in Actions). The
 * Archive links GitHub Action runs this on content pushes and weekly.
 *
 * Every run ends with a timing summary of its requests to archive.org.
 * Flags: --sample N (a random N links; never prunes), --max-captures N,
 * --request-timeout-ms N.
 */

const POSTS_DIR = "posts";
const DATA_FILE = "src/data/archive-links.json";
const ATTEMPTS_FILE = "src/data/archive-attempts.json";
// After this many failed captures, a link is retried once a month instead
// of every run.
const SLOW_AFTER = 5;
const SLOW_INTERVAL_DAYS = 30;
const IN_ACTIONS = process.env.GITHUB_ACTIONS === "true";

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

export type Flags = {
  sample?: number;
  maxCaptures?: number;
  requestTimeoutMs?: number;
};

/** Parses the CLI flags (see the header comment); throws on bad input. */
export function parseFlags(args: string[]): Flags {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      sample: { type: "string" },
      "max-captures": { type: "string" },
      "request-timeout-ms": { type: "string" },
    },
  });
  const count = (name: string, value: string | undefined) => {
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`--${name} needs a whole number, got "${value}"`);
    }
    return n;
  };
  return {
    sample: count("sample", values.sample),
    maxCaptures: count("max-captures", values["max-captures"]),
    requestTimeoutMs: count("request-timeout-ms", values["request-timeout-ms"]),
  };
}

/** A random `n` of `links` (all of them when `n` is at least their count). */
export function sampleLinks<K, V>(
  links: Map<K, V>,
  n: number,
  random: () => number = Math.random,
): Map<K, V> {
  const entries = [...links];
  // Partial Fisher–Yates: the first n slots end up a uniform sample.
  for (let i = 0; i < Math.min(n, entries.length); i++) {
    const j = i + Math.floor(random() * (entries.length - i));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return new Map(entries.slice(0, n));
}

export type TimingSummary = {
  count: number;
  /** Seconds. */
  median: number;
  p90: number;
  max: number;
  over10s: number;
  over30s: number;
  over60s: number;
  errors: number;
};

/**
 * Per request kind: how long archive.org took. An error is a request with
 * no response, an HTTP error status, or a failed capture.
 */
export function summarizeTimings(
  infos: RequestInfo[],
): Record<string, TimingSummary> {
  const byKind = new Map<string, RequestInfo[]>();
  for (const info of infos) {
    byKind.set(info.kind, [...(byKind.get(info.kind) ?? []), info]);
  }
  return Object.fromEntries(
    [...byKind].map(([kind, list]) => {
      const secs = list.map((i) => i.ms / 1000).sort((a, b) => a - b);
      const mid = Math.floor(secs.length / 2);
      const median =
        secs.length % 2 ? secs[mid] : (secs[mid - 1] + secs[mid]) / 2;
      // Nearest-rank percentile.
      const p90 = secs[Math.ceil(0.9 * secs.length) - 1];
      const over = (limit: number) => secs.filter((s) => s > limit).length;
      return [
        kind,
        {
          count: secs.length,
          median,
          p90,
          max: secs[secs.length - 1],
          over10s: over(10),
          over30s: over(30),
          over60s: over(60),
          errors: list.filter(
            (i) => i.error !== undefined || (i.status ?? 0) >= 400,
          ).length,
        },
      ];
    }),
  );
}

/**
 * Why a run should fail, or null. Only key problems fail it: links without
 * snapshots are normal, and other failed requests are warnings.
 */
export function outage(result: { authFailed: boolean }): string | null {
  return result.authFailed
    ? "archive.org rejected the request (401/403): check ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY."
    : null;
}

/** Why a run can't start, or null: GitHub Actions must have the keys. */
export function missingKeys(env: NodeJS.ProcessEnv): string | null {
  if (env.GITHUB_ACTIONS !== "true") return null;
  return env.ARCHIVE_ORG_ACCESS_KEY && env.ARCHIVE_ORG_SECRET_KEY
    ? null
    : "ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY aren't set: add them as repository secrets.";
}

/**
 * Writes `text` to a temp file beside `path`, then renames it over `path`,
 * so a run stopped mid-write leaves the old file whole, never a truncated
 * one.
 */
export async function writeAtomic(path: string, text: string) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  await writeFile(temp, text);
  await rename(temp, path);
}

// CLI entry, guarded because this module is imported by its test.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const flags = parseFlags(process.argv.slice(2));
    const noKeys = missingKeys(process.env);
    if (noKeys) {
      console.error(noKeys);
      process.exit(1);
    }
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
    const all = gatherLinks(await readPosts(POSTS_DIR), { exclude: EXCLUDE });
    const links =
      flags.sample === undefined ? all : sampleLinks(all, flags.sample);
    if (flags.sample !== undefined) {
      console.log(`Sampling ${links.size} of ${all.size} links; no pruning.`);
    }
    const save = async () => {
      await writeAtomic(DATA_FILE, serializeArchives(archives));
      await writeAtomic(ATTEMPTS_FILE, serializeArchives(attempts));
    };
    const timings: RequestInfo[] = [];
    const result = await updateArchives(archives, links, {
      attempts,
      keys,
      slowAfter: SLOW_AFTER,
      slowIntervalDays: SLOW_INTERVAL_DAYS,
      // A sample isn't the whole set: pruning against it would drop the rest.
      prune: flags.sample === undefined,
      ...(flags.maxCaptures !== undefined && {
        maxCaptures: flags.maxCaptures,
      }),
      ...(flags.requestTimeoutMs !== undefined && {
        requestTimeoutMs: flags.requestTimeoutMs,
      }),
      onRequest: (info) => timings.push(info),
      onChange: save,
      log: (line) => console.log(line),
      // In Actions, a warning annotation on the run's summary page.
      warn: (url, reason) =>
        console.log(
          IN_ACTIONS ? `::warning::${url}: ${reason}` : `✗ ${url}: ${reason}`,
        ),
    });
    await save();
    console.log(
      `\n${Object.keys(archives).length} archived, ${result.added} new, ${result.pruned} pruned, ${result.missing.length} without a snapshot yet.` +
        `\n${result.requests} requests, ${result.requestErrors} failed; ${Object.keys(attempts).length} links with failed captures (see ${ATTEMPTS_FILE}).`,
    );
    const summary = summarizeTimings(timings);
    if (Object.keys(summary).length > 0) {
      const s = (n: number) => `${n.toFixed(1)}s`;
      console.log("\nRequest timings:");
      console.table(
        Object.fromEntries(
          Object.entries(summary).map(([kind, t]) => [
            kind,
            {
              count: t.count,
              median: s(t.median),
              p90: s(t.p90),
              max: s(t.max),
              ">10s": t.over10s,
              ">30s": t.over30s,
              ">60s": t.over60s,
              errors: t.errors,
            },
          ]),
        ),
      );
    }
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
