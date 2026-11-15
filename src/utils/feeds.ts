import rss from "@astrojs/rss";
import { experimental_AstroContainer } from "astro/container";
import mdxRenderer from "@astrojs/mdx/server.js";
import { getCollection, render, type CollectionEntry } from "astro:content";
import { collections } from "../content.config";
import {
  getEntryPath,
  isPublished,
  newestFirst,
  type CollectionName,
} from "./collections";
import { formatLongDate, noteWallClockToInstant } from "./date-helpers";
import { toFeedHtml } from "./feed-html";
import { getNoteSlugs } from "./notes";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from "./site";
import { titleText } from "./title-markdown";

const FEED_LIMIT = 25;

// Single source of truth for which collections never get feeds. The
// FeedCollectionName type is derived from this list, so adding a collection
// here automatically removes it from the type as well.
const EXCLUDED_COLLECTIONS = [
  "pages",
] as const satisfies readonly CollectionName[];

/**
 * Configuration for RSS/Atom feed generation
 */
export const FEED_CONFIG = {
  // Collections to exclude from feed generation entirely
  excludedCollections: [...EXCLUDED_COLLECTIONS] as string[],
  // Collections to exclude from the main unified feed (but still get individual feeds)
  excludeFromMainFeed: ["notes"] as string[],
};

// Collections that can appear in feeds — everything except EXCLUDED_COLLECTIONS,
// so entry.data is known to carry publishedOn.
export type FeedCollectionName = Exclude<
  CollectionName,
  (typeof EXCLUDED_COLLECTIONS)[number]
>;
type FeedEntry = CollectionEntry<FeedCollectionName>;

export function isCollectionExcluded(collectionName: string): boolean {
  return FEED_CONFIG.excludedCollections.includes(collectionName);
}

export function isCollectionExcludedFromMainFeed(
  collectionName: string,
): boolean {
  return FEED_CONFIG.excludeFromMainFeed.includes(collectionName);
}

export function getEligibleCollections(): FeedCollectionName[] {
  return (Object.keys(collections) as CollectionName[]).filter(
    (name): name is FeedCollectionName => !isCollectionExcluded(name),
  );
}

export function getMainFeedEligibleCollections(): FeedCollectionName[] {
  return (Object.keys(collections) as CollectionName[]).filter(
    (name): name is FeedCollectionName =>
      !isCollectionExcluded(name) && !isCollectionExcludedFromMainFeed(name),
  );
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * The title for a feed item. Titled collections use their `title`; the
 * title-less `notes` collection falls back to its formatted publish date —
 * the same string shown as the note's heading on the site.
 */
function feedItemTitle(entry: FeedEntry): string {
  return "title" in entry.data
    ? titleText(entry.data.title)
    : formatLongDate(entry.data.publishedOn);
}

/**
 * The pubDate for a feed item. Notes store naive IST wall-clock timestamps
 * (see formatNoteTimestamp), but RSS pubDate claims UTC — convert to the
 * true instant so feed readers show the actual publish time.
 */
function feedPubDate(entry: FeedEntry): Date {
  return entry.collection === "notes"
    ? noteWallClockToInstant(entry.data.publishedOn)
    : entry.data.publishedOn;
}

/**
 * The line a reply's feed item opens with, linking its parent note. Empty
 * when the parent is missing (deleted), which the site shows as a
 * placeholder instead.
 */
export function noteReplyPrefix(parentSlug: string | undefined): string {
  if (!parentSlug) return "";
  const href = new URL(`/${parentSlug}/`, SITE_URL).href;
  return `<p>↳ replying to <a href="${href}">${parentSlug}</a></p>`;
}

// One container for the whole build, created on first use. MDX content is a
// JSX component, so the container needs MDX's server renderer; plain
// markdown renders as an Astro component and needs none.
let container: Promise<experimental_AstroContainer> | undefined;
function feedContainer(): Promise<experimental_AstroContainer> {
  container ??= experimental_AstroContainer.create().then((c) => {
    c.addServerRenderer({ name: "astro:jsx", renderer: mdxRenderer });
    return c;
  });
  return container;
}

/**
 * The HTML body for a feed item: the entry rendered exactly as its page
 * renders it — Astro's full remark/rehype pipeline, MDX components and
 * optimized images included — then made feed-safe by toFeedHtml.
 *
 * Why the Container API (experimental) rather than entry.rendered.html: MDX
 * entries have no rendered.html (MDX compiles to a component, rendered only
 * at page time), and for markdown that field leaves local images as
 * unresolved __ASTRO_IMAGE_ placeholders. Rendering <Content /> handles both
 * formats in one path.
 */
async function feedItemContent(
  entry: FeedEntry,
  link: string,
): Promise<string> {
  const { Content } = await render(entry);
  const html = await (await feedContainer()).renderToString(Content);
  return toFeedHtml(html, new URL(link, SITE_URL).href);
}

/**
 * RSS readers and validators expect a feed to name its own URL
 * (atom:link rel="self"); @astrojs/rss doesn't add it on its own.
 */
function selfLink(path: string) {
  return {
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<atom:link href="${new URL(path, SITE_URL).href}" rel="self" type="application/rss+xml"/>`,
  };
}

export async function getAllCollectionEntries(): Promise<FeedEntry[]> {
  const allEntries: FeedEntry[] = [];

  for (const collectionName of getMainFeedEligibleCollections()) {
    const entries = await getCollection(collectionName, isPublished);
    allEntries.push(...entries);
  }

  return allEntries;
}

export async function getCollectionEntries(
  collectionName: FeedCollectionName,
): Promise<FeedEntry[]> {
  return getCollection(collectionName, isPublished);
}

export async function generateMainFeed() {
  const allEntries = await getAllCollectionEntries();

  // Sort by date and limit
  const sortedEntries = allEntries.sort(newestFirst).slice(0, FEED_LIMIT);

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: SITE_URL,
    ...selfLink("/feed.xml"),
    items: await Promise.all(
      sortedEntries.map(async (entry) => {
        const link = `${getEntryPath(entry.collection, entry.id)}/`;
        return {
          title: `[${capitalizeFirst(entry.collection)}] ${feedItemTitle(entry)}`,
          pubDate: feedPubDate(entry),
          link,
          content: await feedItemContent(entry, link),
        };
      }),
    ),
  });
}

export async function generateCollectionFeed(
  collectionName: FeedCollectionName,
) {
  const entries = await getCollectionEntries(collectionName);

  // Notes are permalinked by day slug at the root, not by filename id.
  const noteSlugs = collectionName === "notes" ? await getNoteSlugs() : null;

  // Sort by date and limit
  const sortedEntries = entries.sort(newestFirst).slice(0, FEED_LIMIT);

  return rss({
    title: `${SITE_TITLE} - ${capitalizeFirst(collectionName)}`,
    description: `${capitalizeFirst(collectionName)} posts from ${SITE_TITLE}`,
    site: SITE_URL,
    ...selfLink(`/${collectionName}/feed.xml`),
    items: await Promise.all(
      sortedEntries.map(async (entry) => {
        const link = noteSlugs
          ? `/${noteSlugs.get(entry.id)}/`
          : `${getEntryPath(entry.collection, entry.id)}/`;
        return {
          title: feedItemTitle(entry),
          pubDate: feedPubDate(entry),
          link,
          content:
            (noteSlugs && "inReplyTo" in entry.data && entry.data.inReplyTo
              ? noteReplyPrefix(noteSlugs.get(entry.data.inReplyTo))
              : "") + (await feedItemContent(entry, link)),
        };
      }),
    ),
  });
}
