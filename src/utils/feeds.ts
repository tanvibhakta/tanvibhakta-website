import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { collections } from "../content.config";
import { getEntryPath, isPublished } from "./collections";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from "./site";

const FEED_LIMIT = 25;
const markdownParser = new MarkdownIt();

/**
 * Convert markdown to sanitized HTML for RSS feed content
 */
function markdownToHtml(markdown: string): string {
  const html = markdownParser.render(markdown);
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  });
}

/**
 * Configuration for RSS/Atom feed generation
 */
export const FEED_CONFIG = {
  // Collections to exclude from feed generation entirely
  excludedCollections: ["pages"] as string[],
  // Collections to exclude from the main unified feed (but still get individual feeds)
  excludeFromMainFeed: ["notes"] as string[],
};

type CollectionName = keyof typeof collections;
type AnyCollectionEntry = CollectionEntry<CollectionName>;

export function isCollectionExcluded(collectionName: string): boolean {
  return FEED_CONFIG.excludedCollections.includes(collectionName);
}

export function isCollectionExcludedFromMainFeed(
  collectionName: string,
): boolean {
  return FEED_CONFIG.excludeFromMainFeed.includes(collectionName);
}

export function getEligibleCollections(): CollectionName[] {
  return (Object.keys(collections) as CollectionName[]).filter(
    (name) => !isCollectionExcluded(name),
  );
}

export function getMainFeedEligibleCollections(): CollectionName[] {
  return (Object.keys(collections) as CollectionName[]).filter(
    (name) =>
      !isCollectionExcluded(name) && !isCollectionExcludedFromMainFeed(name),
  );
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Derive a feed item title. Most collections have an explicit `title`.
 * Title-less collections (e.g. notes) fall back to the first non-empty line
 * of the body, truncated, and finally to the formatted publish date.
 */
function feedItemTitle(entry: AnyCollectionEntry): string {
  const data = entry.data as { title?: string; publishedOn: Date };
  if (data.title) return data.title;

  const firstLine =
    entry.body
      ?.split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const stripped = firstLine.replace(/^[#>\-*\s]+/, "").trim();
  if (stripped) {
    return stripped.length > 60 ? `${stripped.slice(0, 59)}…` : stripped;
  }

  return data.publishedOn.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function getAllCollectionEntries(): Promise<AnyCollectionEntry[]> {
  const allEntries: AnyCollectionEntry[] = [];

  for (const collectionName of getMainFeedEligibleCollections()) {
    const entries = await getCollection(collectionName, isPublished);
    allEntries.push(...entries);
  }

  return allEntries;
}

export async function getCollectionEntries(
  collectionName: CollectionName,
): Promise<CollectionEntry<CollectionName>[]> {
  return getCollection(collectionName, isPublished);
}

export async function generateMainFeed() {
  const allEntries = await getAllCollectionEntries();

  // Sort by date and limit
  const sortedEntries = allEntries
    .sort(
      (a, b) =>
        new Date(b.data.publishedOn).getTime() -
        new Date(a.data.publishedOn).getTime(),
    )
    .slice(0, FEED_LIMIT);

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: SITE_URL,
    items: sortedEntries.map((entry) => ({
      title: `[${capitalizeFirst(entry.collection)}] ${feedItemTitle(entry)}`,
      pubDate: entry.data.publishedOn,
      link: `${getEntryPath(entry.collection, entry.id)}/`,
      content: markdownToHtml(entry.body),
    })),
  });
}

export async function generateCollectionFeed(collectionName: CollectionName) {
  const entries = await getCollectionEntries(collectionName);

  // Sort by date and limit
  const sortedEntries = entries
    .sort(
      (a, b) =>
        new Date(b.data.publishedOn).getTime() -
        new Date(a.data.publishedOn).getTime(),
    )
    .slice(0, FEED_LIMIT);

  return rss({
    title: `${SITE_TITLE} - ${capitalizeFirst(collectionName)}`,
    description: `${capitalizeFirst(collectionName)} posts from ${SITE_TITLE}`,
    site: SITE_URL,
    items: sortedEntries.map((entry) => ({
      title: feedItemTitle(entry),
      pubDate: entry.data.publishedOn,
      link: `${getEntryPath(entry.collection, entry.id)}/`,
      content: markdownToHtml(entry.body),
    })),
  });
}
