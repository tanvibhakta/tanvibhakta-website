import sanitizeHtml from "sanitize-html";

/**
 * Match an entry's colocated images out of the full image glob.
 *
 * entryFilePath is entry.filePath from the glob loader, e.g.
 * "posts/blog/2026-09-07-my-post.md" (root-relative POSIX). globKeys are
 * site-root paths like "/posts/blog/images/foo.webp". Returns a map of the
 * entry's relative reference ("images/foo.webp") to its glob key. The
 * trailing "images/" in the prefix keeps a sibling directory that merely
 * shares a name prefix ("posts/blog-extra/") from matching "posts/blog/".
 */
export function matchEntryImages(
  entryFilePath: string | undefined,
  globKeys: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  if (!entryFilePath) return map;
  const dir = entryFilePath.replace(/[^/]+$/, "");
  const prefix = `/${dir}images/`;
  for (const key of globKeys) {
    if (!key.startsWith(prefix)) continue;
    map.set(key.slice(dir.length + 1), key);
  }
  return map;
}

/** Rewrite relative img srcs through the map; drop unresolvable ones. */
export function absolutizeImages(
  html: string,
  map: Map<string, string>,
): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        if (/^(https?:)?\/\//.test(src) || src.startsWith("/")) {
          return { tagName, attribs };
        }
        // "./images/foo.webp" and "images/foo.webp" are the same reference;
        // the map is keyed on the bare form.
        const resolved = map.get(src.replace(/^\.\//, ""));
        // Renaming to a non-allowlisted tag makes sanitize-html discard
        // the element — that alone is the drop mechanism (an
        // exclusiveFilter would never even fire for a discarded tag).
        return resolved
          ? { tagName, attribs: { ...attribs, src: resolved } }
          : { tagName: "dropped-img", attribs: {} };
      },
    },
  });
}
