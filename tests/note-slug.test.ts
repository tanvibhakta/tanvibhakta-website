import { describe, expect, test } from "vitest";
import {
  assignNoteSlugs,
  isNoteSlug,
  noteDayKey,
  noteSlugFromListing,
  filenameForSlug,
} from "../src/utils/note-slug";

// Notes store naive wall clocks that parse as UTC; fixtures use Z to match.
const at = (iso: string) => new Date(`${iso}Z`);

describe("noteDayKey", () => {
  test("is lowercase year, short month, zero-padded day", () => {
    expect(noteDayKey(at("2026-10-05T15:51:00"))).toBe("2026oct05");
  });

  test("uses three-letter months for all twelve", () => {
    const months = Array.from({ length: 12 }, (_, m) =>
      noteDayKey(new Date(Date.UTC(2026, m, 1))).slice(4, 7),
    );
    expect(months).toEqual(
      "jan feb mar apr may jun jul aug sep oct nov dec".split(" "),
    );
  });

  test("reads the authored wall-clock date, not a shifted instant", () => {
    // 00:44 IST on 2 Oct must not slip back to 1 Oct.
    expect(noteDayKey(at("2026-10-02T00:44:25"))).toBe("2026oct02");
  });
});

describe("assignNoteSlugs", () => {
  test("numbers notes within each day by publish time", () => {
    const slugs = assignNoteSlugs([
      { id: "c", publishedOn: at("2026-09-28T13:11:00") },
      { id: "b", publishedOn: at("2026-09-27T11:51:00") },
      { id: "a", publishedOn: at("2026-09-27T11:50:00") },
    ]);
    expect(slugs.get("a")).toBe("2026sep27-01");
    expect(slugs.get("b")).toBe("2026sep27-02");
    expect(slugs.get("c")).toBe("2026sep28-01");
  });

  test("breaks same-second ties by id", () => {
    const t = at("2026-09-27T11:50:30");
    const slugs = assignNoteSlugs([
      { id: "2026-09-27-1150-60", publishedOn: t },
      { id: "2026-09-27-1150", publishedOn: t },
    ]);
    expect(slugs.get("2026-09-27-1150")).toBe("2026sep27-01");
    expect(slugs.get("2026-09-27-1150-60")).toBe("2026sep27-02");
  });
});

describe("noteSlugFromListing", () => {
  test("is the note's position among same-day markdown files", () => {
    const listing = [
      "2026-09-28-1222.md",
      "2026-09-27-1150.md",
      "2026-09-27-1151.md",
      ".DS_Store",
      "images",
    ];
    expect(noteSlugFromListing(listing, "2026-09-27-1151.md")).toBe(
      "2026sep27-02",
    );
    expect(noteSlugFromListing(listing, "2026-09-28-1222.md")).toBe(
      "2026sep28-01",
    );
  });

  test("a suffixed filename sorts right after its unsuffixed sibling", () => {
    const listing = ["2026-06-21-1200-77.md", "2026-06-21-1200.md"];
    expect(noteSlugFromListing(listing, "2026-06-21-1200-77.md")).toBe(
      "2026jun21-02",
    );
  });
});

test("isNoteSlug accepts note slugs and rejects other path segments", () => {
  expect(isNoteSlug("2026oct05-01")).toBe(true);
  expect(isNoteSlug("2026oct05-123")).toBe(true);
  expect(isNoteSlug("2026Oct05-01")).toBe(false);
  expect(isNoteSlug("2026oct05-1")).toBe(false);
  expect(isNoteSlug("now")).toBe(false);
});

describe("filenameForSlug", () => {
  const listing = [
    "2026-10-05-0900.md",
    "2026-10-05-1551-66.md",
    "2026-10-05-1551.md",
    "2026-10-04-2300.md",
    "images",
  ];

  test("is the inverse of noteSlugFromListing", () => {
    for (const name of listing.filter((n) => n.endsWith(".md"))) {
      const slug = noteSlugFromListing(listing, name);
      expect(filenameForSlug(listing, slug)).toBe(name);
    }
  });

  test("is null for a slug past the end of its day", () => {
    expect(filenameForSlug(listing, "2026oct05-09")).toBeNull();
  });

  test("is null for something that isn't a note slug", () => {
    expect(filenameForSlug(listing, "care")).toBeNull();
  });
});
