/**
 * rehype plugin: gives each link with a recorded Wayback Machine snapshot a
 * `data-archive` attribute holding the snapshot URL —
 * `<a href="https://example.com/" data-archive="https://web.archive.org/…">`.
 * It adds nothing visible; a site's CSS or scripts decide what, if anything,
 * to show.
 *
 * Snapshots come from a plain `{ url: snapshotUrl }` map (see
 * `rehype-wayback/sync` for building one), so rendering never touches the
 * network. Keys are normalized with `archiveKey`.
 */
import { archiveKey } from "./lib/key.js";

export { archiveKey };

/**
 * @typedef {{
 *   type: string,
 *   tagName?: string,
 *   properties?: Record<string, unknown>,
 *   children?: Node[],
 * }} Node
 */

/** @param {{ archives: Record<string, string> }} options */
export default function rehypeWayback({ archives }) {
  /** @param {Node} node */
  function visit(node) {
    if (node.tagName === "a" && node.properties) {
      const key = archiveKey(String(node.properties.href ?? ""));
      if (key && Object.hasOwn(archives, key)) {
        node.properties.dataArchive = archives[key];
      }
      // Links don't nest, so there's nothing to find inside one.
      return;
    }
    for (const child of node.children ?? []) visit(child);
  }
  return visit;
}
