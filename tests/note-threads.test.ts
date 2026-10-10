import { describe, expect, test } from "vitest";
import {
  feedLinks,
  conversation,
  replyOrder,
  threadPositions,
} from "../src/utils/note-threads";

// Notes store naive wall clocks that parse as UTC; fixtures use Z to match.
const at = (iso: string) => new Date(`${iso}Z`);
const note = (id: string, iso: string, inReplyTo?: string) => ({
  id,
  publishedOn: at(iso),
  inReplyTo,
});

describe("threadPositions", () => {
  test("a note with no parent and no replies is not in a thread", () => {
    const positions = threadPositions([note("a", "2026-10-01T10:00:00")]);
    expect(positions.has("a")).toBe(false);
  });

  test("a root and its replies form one thread, numbered by time", () => {
    const positions = threadPositions([
      note("c", "2026-10-01T10:02:00", "b"),
      note("a", "2026-10-01T10:00:00"),
      note("b", "2026-10-01T10:01:00", "a"),
    ]);
    expect(positions.get("a")).toEqual({
      threadId: "a",
      index: 0,
      size: 3,
      older: undefined,
      newer: "b",
      missingParent: false,
    });
    expect(positions.get("b")).toMatchObject({
      index: 1,
      older: "a",
      newer: "c",
    });
    expect(positions.get("c")).toMatchObject({
      index: 2,
      older: "b",
      newer: undefined,
    });
  });

  test("a branch stays one thread, numbered by time not reply order", () => {
    // a ← b ← c, and a late reply d straight to a.
    const positions = threadPositions([
      note("a", "2026-10-01T10:00:00"),
      note("b", "2026-10-01T10:01:00", "a"),
      note("c", "2026-10-01T10:02:00", "b"),
      note("d", "2026-10-02T09:00:00", "a"),
    ]);
    expect([...positions.values()].every((p) => p.threadId === "a")).toBe(true);
    expect(positions.get("d")).toMatchObject({ index: 3, size: 4 });
  });

  test("same-instant notes order by id", () => {
    const positions = threadPositions([
      note("a", "2026-10-01T10:00:00"),
      note("y", "2026-10-01T10:00:00", "a"),
      note("x", "2026-10-01T10:00:00", "a"),
    ]);
    expect(positions.get("a")!.index).toBe(0);
    expect(positions.get("x")!.index).toBe(1);
    expect(positions.get("y")!.index).toBe(2);
  });

  test("a reply to a missing note roots its own thread, flagged", () => {
    const positions = threadPositions([
      note("b", "2026-10-01T10:01:00", "gone"),
      note("c", "2026-10-01T10:02:00", "b"),
    ]);
    expect(positions.get("b")).toMatchObject({
      threadId: "b",
      index: 0,
      size: 2,
      missingParent: true,
    });
    expect(positions.get("c")!.missingParent).toBe(false);
  });

  test("a lone reply to a missing note still gets a position", () => {
    // It has to: the note's page is where the "no longer exists" placeholder
    // shows.
    const positions = threadPositions([
      note("b", "2026-10-01T10:01:00", "gone"),
    ]);
    expect(positions.get("b")).toMatchObject({ size: 1, missingParent: true });
  });

  test("a cycle is cut, not followed forever", () => {
    const positions = threadPositions([
      note("a", "2026-10-01T10:00:00", "b"),
      note("b", "2026-10-01T10:01:00", "a"),
      note("s", "2026-10-01T10:02:00", "s"),
    ]);
    // Each of a/b is the other's parent: the earlier one becomes the root.
    expect(positions.get("a")).toMatchObject({
      threadId: "a",
      index: 0,
      size: 2,
    });
    expect(positions.get("b")).toMatchObject({ threadId: "a", index: 1 });
    // A self-reply behaves like a reply to nothing.
    expect(positions.get("s")).toMatchObject({ size: 1, missingParent: true });
  });
});

describe("feedLinks", () => {
  // Thread a ← b ← c, with an unrelated note x between b and c in the feed.
  const positions = threadPositions([
    note("a", "2026-10-01T10:00:00"),
    note("b", "2026-10-01T10:01:00", "a"),
    note("x", "2026-10-01T10:01:30"),
    note("c", "2026-10-01T10:02:00", "b"),
  ]);
  const links = feedLinks(["c", "x", "b", "a"], positions);

  test("adjacent thread neighbours join with a solid line", () => {
    expect(links.get("b")!.down).toBe("solid");
    expect(links.get("a")!.up).toBe("solid");
  });

  test("a neighbour further away in the feed gets a stub", () => {
    expect(links.get("c")!.down).toBe("stub");
    expect(links.get("b")!.up).toBe("stub");
  });

  test("the thread's first and latest notes have nothing beyond them", () => {
    expect(links.get("c")!.up).toBeNull();
    expect(links.get("a")!.down).toBeNull();
  });

  test("non-thread notes get no line", () => {
    expect(links.has("x")).toBe(false);
  });
});

describe("replyOrder", () => {
  // Ids sort by time here, so the time order is alphabetical.
  const byTime = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  test("a single chain reads straight down", () => {
    expect(replyOrder("a", { b: "a", c: "b" }, byTime)).toEqual(["b", "c"]);
  });

  test("the reply with the longest chain below it comes first", () => {
    // a → b (leaf), a → c → d → e: c's chain is longer, so it leads and b
    // follows once that chain ends.
    const parentOf = { b: "a", c: "a", d: "c", e: "d" };
    expect(replyOrder("a", parentOf, byTime)).toEqual(["c", "d", "e", "b"]);
  });

  test("chain length, not reply count, decides", () => {
    // b has three leaf replies; c has one reply that itself continues.
    const parentOf = {
      b: "a",
      c: "a",
      d: "b",
      e: "b",
      f: "b",
      g: "c",
      h: "g",
      i: "h",
    };
    expect(replyOrder("a", parentOf, byTime)).toEqual([
      "c",
      "g",
      "h",
      "i",
      "b",
      "d",
      "e",
      "f",
    ]);
  });

  test("equal chains fall back to oldest first", () => {
    const parentOf = { c: "a", b: "a", d: "c", e: "b" };
    expect(replyOrder("a", parentOf, byTime)).toEqual(["b", "e", "c", "d"]);
  });

  test("the rule applies at every level, not just under the root", () => {
    // Under c: d is a leaf, e continues to f.
    const parentOf = { b: "a", c: "b", d: "c", e: "c", f: "e" };
    expect(replyOrder("a", parentOf, byTime)).toEqual([
      "b",
      "c",
      "e",
      "f",
      "d",
    ]);
  });
});

describe("conversation", () => {
  const byTime = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ids = (items: { id: string }[]) => items.map((i) => i.id);

  test("ancestors root first, then the note, then its replies", () => {
    const parentOf = { b: "a", c: "b", d: "c" };
    expect(ids(conversation("b", parentOf, byTime))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  test("leaves out sibling branches of the note's ancestors", () => {
    // a → b → c (the note), and a → x: x is someone else's reply.
    const parentOf = { b: "a", c: "b", x: "a" };
    expect(ids(conversation("c", parentOf, byTime))).toEqual(["a", "b", "c"]);
  });

  test("replies read in replyOrder", () => {
    const parentOf = { b: "a", c: "a", d: "c", e: "d" };
    expect(ids(conversation("a", parentOf, byTime))).toEqual([
      "a",
      ...replyOrder("a", parentOf, byTime),
    ]);
  });

  test("the line joins a note to the one above only if it's the parent", () => {
    // a → c → d → e, then a → b once that chain ends: b's parent isn't
    // directly above it.
    const parentOf = { b: "a", c: "a", d: "c", e: "d" };
    expect(conversation("a", parentOf, byTime)).toEqual([
      { id: "a", joinsUp: false, joinsDown: true, branchFrom: null },
      { id: "c", joinsUp: true, joinsDown: true, branchFrom: null },
      { id: "d", joinsUp: true, joinsDown: true, branchFrom: null },
      { id: "e", joinsUp: true, joinsDown: false, branchFrom: null },
      { id: "b", joinsUp: false, joinsDown: false, branchFrom: "a" },
    ]);
  });

  test("a note with no thread is the whole conversation", () => {
    expect(conversation("x", {}, byTime)).toEqual([
      { id: "x", joinsUp: false, joinsDown: false, branchFrom: null },
    ]);
  });
});
