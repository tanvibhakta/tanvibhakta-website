import type { CollectionEntry } from "astro:content";
import { getPublishedEntries } from "./collections";
import { assignNoteSlugs } from "./note-slug";

export interface SluggedNote {
  note: CollectionEntry<"notes">;
  slug: string;
}

// Notes are served at the site root under a per-day slug (/2026oct05-02); see
// src/utils/note-slug.ts. Returned oldest-first.
export async function getSluggedNotes(): Promise<SluggedNote[]> {
  const notes = await getPublishedEntries("notes");
  const slugs = await getNoteSlugs(notes);
  return [...notes]
    .sort((a, b) => {
      const byDate =
        a.data.publishedOn.getTime() - b.data.publishedOn.getTime();
      if (byDate !== 0) return byDate;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((note) => ({ note, slug: slugs.get(note.id)! }));
}

// Map of note id -> slug, for linking to a note from elsewhere.
export async function getNoteSlugs(
  notes?: CollectionEntry<"notes">[],
): Promise<Map<string, string>> {
  const entries = notes ?? (await getPublishedEntries("notes"));
  return assignNoteSlugs(
    entries.map((n) => ({ id: n.id, publishedOn: n.data.publishedOn })),
  );
}
