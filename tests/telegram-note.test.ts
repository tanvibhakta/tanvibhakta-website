import { describe, expect, test } from "vitest";
import {
  buildNote,
  messageImage,
  noteDate,
  noteStem,
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

  test("a reply names its parent note in the frontmatter", () => {
    expect(buildNote(msg({}), TZ, undefined, "2026-06-20-0900")?.content).toBe(
      "---\npublishedOn: 2026-06-21T12:00:00\ninReplyTo: 2026-06-20-0900\n---\n\nhello\n",
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

const OWNER = 213974271;

describe("noteDate", () => {
  const sent = Date.UTC(2026, 9, 5, 4, 0, 0) / 1000;
  const original = Date.UTC(2026, 8, 27, 6, 21, 21) / 1000;

  test("a plain message is dated when sent", () => {
    expect(noteDate(msg({ date: sent }), OWNER)).toBe(sent);
  });

  test("a forward of your own message keeps its original date", () => {
    const forward = msg({
      date: sent,
      forward_origin: {
        type: "user",
        date: original,
        sender_user: { id: OWNER },
      },
    });
    expect(noteDate(forward, OWNER)).toBe(original);
  });

  test("a forward from someone else is dated when forwarded", () => {
    const forward = msg({
      date: sent,
      forward_origin: { type: "user", date: original, sender_user: { id: 1 } },
    });
    expect(noteDate(forward, OWNER)).toBe(sent);
  });

  test("a forward from a channel is dated when forwarded", () => {
    const forward = msg({
      date: sent,
      forward_origin: { type: "channel", date: original },
    });
    expect(noteDate(forward, OWNER)).toBe(sent);
  });

  test("buildNote uses the original date of an own forward", () => {
    const forward = msg({
      date: sent,
      forward_origin: {
        type: "user",
        date: original,
        sender_user: { id: OWNER },
      },
    });
    expect(buildNote(forward, TZ, OWNER)?.filename).toBe("2026-09-27-1151.md");
  });
});

describe("noteStem", () => {
  test("is the filename stem buildNote derives", () => {
    expect(noteStem(Date.UTC(2026, 5, 21, 6, 30, 0) / 1000, TZ)).toBe(
      "2026-06-21-1200",
    );
  });
});

describe("messageImage", () => {
  test("picks the largest photo size", () => {
    const image = messageImage(
      msg({
        text: undefined,
        photo: [
          { file_id: "small", width: 90, height: 60, file_size: 1000 },
          { file_id: "large", width: 1280, height: 853, file_size: 90000 },
          { file_id: "medium", width: 320, height: 213, file_size: 9000 },
        ],
      }),
    );
    expect(image).toEqual({ fileId: "large", fileSize: 90000 });
  });

  test("accepts an image sent as a file", () => {
    const image = messageImage(
      msg({
        text: undefined,
        document: { file_id: "doc", mime_type: "image/jpeg", file_size: 5 },
      }),
    );
    expect(image).toEqual({ fileId: "doc", fileSize: 5 });
  });

  test("ignores a non-image file", () => {
    expect(
      messageImage(
        msg({
          text: undefined,
          document: { file_id: "doc", mime_type: "application/pdf" },
        }),
      ),
    ).toBeNull();
  });

  test("a text message has no image", () => {
    expect(messageImage(msg({}))).toBeNull();
  });
});
