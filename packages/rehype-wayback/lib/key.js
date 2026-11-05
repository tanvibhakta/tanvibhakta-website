/**
 * The key a link is recorded under in an archive map, so
 * `https://Example.com/a#b` and `https://example.com/a` share one snapshot:
 * the Wayback Machine ignores fragments, and URL parsing lowercases the host.
 *
 * @param {string} href
 * @returns {string | null} null for anything but an absolute http(s) URL
 */
export function archiveKey(href) {
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
