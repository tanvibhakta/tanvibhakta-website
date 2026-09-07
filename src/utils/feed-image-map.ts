import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import { matchEntryImages } from "./feed-images";
import { SITE_URL } from "./site";

const FEED_IMAGE_WIDTH = 1280; // from image.breakpoints — shares the derivative

// Every colocated content image, keyed by site-root path. The shape
// { default: ImageMetadata } is produced by Astro's asset Vite plugin at
// build; under vitest this module is only ever reached via the
// astro:assets mock in tests/feeds.test.ts. Perf note: this eager glob
// imports every content image at module load — if vitest runs ever get
// slow as the image library grows, convert to lazy glob + await.
const sources = import.meta.glob<{ default: ImageMetadata }>(
  "/posts/**/images/*",
  { eager: true },
);

/**
 * Map of an entry's relative image references ("images/foo.webp") to
 * absolute optimized URLs. entryFilePath is entry.filePath from the glob
 * loader, e.g. "posts/blog/2026-09-07-my-post.md" (root-relative POSIX —
 * verified in Astro's glob loader source). The path matching itself is the
 * pure matchEntryImages (unit-tested in tests/feed-images.test.ts — this
 * module can't be imported under vitest because of astro:assets).
 */
export async function entryImageMap(
  entryFilePath: string | undefined,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const matched = matchEntryImages(entryFilePath, Object.keys(sources));
  for (const [relative, path] of matched) {
    const image = await getImage({
      src: sources[path].default,
      width: FEED_IMAGE_WIDTH,
    });
    map.set(relative, new URL(image.src, SITE_URL).href);
  }
  return map;
}
