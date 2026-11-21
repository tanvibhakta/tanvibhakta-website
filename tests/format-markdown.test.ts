import { describe, expect, it } from "vitest";
import { formatMarkdown } from "../src/utils/format-markdown";

// Each case is a formatting fault that broke CI on main after a Sveltia or
// Telegram commit (see the style: fix-up commits from Oct–Nov 2026).
describe("formatMarkdown", () => {
  it("double-quotes Sveltia's single-quoted frontmatter strings", async () => {
    const input = [
      "---",
      "title: 'Week of Nov 1st, 2026: Collaboration'",
      "audio: ''",
      "---",
      "",
      "Body.",
      "",
    ].join("\n");
    expect(await formatMarkdown(input)).toBe(
      [
        "---",
        'title: "Week of Nov 1st, 2026: Collaboration"',
        'audio: ""',
        "---",
        "",
        "Body.",
        "",
      ].join("\n"),
    );
  });

  it("strips trailing whitespace and extra trailing blank lines", async () => {
    const input =
      "---\npublishedOn: 2026-11-02T11:29:00\n---\n\n- bunco \n- estate deli \n\n";
    expect(await formatMarkdown(input)).toBe(
      "---\npublishedOn: 2026-11-02T11:29:00\n---\n\n- bunco\n- estate deli\n",
    );
  });

  it("separates a list from the paragraph above it", async () => {
    const input =
      "---\npublishedOn: 2026-11-21T14:57:49\n---\n\nReview of a cafe\n1. burger\n2. coffee\n";
    expect(await formatMarkdown(input)).toBe(
      "---\npublishedOn: 2026-11-21T14:57:49\n---\n\nReview of a cafe\n\n1. burger\n2. coffee\n",
    );
  });

  it("leaves adjacent album image lines on adjacent lines", async () => {
    const input =
      "---\npublishedOn: 2026-11-21T14:57:49\n---\n\n![](images/a.webp)\n![](images/b.webp)\n\nCaption\n";
    expect(await formatMarkdown(input)).toBe(input);
  });
});
