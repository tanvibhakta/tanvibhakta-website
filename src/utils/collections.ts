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
export async function getPublishedEntries<C extends CollectionName>(
  collectionName: C,
) {
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

/**
 * All tags in use across published posts, sorted. Tags are free-form (typed
 * directly on posts in the CMS), so the posts themselves are the source of
 * truth for which tags exist.
 */
export async function getAllTags(): Promise<string[]> {
  const posts = [
    ...(await getPublishedEntries("blog")),
    ...(await getPublishedEntries("weeknotes")),
    ...(await getPublishedEntries("poetry")),
    ...(await getPublishedEntries("digitalGarden")),
  ];
  return [...new Set(posts.flatMap((p) => p.data.tags ?? []))].sort();
}
