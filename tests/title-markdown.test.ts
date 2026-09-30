import { describe, test, expect } from "vitest";
import { titleHtml, titleText } from "../src/utils/title-markdown";

describe("titleHtml", () => {
  test("renders strikethrough as <s>", () => {
    expect(titleHtml("Birthday ~~Blues~~ Purples")).toBe(
      "Birthday <s>Blues</s> Purples",
    );
  });

  test("renders emphasis and inline code", () => {
    expect(titleHtml("*why* `grep` **bites**")).toBe(
      "<em>why</em> <code>grep</code> <strong>bites</strong>",
    );
  });

  test("escapes raw HTML instead of rendering it", () => {
    expect(titleHtml("<b>hi</b> & bye")).toBe(
      "&lt;b&gt;hi&lt;/b&gt; &amp; bye",
    );
  });

  test("leaves links as text, since titles already sit inside anchors", () => {
    expect(titleHtml("[a](https://x.test)")).toBe("[a](https://x.test)");
  });

  test("leaves a plain title unchanged", () => {
    expect(titleHtml("Week of Aug 22nd, 2026")).toBe("Week of Aug 22nd, 2026");
  });
});

describe("titleText", () => {
  test("keeps struck-through words and drops the markers", () => {
    expect(titleText("Birthday ~~Blues~~ Purples")).toBe(
      "Birthday Blues Purples",
    );
  });

  test("drops emphasis and code markers", () => {
    expect(titleText("*why* `grep` **bites**")).toBe("why grep bites");
  });

  test("does not HTML-escape (callers escape for their own context)", () => {
    expect(titleText("Tom & Jerry")).toBe("Tom & Jerry");
  });
});
