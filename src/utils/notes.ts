import type { CollectionEntry } from "astro:content";
import { getPublishedEntries } from "./collections";
import { assignNoteSlugs } from "./note-slug";
import { threadPositions, type ThreadPosition } from "./note-threads";

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

export interface ThreadedNote extends SluggedNote {
  /** Present when the note is part of a thread (see note-threads.ts). */
  position?: ThreadPosition;
}

// Slugged notes, oldest-first, with each threaded note's place in its thread.
export async function getThreadedNotes(): Promise<ThreadedNote[]> {
  const slugged = await getSluggedNotes();
  const positions = threadPositions(
    slugged.map(({ note }) => ({
      id: note.id,
      publishedOn: note.data.publishedOn,
      inReplyTo: note.data.inReplyTo,
    })),
  );
  return slugged.map((s) => ({ ...s, position: positions.get(s.note.id) }));
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
