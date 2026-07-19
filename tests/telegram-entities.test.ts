import { describe, expect, test } from "vitest";
import {
  entitiesToMarkdown,
  type TelegramMessageEntity,
} from "../src/utils/telegram-entities";

// Offsets/lengths in these fixtures are UTF-16 code units, exactly as the
// Telegram Bot API delivers them.
const e = (
  type: string,
  offset: number,
  length: number,
  extra: Partial<TelegramMessageEntity> = {},
): TelegramMessageEntity => ({ type, offset, length, ...extra });

describe("plain text", () => {
  test("passes through text without entities", () => {
    expect(entitiesToMarkdown("hello world")).toBe("hello world");
  });

  test("escapes markdown specials even when there are no entities", () => {
    // @telegraf/entity issue #13: their zero-entity path skips escaping.
    expect(entitiesToMarkdown("5 * 3 = *15*")).toBe("5 \\* 3 = \\*15\\*");
  });

  test("escapes link-like brackets", () => {
    expect(entitiesToMarkdown("[not](a-link)")).toBe("\\[not\\](a-link)");
  });

  test("escapes block-level markers at line starts", () => {
    expect(entitiesToMarkdown("> quoted\n- item\n1. numbered\n# heading")).toBe(
      "\\> quoted\n\\- item\n1\\. numbered\n\\# heading",
    );
  });
});

describe("inline formatting", () => {
  test("bold", () => {
    expect(entitiesToMarkdown("hello world", [e("bold", 6, 5)])).toBe(
      "hello **world**",
    );
  });

  test("italic", () => {
    expect(entitiesToMarkdown("hello world", [e("italic", 6, 5)])).toBe(
      "hello *world*",
    );
  });

  test("strikethrough uses GFM tildes", () => {
    expect(entitiesToMarkdown("hello world", [e("strikethrough", 6, 5)])).toBe(
      "hello ~~world~~",
    );
  });

  test("underline falls back to inline HTML", () => {
    expect(entitiesToMarkdown("hello world", [e("underline", 6, 5)])).toBe(
      "hello <u>world</u>",
    );
  });

  test("spoiler degrades to plain text", () => {
    expect(entitiesToMarkdown("secret: gift", [e("spoiler", 8, 4)])).toBe(
      "secret: gift",
    );
  });

  test("offsets index correctly past astral-plane emoji", () => {
    // "😀" is two UTF-16 code units, so "hi" starts at offset 3.
    expect(entitiesToMarkdown("😀 hi", [e("bold", 3, 2)])).toBe("😀 **hi**");
  });

  test("nested entities serialize inside-out", () => {
    expect(
      entitiesToMarkdown("hello world", [e("bold", 0, 11), e("italic", 6, 5)]),
    ).toBe("**hello *world***");
  });

  test("trailing whitespace moves outside emphasis delimiters", () => {
    // CommonMark flanking rules: "**ab cd **" is not emphasis.
    expect(entitiesToMarkdown("ab cd end", [e("bold", 0, 6)])).toBe(
      "**ab cd** end",
    );
  });

  test("adjacent same-type entities merge into one span", () => {
    // Telegram splits overlapping formats into adjacent entities;
    // naive output "**co****ming**" is broken CommonMark.
    expect(
      entitiesToMarkdown("coming", [
        e("bold", 0, 2),
        e("bold", 2, 4),
        e("italic", 2, 4),
      ]),
    ).toBe("**co*ming***");
  });
});

describe("links", () => {
  test("text_link becomes an inline link", () => {
    expect(
      entitiesToMarkdown("click here", [
        e("text_link", 6, 4, { url: "https://example.com" }),
      ]),
    ).toBe("click [here](https://example.com)");
  });

  test("bare url entity is left raw, not escaped", () => {
    expect(entitiesToMarkdown("see https://a_b.com", [e("url", 4, 15)])).toBe(
      "see https://a_b.com",
    );
  });

  test("mention is left raw, not escaped", () => {
    expect(entitiesToMarkdown("@user_name", [e("mention", 0, 10)])).toBe(
      "@user_name",
    );
  });

  test("text_mention degrades to plain text", () => {
    expect(
      entitiesToMarkdown("hi Tanvi", [
        e("text_mention", 3, 5, { user: { id: 42 } }),
      ]),
    ).toBe("hi Tanvi");
  });
});

describe("code", () => {
  test("code span", () => {
    expect(entitiesToMarkdown("run npm test now", [e("code", 4, 8)])).toBe(
      "run `npm test` now",
    );
  });

  test("code span content is never backslash-escaped", () => {
    expect(entitiesToMarkdown("a*b_c", [e("code", 0, 5)])).toBe("`a*b_c`");
  });

  test("code span containing backticks gets a longer fence", () => {
    expect(entitiesToMarkdown("a `b` c", [e("code", 0, 7)])).toBe(
      "``a `b` c``",
    );
  });

  test("pre becomes a fenced block with language", () => {
    expect(
      entitiesToMarkdown("const x = 1;", [e("pre", 0, 12, { language: "js" })]),
    ).toBe("```js\nconst x = 1;\n```");
  });

  test("pre without language", () => {
    expect(entitiesToMarkdown("plain block", [e("pre", 0, 11)])).toBe(
      "```\nplain block\n```",
    );
  });
});

describe("blocks", () => {
  test("blockquote prefixes every line", () => {
    expect(entitiesToMarkdown("line1\nline2", [e("blockquote", 0, 11)])).toBe(
      "> line1\n> line2",
    );
  });

  test("custom_emoji degrades to its fallback emoji text", () => {
    expect(
      entitiesToMarkdown("hi 😊", [
        e("custom_emoji", 3, 2, { custom_emoji_id: "5368324170671202286" }),
      ]),
    ).toBe("hi 😊");
  });
});
