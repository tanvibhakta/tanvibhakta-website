/**
 * Shared between scripts/archive-links.ts (which finds and records Wayback
 * Machine snapshots for links in posts) and the rehype-external-links plugin
 * (which renders a "[archive]" link next to each recorded one).
 *
 * The recorded map lives in src/data/archive-links.json: normalized URL →
 * snapshot URL.
 */

export type ArchiveMap = Record<string, string>;

/**
 * The key a link is recorded under, so `https://Example.com/a#b` and
 * `https://example.com/a` share one snapshot — the Wayback Machine ignores
 * fragments, and URL parsing lowercases the host. Returns null for anything
 * that isn't an absolute http(s) URL.
 */
export function archiveKey(href: string): string | null {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  return url.href;
}

/**
 * Domains whose links never get archived (subdomains included). Edit freely:
 * entries already in archive-links.json for a newly skipped domain are pruned
 * on the next `pnpm archive`.
 */
export const SKIP_DOMAINS = [
  // Social media.
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
  // Excluded by choice.
  "goodreads.com",
  "spotify.com",
  // Behind a login, or not a page a snapshot can hold.
  "docs.google.com",
  "drive.google.com",
  "maps.app.goo.gl",
  "linear.app",
  "claude.ai",
  "read.readwise.io",
  // Already archives.
  "archive.org",
  "archive.ph",
  "archive.today",
  "archive.is",
];

/**
 * Whether `href` should get an archive link: an absolute http(s) URL that's
 * neither on `siteHost` (bare host, no `www.`) nor on a skipped domain.
 */
export function shouldArchive(href: string, siteHost: string): boolean {
  const key = archiveKey(href);
  if (!key) return false;
  const host = new URL(key).hostname.replace(/^www\./, "");
  if (host === siteHost) return false;
  return !SKIP_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
