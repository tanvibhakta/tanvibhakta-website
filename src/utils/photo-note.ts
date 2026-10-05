import { entitiesToMarkdown } from "./telegram-entities";
import {
  noteContent,
  noteDate,
  noteStem,
  type TelegramMessage,
} from "./telegram-note";

export type PhotoNotePlan =
  | {
      kind: "create" | "append";
      notePath: string;
      imagePath: string;
      content: string;
    }
  | { kind: "duplicate"; notePath: string };

const NOTES_DIR = "posts/notes";
// An image line as this module writes it; the anchor for album appends.
const IMAGE_LINE = /^!\[[^\]]*\]\(images\/[^)\s]+\)$/;

/**
 * Decides which note a photo message lands in, and that note's new text.
 * Pure apart from `readNote`, which returns a note's current content on the
 * target branch (null if absent) — so the caller does all the I/O.
 *
 * - Image file: `<stem>-<message_id>.webp`. Keying on message_id makes a
 *   Telegram redelivery detectable: the note already references the image.
 * - Single photo: `<stem>.md`, or `<stem>-<message_id>.md` when another
 *   note already has that minute (the text-note collision rule).
 * - Album: `<stem>-<media_group_id>.md`. Every album item shares the date
 *   and group id, so each computes the same path; the first creates the
 *   note, the rest append their image after the last image line.
 *
 * Image lines sit on adjacent lines so rehype-gallery groups them into one
 * gallery; the caption follows after a blank line.
 */
export async function planPhotoNote(
  message: TelegramMessage,
  timeZone: string,
  ownerId: number | undefined,
  readNote: (path: string) => Promise<string | null>,
): Promise<PhotoNotePlan> {
  const epoch = noteDate(message, ownerId);
  const stem = noteStem(epoch, timeZone);
  const imageName = `${stem}-${message.message_id}.webp`;
  const imagePath = `${NOTES_DIR}/images/${imageName}`;
  const imageLine = `![](images/${imageName})`;
  const caption = message.caption?.trim()
    ? entitiesToMarkdown(message.caption, message.caption_entities)
    : "";

  const created = (notePath: string): PhotoNotePlan => ({
    kind: "create",
    notePath,
    imagePath,
    content: noteContent(
      epoch,
      timeZone,
      caption ? `${imageLine}\n\n${caption}` : imageLine,
    ),
  });

  if (message.media_group_id) {
    const notePath = `${NOTES_DIR}/${stem}-${message.media_group_id}.md`;
    const existing = await readNote(notePath);
    if (existing === null) return created(notePath);
    if (existing.includes(`images/${imageName}`)) {
      return { kind: "duplicate", notePath };
    }
    return {
      kind: "append",
      notePath,
      imagePath,
      content: appendImage(existing, imageLine, caption),
    };
  }

  for (const notePath of [
    `${NOTES_DIR}/${stem}.md`,
    `${NOTES_DIR}/${stem}-${message.message_id}.md`,
  ]) {
    const existing = await readNote(notePath);
    if (existing === null) return created(notePath);
    if (existing.includes(`images/${imageName}`)) {
      return { kind: "duplicate", notePath };
    }
  }
  // The suffixed name is unique per message, so only a hand-made file could
  // occupy it — fail loudly rather than overwrite it.
  throw new Error(
    `no free filename for ${stem} (message ${message.message_id})`,
  );
}

// Inserts the image line after the note's last image line (or opens an image
// block at the top of the body if there is none), then appends the caption.
function appendImage(content: string, imageLine: string, caption: string) {
  const lines = content.split("\n");
  const bodyStart = lines.indexOf("---", 1) + 2; // after "---" and blank line
  let lastImage = -1;
  for (let i = bodyStart; i < lines.length; i++) {
    if (IMAGE_LINE.test(lines[i])) lastImage = i;
  }
  if (lastImage === -1) lines.splice(bodyStart, 0, imageLine, "");
  else lines.splice(lastImage + 1, 0, imageLine);
  const updated = lines.join("\n");
  return caption ? `${updated.trimEnd()}\n\n${caption}\n` : updated;
}
