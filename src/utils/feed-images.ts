import sanitizeHtml from "sanitize-html";

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
        const resolved = map.get(src);
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
