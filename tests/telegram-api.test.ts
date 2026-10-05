import { describe, expect, test } from "vitest";
import {
  downloadTelegramFile,
  MAX_DOWNLOAD_BYTES,
} from "../src/utils/telegram-api";

function fakeTelegram(
  getFile: unknown,
  file: Uint8Array<ArrayBuffer> = new Uint8Array([7, 8, 9]),
): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fakeFetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/getFile")) return Response.json(getFile);
    return new Response(file);
  };
  return { fetch: fakeFetch as typeof fetch, urls };
}

describe("downloadTelegramFile", () => {
  test("resolves the file path, then downloads the bytes", async () => {
    const tg = fakeTelegram({
      ok: true,
      result: { file_path: "photos/file_1.jpg" },
    });
    const bytes = await downloadTelegramFile(
      "TOKEN",
      { fileId: "abc" },
      tg.fetch,
    );
    expect([...bytes]).toEqual([7, 8, 9]);
    expect(tg.urls).toEqual([
      "https://api.telegram.org/botTOKEN/getFile?file_id=abc",
      "https://api.telegram.org/file/botTOKEN/photos/file_1.jpg",
    ]);
  });

  test("refuses files over the Bot API download cap before fetching", async () => {
    const tg = fakeTelegram({ ok: true, result: { file_path: "x" } });
    await expect(
      downloadTelegramFile(
        "T",
        { fileId: "abc", fileSize: MAX_DOWNLOAD_BYTES + 1 },
        tg.fetch,
      ),
    ).rejects.toThrow(/too large/);
    expect(tg.urls).toEqual([]);
  });

  test("surfaces a getFile error", async () => {
    const tg = fakeTelegram({
      ok: false,
      description: "Bad Request: file is too big",
    });
    await expect(
      downloadTelegramFile("T", { fileId: "abc" }, tg.fetch),
    ).rejects.toThrow(/file is too big/);
  });
});
