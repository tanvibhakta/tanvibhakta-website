import { describe, expect, test } from "vitest";
import { absolutizeImages } from "../src/utils/feed-images";

describe("absolutizeImages", () => {
  const map = new Map([
    ["images/chai.webp", "https://tanvibhakta.in/_astro/chai.abc_1280.webp"],
  ]);

  test("relative srcs are rewritten through the map", () => {
    const html = '<p><img src="images/chai.webp" alt="chai"></p>';
    expect(absolutizeImages(html, map)).toContain(
      'src="https://tanvibhakta.in/_astro/chai.abc_1280.webp"',
    );
  });

  test("absolute srcs pass through", () => {
    // toContain, not toBe: sanitize-html re-serializes void elements
    // ("<img …>" becomes "<img … />"), so byte-exact comparison fails.
    const html = '<img src="https://elsewhere.example/x.png">';
    expect(absolutizeImages(html, map)).toContain(
      'src="https://elsewhere.example/x.png"',
    );
  });

  test("unresolvable relative srcs are dropped rather than emitted broken", () => {
    const html = '<p>hi</p><img src="images/missing.webp">';
    expect(absolutizeImages(html, map)).toBe("<p>hi</p>");
  });
});
