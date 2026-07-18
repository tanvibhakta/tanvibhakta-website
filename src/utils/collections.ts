import { getCollection } from "astro:content";
import { COLLECTION_SEGMENTS, type collections } from "../content.config";

export type CollectionName = keyof typeof collections;

/** Site-relative URL for a published entry. */
export function getEntryPath(collectionName: CollectionName, id: string) {
  const segment = COLLECTION_SEGMENTS[collectionName];
  return segment ? `/${segment}/${id}` : `/${id}`;
}

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
 * which build hidden-but-linkable review pages. Defined as the negation of
 * isPublished so the two provably partition every collection.
 */
export async function getDraftEntries(collectionName: CollectionName) {
  return getCollection(collectionName, (entry) => !isPublished(entry));
}
