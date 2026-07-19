import {
  entitiesToMarkdown,
  type TelegramMessageEntity,
} from "./telegram-entities";

export interface TelegramMessage {
  message_id: number;
  date: number; // Unix epoch seconds, UTC
  text?: string;
  entities?: TelegramMessageEntity[];
  from?: { id: number };
  chat?: { id: number; type: string };
}

export interface NoteFile {
  filename: string;
  content: string;
}

/**
 * Shapes a Telegram message into a note file matching the conventions of
 * scripts/new-content.ts: filename `YYYY-MM-DD-HHmm.md`, frontmatter holding
 * only a naive local wall-clock `publishedOn` (no offset — the site displays
 * it verbatim), body converted from Telegram entities to markdown.
 */
export function buildNote(
  message: TelegramMessage,
  timeZone: string,
): NoteFile | null {
  if (!message.text?.trim()) return null;
  const timestamp = wallClockTimestamp(message.date, timeZone);
  const body = entitiesToMarkdown(message.text, message.entities);
  return {
    filename: `${timestamp.slice(0, 10)}-${timestamp.slice(11, 16).replace(":", "")}.md`,
    content: `---\npublishedOn: ${timestamp}\n---\n\n${body}\n`,
  };
}

// "YYYY-MM-DDTHH:mm:ss" as read off a clock in `timeZone`.
function wallClockTimestamp(epochSeconds: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(epochSeconds * 1000))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
