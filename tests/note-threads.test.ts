import { describe, expect, test } from "vitest";
import { feedLinks, threadPositions } from "../src/utils/note-threads";

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
    // It has to: the overlay is how the "no longer exists" placeholder shows.
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
