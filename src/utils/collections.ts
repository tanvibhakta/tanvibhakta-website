import { getCollection } from "astro:content";
import type { collections } from "../content.config";

type CollectionName = keyof typeof collections;

/**
 * Filter predicate that excludes draft entries.
 * Use with getCollection's built-in filter: getCollection("blog", isPublished)
 */
export const isPublished = ({ data }: { data: { draft?: boolean } }) =>
  !data.draft;

/**
 * Get all published (non-draft) entries from a collection.
 */
export async function getPublishedEntries(collectionName: CollectionName) {
  return getCollection(collectionName, isPublished);
}

/**
 * Get all draft entries from a collection. Used by the /drafts/ routes,
 * which build hidden-but-linkable review pages.
 */
export async function getDraftEntries(collectionName: CollectionName) {
  return getCollection(collectionName, ({ data }) => Boolean(data.draft));
}
