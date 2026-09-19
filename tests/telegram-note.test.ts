import { describe, expect, test } from "vitest";
import * as prettier from "prettier";
import {
  buildNote,
  formatNote,
  noteNumberFromListing,
  type NoteFile,
  type TelegramMessage,
} from "../src/utils/telegram-note";

// Telegram delivers message.date as Unix epoch seconds (UTC). Notes store a
// naive local wall-clock timestamp, so all fixtures pin timeZone explicitly.
const TZ = "Asia/Kolkata"; // UTC+05:30

const msg = (overrides: Partial<TelegramMessage>): TelegramMessage => ({
  message_id: 7,
  date: Date.UTC(2026, 5, 21, 6, 30, 0) / 1000, // 12:00:00 IST
  text: "hello",
  ...overrides,
});

describe("buildNote", () => {
  test("derives filename from wall-clock time in the given timezone", () => {
    expect(buildNote(msg({}), TZ)?.filename).toBe("2026-06-21-1200.md");
  });

  test("frontmatter carries the full wall-clock timestamp", () => {
    expect(buildNote(msg({}), TZ)?.content).toBe(
      "---\npublishedOn: 2026-06-21T12:00:00\n---\n\nhello\n",
    );
  });

  test("body is entity-converted markdown", () => {
    const note = buildNote(
      msg({
        text: "hello world",
        entities: [{ type: "bold", offset: 6, length: 5 }],
      }),
      TZ,
    );
    expect(note?.content).toContain("\n\nhello **world**\n");
  });

  test("returns null for messages without text", () => {
    expect(buildNote(msg({ text: undefined }), TZ)).toBeNull();
  });

  test("returns null for whitespace-only text", () => {
    expect(buildNote(msg({ text: "  \n " }), TZ)).toBeNull();
  });

  test("note number is the count of markdown files in the listing", () => {
    // Notes are numbered by publish order and only added forward in time
    // (see src/utils/notes.ts), so the newest note's number is the total
    // count of note files after it lands.
    expect(
      noteNumberFromListing([
        "2026-06-21-1200.md",
        "2026-08-16-2341.md",
        ".DS_Store",
      ]),
    ).toBe(2);
  });

  test("midnight formats as 00, not 24", () => {
    // 18:35:00 UTC = 00:05:00 IST next day
    const note = buildNote(
      msg({ date: Date.UTC(2026, 5, 21, 18, 35, 0) / 1000 }),
      TZ,
    );
    expect(note?.filename).toBe("2026-06-22-0005.md");
    expect(note?.content).toContain("publishedOn: 2026-06-22T00:05:00");
  });
});

describe("formatNote", () => {
  // Notes reach the repo through the webhook's direct commit to main, which
  // never runs lint-staged. Formatting here is what keeps `prettier --check`
  // in CI green; these assert against real Prettier rather than restating
  // its rules, so an unanticipated construct fails here and not on main.
  const formatted = async (overrides: Partial<TelegramMessage>) =>
    (await formatNote(buildNote(msg(overrides), TZ)!)).content;

  const isPrettierClean = async (note: NoteFile) => {
    const filepath = `posts/notes/${note.filename}`;
    return prettier.check(note.content, {
      ...(await prettier.resolveConfig(filepath)),
      filepath,
    });
  };

  test("strips the trailing spaces a phone keyboard leaves behind", async () => {
    // remark-breaks makes a single newline a line break, so dropping these
    // changes nothing about how the note renders.
    expect(await formatted({ text: "a bad day. \n3h work, \n" })).toBe(
      "---\npublishedOn: 2026-06-21T12:00:00\n---\n\na bad day.\n3h work,\n",
    );
  });

  test("leaves the generated frontmatter untouched", async () => {
    expect(await formatted({ text: "hello" })).toContain(
      "---\npublishedOn: 2026-06-21T12:00:00\n---\n",
    );
  });

  test("preserves entity-converted markup", async () => {
    const content = await formatted({
      text: "hello world",
      entities: [{ type: "bold", offset: 6, length: 5 }],
    });
    expect(content).toContain("hello **world**");
  });

  const corpus: Record<string, Partial<TelegramMessage>> = {
    "trailing spaces, as typed on a phone": {
      text: "Yesterday was a bad day. \n3h work - learning, \n2h reading, \n",
    },
    "escaped block markers": {
      text: "I am feeling both \n- doing too much\n- swimming in place \n",
    },
    "entity-formatted inline markup": {
      text: "hello world and link",
      entities: [
        { type: "bold", offset: 6, length: 5 },
        { type: "text_link", offset: 16, length: 4, url: "https://x.com" },
      ],
    },
    "code block with trailing whitespace": {
      text: "const a = 1;   \nconst b = 2;",
      entities: [{ type: "pre", offset: 0, length: 28, language: "js" }],
    },
    blockquote: {
      text: "quoted thought\nsecond line",
      entities: [{ type: "blockquote", offset: 0, length: 26 }],
    },
    "stray blank lines between thoughts": {
      text: "one thought\n\n\n\nanother thought\n\n\n",
    },
  };

  for (const [name, overrides] of Object.entries(corpus)) {
    test(`output passes prettier --check: ${name}`, async () => {
      const note = await formatNote(buildNote(msg(overrides), TZ)!);
      await expect(isPrettierClean(note)).resolves.toBe(true);
    });
  }

  test("unformatted notes would fail the same check", async () => {
    // Guards the tests above from passing vacuously: the corpus has to
    // contain input Prettier actually objects to.
    const raw = buildNote(
      msg(corpus["trailing spaces, as typed on a phone"]),
      TZ,
    )!;
    await expect(isPrettierClean(raw)).resolves.toBe(false);
  });
});
