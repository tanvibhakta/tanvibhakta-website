import { getCollection } from "astro:content";
import {
  COLLECTION_SEGMENTS,
  SECTIONS,
  type collections,
} from "../content.config";
import { TAGGED_COLLECTIONS } from "./tagged-collections";

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
 * All published posts from the tagged collections (see TAGGED_COLLECTIONS),
 * annotated with their collection's display label and their page href.
 */
export async function getAllTaggedPosts() {
  const perCollection = await Promise.all(
    TAGGED_COLLECTIONS.map(async (name) =>
      (await getPublishedEntries(name)).map((p) => ({
        ...p,
        label: SECTIONS[name].title,
        href: getEntryPath(name, p.id),
      })),
    ),
  );
  return perCollection.flat();
}

/**
 * The tags in use across a set of posts, deduplicated and sorted. Tags are
 * free-form (typed directly on posts in the CMS), so the posts themselves
 * are the source of truth for which tags exist.
 */
export function collectTags(posts: { data: { tags?: string[] } }[]): string[] {
  return [...new Set(posts.flatMap((p) => p.data.tags ?? []))].sort();
}

export async function getAllTags(): Promise<string[]> {
  return collectTags(await getAllTaggedPosts());
}
