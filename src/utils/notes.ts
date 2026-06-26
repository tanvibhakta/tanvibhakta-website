import type { CollectionEntry } from "astro:content";
import { getPublishedEntries } from "./collections";

export interface NumberedNote {
  note: CollectionEntry<"notes">;
  number: number;
}

// Notes get xkcd-style sequential permalinks: ordered by publish time, the
// earliest published note is #1 and numbers increase from there. The number is
// the note's URL slug (/notes/1, /notes/2, ...). Back-dating a note shifts the
// numbers after it, so notes are expected to be added going forward in time.
export async function getNumberedNotes(): Promise<NumberedNote[]> {
  const notes = await getPublishedEntries("notes");
  return [...notes]
    .sort((a, b) => {
      const byDate =
        a.data.publishedOn.getTime() - b.data.publishedOn.getTime();
      if (byDate !== 0) return byDate;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((note, index) => ({ note, number: index + 1 }));
}

// Map of note id -> permalink number, for linking to a note from elsewhere.
export async function getNoteNumbers(): Promise<Map<string, number>> {
  const numbered = await getNumberedNotes();
  return new Map(numbered.map(({ note, number }) => [note.id, number]));
}
