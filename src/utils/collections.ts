import { getCollection } from "astro:content";
import {
  COLLECTION_SEGMENTS,
  SECTIONS,
  type collections,
} from "../content.config";
import { getNoteNumbers } from "./notes";
import { TAGGED_COLLECTIONS } from "./tagged-collections";

export type CollectionName = keyof typeof collections;

/** Site-relative URL for a published entry. */
export function getEntryPath(collectionName: CollectionName, id: string) {
  const segment = COLLECTION_SEGMENTS[collectionName];
  return segment ? `/${segment}/${id}` : `/${id}`;
}

/**
 * Filter predicate that excludes draft entries. Collections without a
 * `draft` field (e.g. notes) are always published.
 * Use with getCollection's built-in filter: getCollection("blog", isPublished)
 */
export const isPublished = ({ data }: { data: object }) =>
  !("draft" in data && data.draft);

/**
 * Get all published (non-draft) entries from a collection.
 */
export async function getPublishedEntries<C extends CollectionName>(
  collectionName: C,
) {
  return getCollection(collectionName, isPublished);
}

/** Collections whose entries carry a publishedOn date (all but `pages`). */
export type DatedCollectionName = Exclude<CollectionName, "pages">;

type DatedEntry = { id: string; data: { publishedOn: Date } };

/**
 * Ascending chronological comparator, the single home for publishedOn
 * ordering. Ties (identical timestamps, e.g. legacy date-only frontmatter)
 * break on entry id so ordering is deterministic rather than dependent on
 * file discovery order.
 */
export function byPublishedOn(a: DatedEntry, b: DatedEntry): number {
  return (
    a.data.publishedOn.getTime() - b.data.publishedOn.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** Descending variant of byPublishedOn, for listings and feeds. */
export function newestFirst(a: DatedEntry, b: DatedEntry): number {
  return byPublishedOn(b, a);
}

/**
 * Published entries in chronological order. "newestFirst" (the default)
 * matches listing pages and feeds; "oldestFirst" is prev/next reading order.
 */
export async function getPublishedEntriesSorted<C extends DatedCollectionName>(
  collectionName: C,
  order: "newestFirst" | "oldestFirst" = "newestFirst",
) {
  const entries = await getPublishedEntries(collectionName);
  return entries.sort(order === "newestFirst" ? newestFirst : byPublishedOn);
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
  // Notes are permalinked by number, not by filename id.
  const noteNumbers = await getNoteNumbers();
  const perCollection = await Promise.all(
    TAGGED_COLLECTIONS.map(async (name) =>
      (await getPublishedEntries(name)).map((p) => ({
        ...p,
        label: SECTIONS[name].title,
        href:
          name === "notes"
            ? `/notes/${noteNumbers.get(p.id)}`
            : getEntryPath(name, p.id),
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
