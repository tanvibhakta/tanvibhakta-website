import { describe, expect, test } from "vitest";
import { buildNote, type TelegramMessage } from "../src/utils/telegram-note";

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
