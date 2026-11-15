import { describe, expect, test } from "vitest";
import { feedImageSrc, toFeedHtml } from "../src/utils/feed-html";

const ITEM = "https://tanvibhakta.in/blog/some-post/";

describe("feedImageSrc", () => {
  const srcset =
    "/_astro/a_640.webp 640w, /_astro/a_1280.webp 1280w, /_astro/a_2048.webp 2048w";

  test("picks the 1280w candidate, the derivative the site already builds", () => {
    expect(feedImageSrc("/_astro/a_full.webp", srcset)).toBe(
      "/_astro/a_1280.webp",
    );
  });

  test("falls back to the largest candidate under 1280w", () => {
    expect(feedImageSrc("/x.webp", "/a.webp 640w, /b.webp 960w")).toBe(
      "/b.webp",
    );
  });

  test("uses src when there is no srcset", () => {
    expect(feedImageSrc("https://elsewhere.example/x.png", undefined)).toBe(
      "https://elsewhere.example/x.png",
    );
  });
});

describe("toFeedHtml", () => {
  test("images become absolute, at feed width, without site-only attributes", () => {
    // The shape Astro renders for a local markdown image.
    const html =
      '<img alt="chai" sizes="50vw" loading="lazy" width="2250" height="3000" style="--fit: cover;" data-astro-image="constrained" src="/_astro/chai_full.webp" srcset="/_astro/chai_640.webp 640w, /_astro/chai_1280.webp 1280w, /_astro/chai_full.webp 2250w">';
    // toContain/toBe on the whole tag: sanitize-html re-serializes void
    // elements as "<img … />".
    expect(toFeedHtml(html, ITEM)).toBe(
      '<img alt="chai" src="https://tanvibhakta.in/_astro/chai_1280.webp" />',
    );
  });

  test("an img with no source is dropped", () => {
    expect(toFeedHtml("<p>hi</p><img alt='x'>", ITEM)).toBe("<p>hi</p>");
  });

  test("links resolve against the item's URL", () => {
    const html =
      '<a href="/weeknotes/">root</a><a href="blog/x">relative</a>' +
      '<a href="#user-content-fn-1">1</a><a href="https://example.com/">abs</a>' +
      '<a href="mailto:hi@example.com">mail</a>';
    const out = toFeedHtml(html, ITEM);
    expect(out).toContain('href="https://tanvibhakta.in/weeknotes/"');
    expect(out).toContain(
      'href="https://tanvibhakta.in/blog/some-post/blog/x"',
    );
    expect(out).toContain(
      'href="https://tanvibhakta.in/blog/some-post/#user-content-fn-1"',
    );
    expect(out).toContain('href="https://example.com/"');
    expect(out).toContain('href="mailto:hi@example.com"');
  });

  test("paragraph and heading permalinks are removed with their text", () => {
    const html =
      '<h2 id="intro">Intro<a href="#intro" class="anchor-link" aria-label="Link to this section"> #</a></h2>' +
      '<p id="p-1">Hello<a href="#p-1" class="anchor-link"> #</a></p>';
    expect(toFeedHtml(html, ITEM)).toBe("<h2>Intro</h2><p>Hello</p>");
  });

  test("external links lose the icon and the screen-reader-only text", () => {
    const html =
      '<a href="https://example.com" target="_blank" rel="noopener">exampl<span class="external-link-tail">e<svg class="external-link-icon"><path d="M1 1"></path></svg></span><span class="sr-only"> (opens in a new tab)</span></a>';
    const out = toFeedHtml(html, ITEM);
    expect(out).toContain('href="https://example.com/"');
    expect(out).toContain("exampl<span>e</span>");
    expect(out).not.toContain("svg");
    expect(out).not.toContain("opens in a new tab");
  });
});
