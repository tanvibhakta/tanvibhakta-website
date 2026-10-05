import { expect, test, vi } from "vitest";

vi.mock("../src/content.config", () => ({
  SECTIONS: { notes: { href: "/notes", title: "Notes", description: "" } },
  STANDALONE_PAGES: {
    home: { href: "/", title: "Home", description: "" },
    work: { href: "/work", title: "Work", description: "" },
  },
}));

const { getCurrentSection } = await import("../src/utils/sections");

test("a root-level note slug belongs to the Notes section", () => {
  expect(getCurrentSection("/2026oct03-01/")).toEqual({
    href: "/notes",
    label: "Notes",
  });
});

test("other unknown paths still fall back to their first segment", () => {
  expect(getCurrentSection("/care")).toEqual({ href: "/care", label: "Care" });
});
