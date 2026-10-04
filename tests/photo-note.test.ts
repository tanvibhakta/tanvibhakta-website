import { describe, expect, test } from "vitest";
import { planPhotoNote } from "../src/utils/photo-note";
import type { TelegramMessage } from "../src/utils/telegram-note";

const TZ = "Asia/Kolkata";
const OWNER = 213974271;
const SENT = Date.UTC(2026, 9, 5, 9, 2, 7) / 1000; // 14:32:07 IST

const photo = (overrides: Partial<TelegramMessage> = {}): TelegramMessage => ({
  message_id: 500,
  date: SENT,
  photo: [{ file_id: "p", width: 1280, height: 960 }],
  ...overrides,
});

// A fake branch: path → file content.
const repo =
  (files: Record<string, string> = {}) =>
  async (path: string) =>
    files[path] ?? null;

describe("planPhotoNote: single photos", () => {
  test("a captionless photo creates an image-only note", async () => {
    expect(await planPhotoNote(photo(), TZ, OWNER, repo())).toEqual({
      kind: "create",
      notePath: "posts/notes/2026-10-05-1432.md",
      imagePath: "posts/notes/images/2026-10-05-1432-500.webp",
      content:
        "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
        "![](images/2026-10-05-1432-500.webp)\n",
    });
  });

  test("a caption becomes the text below the image, with formatting", async () => {
    const plan = await planPhotoNote(
      photo({
        caption: "Why she left data journalism:",
        caption_entities: [{ type: "bold", offset: 8, length: 4 }],
      }),
      TZ,
      OWNER,
      repo(),
    );
    expect(plan.kind === "create" && plan.content).toBe(
      "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
        "![](images/2026-10-05-1432-500.webp)\n\n" +
        "Why she **left** data journalism:\n",
    );
  });

  test("a minute already taken by another note falls back to a suffix", async () => {
    const plan = await planPhotoNote(
      photo(),
      TZ,
      OWNER,
      repo({ "posts/notes/2026-10-05-1432.md": "a text note" }),
    );
    expect(plan.kind).toBe("create");
    expect(plan.notePath).toBe("posts/notes/2026-10-05-1432-500.md");
  });

  test("a redelivered photo is recognised as a duplicate", async () => {
    const existing = "...![](images/2026-10-05-1432-500.webp)...";
    for (const path of [
      "posts/notes/2026-10-05-1432.md",
      "posts/notes/2026-10-05-1432-500.md",
    ]) {
      const files: Record<string, string> = { [path]: existing };
      if (path.endsWith("-500.md")) {
        files["posts/notes/2026-10-05-1432.md"] = "a text note";
      }
      expect(await planPhotoNote(photo(), TZ, OWNER, repo(files))).toEqual({
        kind: "duplicate",
        notePath: path,
      });
    }
  });

  test("a forward of your own photo is dated when first sent", async () => {
    const plan = await planPhotoNote(
      photo({
        forward_origin: {
          type: "user",
          date: Date.UTC(2026, 8, 27, 6, 22, 24) / 1000,
          sender_user: { id: OWNER },
        },
      }),
      TZ,
      OWNER,
      repo(),
    );
    expect(plan.notePath).toBe("posts/notes/2026-09-27-1152.md");
    expect(plan.kind === "create" && plan.content).toContain(
      "publishedOn: 2026-09-27T11:52:24",
    );
  });
});

describe("planPhotoNote: albums", () => {
  const album = (id: number, caption?: string) =>
    photo({ message_id: id, media_group_id: "13579", caption });
  const albumPath = "posts/notes/2026-10-05-1432-13579.md";

  test("the first album photo creates the album's note", async () => {
    const plan = await planPhotoNote(album(501, "Rukmini"), TZ, OWNER, repo());
    expect(plan).toEqual({
      kind: "create",
      notePath: albumPath,
      imagePath: "posts/notes/images/2026-10-05-1432-501.webp",
      content:
        "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
        "![](images/2026-10-05-1432-501.webp)\n\nRukmini\n",
    });
  });

  test("later photos go on the line after the last image", async () => {
    const existing =
      "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
      "![](images/2026-10-05-1432-501.webp)\n\nRukmini\n";
    const plan = await planPhotoNote(
      album(502),
      TZ,
      OWNER,
      repo({ [albumPath]: existing }),
    );
    expect(plan).toEqual({
      kind: "append",
      notePath: albumPath,
      imagePath: "posts/notes/images/2026-10-05-1432-502.webp",
      content:
        "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
        "![](images/2026-10-05-1432-501.webp)\n" +
        "![](images/2026-10-05-1432-502.webp)\n\nRukmini\n",
    });
  });

  test("a caption on a later photo goes below the images", async () => {
    const existing =
      "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
      "![](images/2026-10-05-1432-501.webp)\n";
    const plan = await planPhotoNote(
      album(502, "late caption"),
      TZ,
      OWNER,
      repo({ [albumPath]: existing }),
    );
    expect(plan.kind === "append" && plan.content).toBe(
      "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
        "![](images/2026-10-05-1432-501.webp)\n" +
        "![](images/2026-10-05-1432-502.webp)\n\nlate caption\n",
    );
  });

  test("an album note with its images edited away still gets a gallery block", async () => {
    const existing = "---\npublishedOn: 2026-10-05T14:32:07\n---\n\ntext\n";
    const plan = await planPhotoNote(
      album(502),
      TZ,
      OWNER,
      repo({ [albumPath]: existing }),
    );
    expect(plan.kind === "append" && plan.content).toBe(
      "---\npublishedOn: 2026-10-05T14:32:07\n---\n\n" +
        "![](images/2026-10-05-1432-502.webp)\n\ntext\n",
    );
  });

  test("a redelivered album photo is a duplicate", async () => {
    const existing = "![](images/2026-10-05-1432-502.webp)";
    expect(
      await planPhotoNote(
        album(502),
        TZ,
        OWNER,
        repo({ [albumPath]: existing }),
      ),
    ).toEqual({ kind: "duplicate", notePath: albumPath });
  });
});
