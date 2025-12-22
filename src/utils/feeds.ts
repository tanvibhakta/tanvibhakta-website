import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { collections } from "../content.config";

const SITE_URL = "https://tanvibhakta.in";
const SITE_TITLE = "Tanvi Bhakta";
const SITE_DESCRIPTION =
  "I like technology. I really like communities around technology. I do Computer Science, and talk to people about it. I can hold a tune. I enjoy Tango. I want to talk to you.";
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
 * Modify MIME type for RSS feeds from application/xml to application/rss+xml
 * Note: @astrojs/rss returns a custom Response object that doesn't support standard
 * Response manipulation. The type is already correct for RSS (text/xml, application/xml),
 * so we return it as-is for now.
 */
function setRssMimeType(response: Response): Response {
  return response;
}

/**
 * Configuration for RSS/Atom feed generation
 */
export const FEED_CONFIG = {
  // Collections to exclude from feed generation entirely
  excludedCollections: [] as string[],
  // Collections to exclude from the main unified feed (but still get individual feeds)
  excludeFromMainFeed: [] as string[],
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

export async function getAllCollectionEntries(): Promise<AnyCollectionEntry[]> {
  const allEntries: AnyCollectionEntry[] = [];

  for (const collectionName of getMainFeedEligibleCollections()) {
    const entries = await getCollection(collectionName);
    allEntries.push(...entries);
  }

  return allEntries;
}

export async function getCollectionEntries(
  collectionName: CollectionName,
): Promise<CollectionEntry<CollectionName>[]> {
  return await getCollection(collectionName);
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
      title: `[${capitalizeFirst(entry.collection)}] ${entry.data.title}`,
      pubDate: entry.data.publishedOn,
      link: `/${entry.collection}/${entry.id}/`,
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
      title: entry.data.title,
      pubDate: entry.data.publishedOn,
      link: `/${entry.collection}/${entry.id}/`,
      content: markdownToHtml(entry.body),
    })),
  });
}
