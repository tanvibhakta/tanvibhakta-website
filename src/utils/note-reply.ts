// Which note a Telegram reply answers. A note's filename is built from the
// message it came from (see telegram-note.ts and photo-note.ts), so the
// message being replied to — Telegram includes it as reply_to_message — is
// enough to rebuild the parent's filename. The caller checks which
// candidate actually exists. Design:
// docs/plans/2026-10-05-notes-threading-design.md ("Telegram reply-to").
import { noteDate, noteStem, type TelegramMessage } from "./telegram-note";

const NOTES_DIR = "posts/notes";

/**
 * Paths the replied-to message's note could have, most specific first.
 *
 * - Album photo: the album's note, `<stem>-<media_group_id>.md`.
 * - Anything else (text or a single photo): `<stem>-<message_id>.md` when its
 *   minute was already taken, otherwise `<stem>.md`. The suffixed name is
 *   checked first — it can only be this message — because the plain name
 *   may belong to another note from the same minute.
 *
 * Forwards of your own messages are dated by their original send time, the
 * same as when they were published. Bot messages have no note of their own
 * (see parentIdFromBotReply).
 */
export function parentCandidates(
  replied: TelegramMessage,
  timeZone: string,
  ownerId?: number,
): string[] {
  if (replied.from?.is_bot) return [];
  const stem = noteStem(noteDate(replied, ownerId), timeZone);
  if (replied.media_group_id) {
    return [`${NOTES_DIR}/${stem}-${replied.media_group_id}.md`];
  }
  return [
    `${NOTES_DIR}/${stem}-${replied.message_id}.md`,
    `${NOTES_DIR}/${stem}.md`,
  ];
}

/**
 * Replying to the bot's "Published <link>" confirmation replies to the note
 * it announced. The link is usually the note's slug; if the slug lookup
 * failed at publish time, the bot printed the repo path instead, which
 * names the file directly.
 */
export function parentIdFromBotReply(
  replied: TelegramMessage,
): { slug: string } | { id: string } | null {
  if (!replied.from?.is_bot || !replied.text?.startsWith("Published")) {
    return null;
  }
  const path = /posts\/notes\/(\S+)\.md/.exec(replied.text);
  if (path) return { id: path[1] };
  const slug = /\/(\d{4}[a-z]{3}\d{2}-\d{2,})\b/.exec(replied.text);
  return slug ? { slug: slug[1] } : null;
}
