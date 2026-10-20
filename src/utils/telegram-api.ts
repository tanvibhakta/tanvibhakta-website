import { Buffer } from "node:buffer";
import type { MessageImage } from "./telegram-note";

// The Bot API refuses getFile downloads above 20MB.
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Downloads a file a message carries: getFile resolves its server path,
 * then the bytes come from the file endpoint. Throws (with a message fit
 * for the sender) when the file is over the cap or Telegram refuses.
 */
export async function downloadTelegramFile(
  token: string,
  image: MessageImage,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  if (image.fileSize !== undefined && image.fileSize > MAX_DOWNLOAD_BYTES) {
    throw new Error("image too large (Telegram bots can download up to 20MB)");
  }
  const res = await fetchImpl(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(image.fileId)}`,
  );
  const body = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: { file_path?: string };
  };
  if (!body.ok || !body.result?.file_path) {
    throw new Error(
      `Telegram getFile failed: ${body.description ?? res.status}`,
    );
  }
  const file = await fetchImpl(
    `https://api.telegram.org/file/bot${token}/${body.result.file_path}`,
  );
  if (!file.ok)
    throw new Error(`Telegram file download failed: ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Reacts to a message with one emoji. Bots may only use Telegram's standard
 * reaction set — 👍 is in it, ✅ is not. Throws with Telegram's reason on refusal.
 */
export async function reactToMessage(
  token: string,
  target: { chatId: number; messageId: number },
  emoji: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(
    `https://api.telegram.org/bot${token}/setMessageReaction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target.chatId,
        message_id: target.messageId,
        reaction: [{ type: "emoji", emoji }],
      }),
    },
  );
  const body = (await res.json()) as { ok: boolean; description?: string };
  if (!body.ok) {
    throw new Error(
      `Telegram setMessageReaction failed: ${body.description ?? res.status}`,
    );
  }
}
