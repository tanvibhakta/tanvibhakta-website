import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { collections } from "../content.config";
import {
  getEntryPath,
  isPublished,
  newestFirst,
  type CollectionName,
} from "./collections";
import { formatLongDate, noteWallClockToInstant } from "./date-helpers";
import { getNoteNumbers } from "./notes";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from "./site";

const FEED_LIMIT = 25;
const markdownParser = new MarkdownIt();

/**
 * Convert markdown to sanitized HTML for RSS feed content
 */
function markdownToHtml(markdown: string | undefined): string {
  const html = markdownParser.render(markdown ?? "");
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  });
}

// Single source of truth for which collections never get feeds. The
// FeedCollectionName type is derived from this list, so adding a collection
// here automatically removes it from the type as well.
const EXCLUDED_COLLECTIONS = ["pages"] as const satisfies readonly CollectionName[];

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
    ? entry.data.title
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
    items: sortedEntries.map((entry) => ({
      title: `[${capitalizeFirst(entry.collection)}] ${feedItemTitle(entry)}`,
      pubDate: feedPubDate(entry),
      link: `${getEntryPath(entry.collection, entry.id)}/`,
      content: markdownToHtml(entry.body),
    })),
  });
}

export async function generateCollectionFeed(
  collectionName: FeedCollectionName,
) {
  const entries = await getCollectionEntries(collectionName);

  // Notes are permalinked by number, not by filename id.
  const noteNumbers =
    collectionName === "notes" ? await getNoteNumbers() : null;

  // Sort by date and limit
  const sortedEntries = entries.sort(newestFirst).slice(0, FEED_LIMIT);

  return rss({
    title: `${SITE_TITLE} - ${capitalizeFirst(collectionName)}`,
    description: `${capitalizeFirst(collectionName)} posts from ${SITE_TITLE}`,
    site: SITE_URL,
    items: sortedEntries.map((entry) => ({
      title: feedItemTitle(entry),
      pubDate: feedPubDate(entry),
      link: noteNumbers
        ? `/notes/${noteNumbers.get(entry.id)}/`
        : `${getEntryPath(entry.collection, entry.id)}/`,
      content: markdownToHtml(entry.body),
    })),
  });
}
