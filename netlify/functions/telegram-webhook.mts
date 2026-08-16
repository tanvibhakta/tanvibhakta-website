import { Buffer } from "node:buffer";
import {
  buildNote,
  noteNumberFromListing,
  type NoteFile,
  type TelegramMessage,
} from "../../src/utils/telegram-note";

export const config = { path: "/api/telegram-webhook" };

/**
 * Publishes Telegram DMs sent to the notes bot as entries in posts/notes/.
 *
 * Flow: Telegram POSTs every update here (registered via setWebhook with a
 * secret_token). We verify the secret header, drop anything not a plain text
 * DM from the allowlisted user, convert it to a note file, and commit it to
 * the repo via the GitHub Contents API — Netlify then rebuilds the site from
 * that commit like any other push.
 *
 * Ignored updates still return 200: any other status makes Telegram retry
 * the same update for up to 24h.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = await req.json();
  const message: TelegramMessage | undefined = update.message;
  if (!message) return skip("not a new message");
  if (String(message.from?.id) !== process.env.TELEGRAM_ALLOWED_USER_ID) {
    return skip("sender not allowlisted");
  }

  const note = buildNote(message, process.env.NOTES_TZ ?? "Asia/Kolkata");
  if (!note) {
    await reply(message, "Skipped: only plain-text messages become notes.");
    return skip("no text");
  }

  // Failures ack with 200 + an error reply instead of a 500: a 500 makes
  // Telegram re-deliver for up to 24h, spamming an error reply per retry
  // and risking a surprise late publish after the sender has already
  // resent. Telling the sender and letting them resend keeps one message
  // ↔ one note.
  try {
    const path = await commitNote(note, message.message_id);
    await reply(
      message,
      `Published ${await noteLink(path)} — live once the rebuild finishes (~2 min).`,
    );
    return Response.json({ ok: true, path });
  } catch (error) {
    console.error("telegram-webhook publish failed:", error);
    await reply(
      message,
      `❌ Not published — ${error instanceof Error ? error.message : "unknown error"}. Nothing was saved; resend the message to retry.`,
    );
    return Response.json({ ok: false, error: "publish failed" });
  }
};

const skip = (reason: string) => Response.json({ ok: true, skipped: reason });

/**
 * The public URL of the note that was just committed. Notes get sequential
 * numeric slugs by publish order, so the newest note's number is the count
 * of files now in posts/notes/ — one directory listing away. Falls back to
 * the repo path if the listing fails: the publish already succeeded, and a
 * worse link must not turn it into an error reply.
 */
async function noteLink(path: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/posts/notes?ref=main`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "tanvibhakta-notes-webhook",
        },
      },
    );
    if (!res.ok) throw new Error(`listing failed: ${res.status}`);
    const listing: { name: string }[] = await res.json();
    const number = noteNumberFromListing(listing.map((f) => f.name));
    return `${process.env.SITE_URL ?? "https://tanvibhakta.in"}/notes/${number}`;
  } catch (error) {
    console.error("telegram-webhook note numbering failed:", error);
    return path;
  }
}

async function commitNote(note: NoteFile, messageId: number): Promise<string> {
  const put = async (path: string) =>
    fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "tanvibhakta-notes-webhook",
        },
        body: JSON.stringify({
          message: `note: publish from telegram`,
          content: Buffer.from(note.content).toString("base64"),
          branch: "main",
        }),
      },
    );

  let path = `posts/notes/${note.filename}`;
  let res = await put(path);
  if (res.status === 422) {
    // Filename taken (two notes in the same minute, or a Telegram retry
    // after a partial failure). The message_id suffix is deterministic per
    // message, so retries converge instead of multiplying.
    path = `posts/notes/${note.filename.replace(/\.md$/, `-${messageId}.md`)}`;
    res = await put(path);
  }
  if (!res.ok) {
    throw new Error(`GitHub commit failed: ${res.status} ${await res.text()}`);
  }
  return path;
}

// Confirmation back to the sender; best-effort, never fails the publish.
async function reply(message: TelegramMessage, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !message.chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: message.chat.id, text }),
    });
  } catch {
    // Publishing succeeded; a lost confirmation is not worth a retry loop.
  }
}
