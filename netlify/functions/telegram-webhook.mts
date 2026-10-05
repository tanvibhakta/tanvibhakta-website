import { createGitHub } from "../../src/utils/github-commit";
import { toSiteWebp } from "../../src/utils/image-profile";
import { planPhotoNote } from "../../src/utils/photo-note";
import { noteSlugFromListing } from "../../src/utils/note-slug";
import { downloadTelegramFile } from "../../src/utils/telegram-api";
import {
  buildNote,
  messageImage,
  type MessageImage,
  type TelegramMessage,
} from "../../src/utils/telegram-note";

export const config = { path: "/api/telegram-webhook" };

/**
 * Publishes Telegram DMs sent to the notes bot as entries in posts/notes/.
 *
 * Flow: Telegram POSTs every update here (registered via setWebhook with a
 * secret_token and max_connections=1, so updates — album photos included —
 * arrive one at a time). We verify the secret header, drop anything not
 * from the allowlisted user, convert the message to a note, and commit it
 * via the GitHub API — Netlify then rebuilds the site from that commit
 * like any other push.
 *
 * - Text → one note file (Contents API).
 * - Photo, or an image sent as a file → note + WebP image in one commit
 *   (Git Data API); album photos accumulate in one note. See
 *   docs/plans/2026-10-05-telegram-photo-notes-design.md.
 * - Anything else → skipped, with a reply saying so.
 *
 * Commits go to NOTES_BRANCH (default main). Deploy previews set it to the
 * PR branch, so the bot can be pointed at a preview for an end-to-end test
 * without touching production content.
 *
 * Ignored updates still return 200: any other status makes Telegram retry
 * the same update for up to 24h.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !secret ||
    req.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = await req.json();
  const message: TelegramMessage | undefined = update.message;
  if (!message) return skip("not a new message");
  if (String(message.from?.id) !== process.env.TELEGRAM_ALLOWED_USER_ID) {
    return skip("sender not allowlisted");
  }

  const image = messageImage(message);
  const note = image ? null : buildNote(message, timeZone(), ownerId());
  if (!image && !note) {
    await reply(message, "Skipped: only text and images become notes.");
    return skip("unsupported message");
  }

  // Failures ack with 200 + an error reply instead of a 500: a 500 makes
  // Telegram re-deliver for up to 24h, spamming an error reply per retry
  // and risking a surprise late publish after the sender has already
  // resent. Telling the sender and letting them resend keeps one message
  // ↔ one note.
  try {
    if (image) return await publishPhoto(message, image);
    const path = await commitTextNote(note!, message.message_id);
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

const branch = () => process.env.NOTES_BRANCH || "main";
const timeZone = () => process.env.NOTES_TZ ?? "Asia/Kolkata";
const ownerId = () => Number(process.env.TELEGRAM_ALLOWED_USER_ID);
const github = () =>
  createGitHub({
    repo: process.env.GITHUB_REPO ?? "",
    token: process.env.GITHUB_TOKEN ?? "",
  });

/**
 * Photo → note: download, convert to the site's image profile, then commit
 * the note and image together. Only the photo that creates a note replies;
 * later album photos (and Telegram redeliveries) stay silent, so an album
 * gets one confirmation.
 */
async function publishPhoto(
  message: TelegramMessage,
  image: MessageImage,
): Promise<Response> {
  const gh = github();
  const plan = await planPhotoNote(message, timeZone(), ownerId(), (path) =>
    gh.readFile(path, branch()),
  );
  if (plan.kind === "duplicate") return skip("already published");

  const original = await downloadTelegramFile(
    process.env.TELEGRAM_BOT_TOKEN ?? "",
    image,
  );
  let webp: Buffer;
  try {
    webp = await toSiteWebp(original);
  } catch {
    throw new Error("couldn't read that file as an image");
  }
  await gh.commitFiles(
    [
      { path: plan.notePath, content: plan.content },
      { path: plan.imagePath, content: webp },
    ],
    plan.kind === "create"
      ? "note: publish photo from telegram"
      : "note: add album photo from telegram",
    branch(),
  );
  if (plan.kind === "create") {
    await reply(
      message,
      `Published ${await noteLink(plan.notePath)} — live once the rebuild finishes (~2 min).`,
    );
  }
  return Response.json({ ok: true, path: plan.notePath, kind: plan.kind });
}

async function commitTextNote(
  note: { filename: string; content: string },
  messageId: number,
): Promise<string> {
  const gh = github();
  let path = `posts/notes/${note.filename}`;
  if (
    !(await gh.createFile(
      path,
      note.content,
      "note: publish from telegram",
      branch(),
    ))
  ) {
    // Filename taken (two notes in the same minute, or a Telegram retry
    // after a partial failure). The message_id suffix is deterministic per
    // message, so retries converge instead of multiplying.
    path = `posts/notes/${note.filename.replace(/\.md$/, `-${messageId}.md`)}`;
    if (
      !(await gh.createFile(
        path,
        note.content,
        "note: publish from telegram",
        branch(),
      ))
    ) {
      throw new Error(`GitHub commit failed: ${path} already exists`);
    }
  }
  return path;
}

/**
 * The public URL of a note that was just committed: its slug is its date
 * plus its position among that day's posts/notes/ — one directory listing
 * away. Falls back to the repo path if the listing fails: the
 * publish already succeeded, and a worse link must not turn it into an
 * error reply.
 */
async function noteLink(path: string): Promise<string> {
  try {
    const listing = await github().listDir("posts/notes", branch());
    const slug = noteSlugFromListing(listing, path.split("/").pop()!);
    return `${process.env.SITE_URL ?? "https://tanvibhakta.in"}/${slug}`;
  } catch (error) {
    console.error("telegram-webhook note slug failed:", error);
    return path;
  }
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
