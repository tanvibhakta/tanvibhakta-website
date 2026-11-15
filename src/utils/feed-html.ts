import sanitizeHtml from "sanitize-html";

// From image.breakpoints in astro.config.mjs, so the feed reuses a derivative
// the site already generates instead of adding one.
const FEED_IMAGE_WIDTH = 1280;

/**
 * The image URL a feed should use: the srcset candidate closest to
 * FEED_IMAGE_WIDTH without going over, else the plain src. Astro's responsive
 * images put the full-size original in src (3000px for some photos), which
 * is far more than a feed reader's column needs.
 */
export function feedImageSrc(
  src: string | undefined,
  srcset: string | undefined,
): string | undefined {
  let best: { url: string; width: number } | undefined;
  for (const candidate of (srcset ?? "").split(",")) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    const width = Number(descriptor?.match(/^(\d+)w$/)?.[1]);
    if (!url || !width || width > FEED_IMAGE_WIDTH) continue;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url ?? src;
}

/** Resolve a URL against the item's page; leave unparseable values alone. */
function absolute(url: string, base: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

// Site-only chrome the rehype plugins add, which means nothing outside the
// site's CSS and JS: the " #" permalinks from rehype-anchors and
// rehype-autolink-headings (both `.anchor-link`), and rehype-external-links'
// visually-hidden "(opens in a new tab)" — readers have no sr-only rule, so
// it would show as plain text. The external-link <svg> is outside the tag
// allowlist, so sanitize-html drops it on its own.
function isSiteChrome(frame: sanitizeHtml.IFrame): boolean {
  const cls = frame.attribs.class ?? "";
  return (
    (frame.tag === "a" && /\banchor-link\b/.test(cls)) ||
    (frame.tag === "span" && /\bsr-only\b/.test(cls))
  );
}

/**
 * Turn an entry's rendered page HTML into feed-safe HTML: sanitized,
 * site-only chrome removed, and every link and image made absolute against
 * the item's own URL. Feed readers resolve relative URLs inconsistently (the
 * W3C validator warns on them), so a fragment like "#user-content-fn-1"
 * becomes "<itemUrl>#user-content-fn-1" — the footnote on the site.
 */
export function toFeedHtml(html: string, itemUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      // No width/height: they're the original's dimensions (e.g. 2250×3000)
      // and would size the image wrong in readers that honor them.
      img: ["src", "alt", "title"],
    },
    // Keep just the marker classes so isSiteChrome can see them; anything
    // that survives the filter carries no class (all others are stripped).
    allowedClasses: { a: ["anchor-link"], span: ["sr-only"] },
    exclusiveFilter: isSiteChrome,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: attribs.href
          ? { ...attribs, href: absolute(attribs.href, itemUrl) }
          : attribs,
      }),
      img: (tagName, attribs) => {
        const src = feedImageSrc(attribs.src, attribs.srcset);
        // Renaming to a non-allowlisted tag makes sanitize-html discard the
        // element: an img with no source has nothing to show.
        if (!src) return { tagName: "dropped-img", attribs: {} };
        return {
          tagName,
          attribs: { ...attribs, src: absolute(src, itemUrl) },
        };
      },
    },
  });
}
