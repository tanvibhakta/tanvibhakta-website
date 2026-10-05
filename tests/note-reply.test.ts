import { describe, expect, test } from "vitest";
import {
  parentCandidates,
  parentIdFromBotReply,
} from "../src/utils/note-reply";
import type { TelegramMessage } from "../src/utils/telegram-note";

const TZ = "Asia/Kolkata"; // UTC+05:30
const OWNER = 42;

// 12:00:00 IST on 21 Jun 2026.
const msg = (overrides: Partial<TelegramMessage>): TelegramMessage => ({
  message_id: 7,
  date: Date.UTC(2026, 5, 21, 6, 30, 0) / 1000,
  text: "the note being replied to",
  from: { id: OWNER },
  ...overrides,
});

describe("parentCandidates", () => {
  test("a text note: its own suffixed name first, then the plain minute", () => {
    expect(parentCandidates(msg({}), TZ, OWNER)).toEqual([
      "posts/notes/2026-06-21-1200-7.md",
      "posts/notes/2026-06-21-1200.md",
    ]);
  });

  test("a photo in an album: the album's note", () => {
    expect(parentCandidates(msg({ media_group_id: "999" }), TZ, OWNER)).toEqual(
      ["posts/notes/2026-06-21-1200-999.md"],
    );
  });

  test("a forward of your own message: named by when it was first sent", () => {
    const forwarded = msg({
      forward_origin: {
        type: "user",
        date: Date.UTC(2026, 0, 2, 4, 30, 0) / 1000, // 10:00 IST, 2 Jan
        sender_user: { id: OWNER },
      },
    });
    expect(parentCandidates(forwarded, TZ, OWNER)).toEqual([
      "posts/notes/2026-01-02-1000-7.md",
      "posts/notes/2026-01-02-1000.md",
    ]);
  });

  test("a bot message has no candidates by date", () => {
    const bot = msg({ from: { id: 1, is_bot: true } });
    expect(parentCandidates(bot, TZ, OWNER)).toEqual([]);
  });
});

describe("parentIdFromBotReply", () => {
  const bot = (text: string) => msg({ from: { id: 1, is_bot: true }, text });

  test("reads the slug from a Published confirmation", () => {
    expect(
      parentIdFromBotReply(
        bot(
          "Published https://tanvibhakta.in/2026oct05-02 — live once the rebuild finishes (~2 min).",
        ),
      ),
    ).toEqual({ slug: "2026oct05-02" });
  });

  test("reads the file id when the confirmation fell back to a repo path", () => {
    expect(
      parentIdFromBotReply(
        bot(
          "Published posts/notes/2026-10-05-1551-66.md — live once the rebuild finishes (~2 min).",
        ),
      ),
    ).toEqual({ id: "2026-10-05-1551-66" });
  });

  test("ignores other bot messages", () => {
    expect(
      parentIdFromBotReply(bot("Skipped: only text and images become notes.")),
    ).toBeNull();
  });

  test("ignores messages that aren't from the bot", () => {
    expect(
      parentIdFromBotReply(
        msg({ text: "https://tanvibhakta.in/2026oct05-02" }),
      ),
    ).toBeNull();
  });
});
