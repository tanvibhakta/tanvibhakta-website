// Threads of notes: a reply names its parent (`inReplyTo`, the parent's file
// id), and a thread is everything reachable from one root. Kept free of
// astro:content so it's plain to test. Design:
// docs/plans/2026-10-05-notes-threading-design.md.

export interface ThreadInput {
  id: string;
  publishedOn: Date;
  inReplyTo?: string;
}

export interface ThreadPosition {
  /** The root note's id. */
  threadId: string;
  /** 0-based position by time; shown as "index + 1 of size". */
  index: number;
  size: number;
  /** The thread members just before / after this one in time. */
  older?: string;
  newer?: string;
  /** `inReplyTo` names a note that doesn't exist (or can't be its parent). */
  missingParent: boolean;
}

/** The margin line above / below a note in the feed. */
export type Link = "solid" | "stub" | null;

// Time order, ties broken by id — the same order note slugs use.
const byTime = (a: ThreadInput, b: ThreadInput) =>
  a.publishedOn.getTime() - b.publishedOn.getTime() ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Every threaded note's position. A note is threaded when its thread has
 * two or more notes, or when its parent is missing — the overlay is where
 * the "no longer exists" placeholder shows, so it needs a position too.
 *
 * A parent is accepted only if it exists and comes earlier in time. That
 * rules out self-replies and cycles (one side of a cycle is always the
 * later note); either way the note is treated as having a missing parent.
 */
export function threadPositions(
  notes: ThreadInput[],
): Map<string, ThreadPosition> {
  const sorted = [...notes].sort(byTime);
  const rank = new Map(sorted.map((n, i) => [n.id, i]));

  const parentOf = new Map<string, string>();
  const missing = new Set<string>();
  for (const note of sorted) {
    if (!note.inReplyTo) continue;
    const parentRank = rank.get(note.inReplyTo);
    if (parentRank !== undefined && parentRank < rank.get(note.id)!) {
      parentOf.set(note.id, note.inReplyTo);
    } else {
      missing.add(note.id);
    }
  }

  // Parents always sort earlier, so walking in time order sees each root
  // before its replies.
  const rootOf = new Map<string, string>();
  const members = new Map<string, string[]>();
  for (const note of sorted) {
    const parent = parentOf.get(note.id);
    const root = parent ? rootOf.get(parent)! : note.id;
    rootOf.set(note.id, root);
    members.set(root, [...(members.get(root) ?? []), note.id]);
  }

  const positions = new Map<string, ThreadPosition>();
  for (const [root, ids] of members) {
    if (ids.length < 2 && !missing.has(root)) continue;
    ids.forEach((id, index) =>
      positions.set(id, {
        threadId: root,
        index,
        size: ids.length,
        older: ids[index - 1],
        newer: ids[index + 1],
        missingParent: missing.has(id),
      }),
    );
  }
  return positions;
}

/**
 * The margin line around each threaded note in the feed (`newestFirst` is
 * the feed's order). Solid where the next or previous note in the thread is
 * the neighbouring feed item; a short stub where the thread continues
 * further away; nothing past the thread's first and latest notes.
 */
export function feedLinks(
  newestFirst: string[],
  positions: Map<string, ThreadPosition>,
): Map<string, { up: Link; down: Link }> {
  const links = new Map<string, { up: Link; down: Link }>();
  newestFirst.forEach((id, i) => {
    const position = positions.get(id);
    if (!position) return;
    const link = (
      neighbour: string | undefined,
      adjacent: string | undefined,
    ) => (neighbour ? (neighbour === adjacent ? "solid" : "stub") : null);
    links.set(id, {
      up: link(position.newer, newestFirst[i - 1]),
      down: link(position.older, newestFirst[i + 1]),
    });
  });
  return links;
}

/**
 * The replies below `id`, in the overlay's reading order: depth-first, so
 * each branch's chain stays together. Among siblings, the reply with the
 * longest unbroken chain below it comes first; a reply with nothing below
 * it waits until the longer chains have ended. Equal chains read oldest
 * first.
 *
 * `parentOf` maps a reply's id to its parent's; `byTime` orders two ids.
 */
export function replyOrder(
  id: string,
  parentOf: Record<string, string>,
  byTime: (a: string, b: string) => number,
): string[] {
  const children = new Map<string, string[]>();
  for (const [child, parent] of Object.entries(parentOf)) {
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }

  // Notes in the longest chain below a note, the note excluded: 0 for a
  // note with no replies.
  const chain = new Map<string, number>();
  const chainBelow = (note: string): number => {
    if (!chain.has(note)) {
      const below = (children.get(note) ?? []).map((c) => 1 + chainBelow(c));
      chain.set(note, Math.max(0, ...below));
    }
    return chain.get(note)!;
  };

  const out: string[] = [];
  const walk = (parent: string) => {
    const replies = [...(children.get(parent) ?? [])].sort(
      (a, b) => chainBelow(b) - chainBelow(a) || byTime(a, b),
    );
    for (const reply of replies) {
      out.push(reply);
      walk(reply);
    }
  };
  walk(id);
  return out;
}
