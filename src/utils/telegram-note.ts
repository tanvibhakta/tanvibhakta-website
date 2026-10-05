import {
  entitiesToMarkdown,
  type TelegramMessageEntity,
} from "./telegram-entities";

export interface TelegramMessage {
  message_id: number;
  date: number; // Unix epoch seconds, UTC
  text?: string;
  entities?: TelegramMessageEntity[];
  caption?: string;
  caption_entities?: TelegramMessageEntity[];
  // One entry per size Telegram generated for a compressed photo.
  photo?: {
    file_id: string;
    width: number;
    height: number;
    file_size?: number;
  }[];
  // A file attachment; an image only when mime_type says so.
  document?: { file_id: string; mime_type?: string; file_size?: number };
  // Shared by every message of an album; each arrives as its own update.
  media_group_id?: string;
  forward_origin?: {
    type: string; // "user" | "hidden_user" | "chat" | "channel"
    date: number; // when the original message was sent
    sender_user?: { id: number };
  };
  from?: { id: number };
  chat?: { id: number; type: string };
}

export interface MessageImage {
  fileId: string;
  fileSize?: number;
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
  ownerId?: number,
): NoteFile | null {
  if (!message.text?.trim()) return null;
  const epoch = noteDate(message, ownerId);
  const body = entitiesToMarkdown(message.text, message.entities);
  return {
    filename: `${noteStem(epoch, timeZone)}.md`,
    content: noteContent(epoch, timeZone, body),
  };
}

/** A note file's full text: frontmatter, blank line, body. */
export function noteContent(
  epoch: number,
  timeZone: string,
  body: string,
): string {
  return `---\npublishedOn: ${wallClockTimestamp(epoch, timeZone)}\n---\n\n${body}\n`;
}

/**
 * When the note was written, as Unix epoch seconds. A forward carries the
 * forward time in `date`; only when it forwards the owner's own message is
 * the original send time (`forward_origin.date`) the note's date — that is
 * how old messages get backfilled. A forward of anyone else's message is
 * a share, dated when it was shared.
 */
export function noteDate(message: TelegramMessage, ownerId?: number): number {
  const origin = message.forward_origin;
  if (
    origin?.type === "user" &&
    ownerId !== undefined &&
    origin.sender_user?.id === ownerId
  ) {
    return origin.date;
  }
  return message.date;
}

/** The `YYYY-MM-DD-HHmm` stem note filenames are built from. */
export function noteStem(epoch: number, timeZone: string): string {
  const timestamp = wallClockTimestamp(epoch, timeZone);
  return `${timestamp.slice(0, 10)}-${timestamp.slice(11, 16).replace(":", "")}`;
}

/**
 * The image a message carries, if any: the largest size of a compressed
 * photo, or a file whose mime type says it's an image. (sharp decoding it
 * later is the real check — a mime type is only the sender's claim.)
 */
export function messageImage(message: TelegramMessage): MessageImage | null {
  if (message.photo?.length) {
    const largest = message.photo.reduce((a, b) =>
      b.width * b.height > a.width * a.height ? b : a,
    );
    return { fileId: largest.file_id, fileSize: largest.file_size };
  }
  if (message.document?.mime_type?.startsWith("image/")) {
    return {
      fileId: message.document.file_id,
      fileSize: message.document.file_size,
    };
  }
  return null;
}

/**
 * The permalink number of a note, given the filenames in posts/notes/.
 * Notes get xkcd-style sequential slugs ordered by publish time
 * (src/utils/notes.ts); filenames start with the publish minute, so sorting
 * stems approximates that order — exact except for two notes in the same
 * minute, where notes.ts compares seconds. Stems, not full names: "-" sorts
 * before ".", so `1200-77.md` would otherwise precede `1200.md`.
 */
export function noteNumberFromListing(
  filenames: string[],
  filename: string,
): number {
  const stems = filenames
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
  return stems.indexOf(filename.replace(/\.md$/, "")) + 1;
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
