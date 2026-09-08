import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, test } from "vitest";
import { checkImage } from "../scripts/check-image-metadata.ts";

const dir = await mkdtemp(join(tmpdir(), "img-check-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("checkImage", () => {
  test("oversized webp fails with a reason", async () => {
    const path = join(dir, "huge.webp");
    await sharp({
      create: { width: 4000, height: 500, channels: 3, background: "#888" },
    })
      .webp()
      .toFile(path);
    const reason = await checkImage(path);
    expect(reason).toMatch(/3000/);
  });

  test("exif-carrying webp fails with a reason", async () => {
    const path = join(dir, "tagged.webp");
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#555" },
    })
      .webp()
      .withExifMerge({ IFD0: { ImageDescription: "secret" } })
      .toFile(path);
    // Self-proving: the fixture must actually carry EXIF, or the failure
    // assertion below would test nothing.
    expect((await sharp(path).metadata()).exif).toBeDefined();
    const reason = await checkImage(path);
    expect(reason).toMatch(/metadata/i);
  });

  test("clean 800px webp passes", async () => {
    const path = join(dir, "clean.webp");
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#333" },
    })
      .webp()
      .toFile(path);
    expect(await checkImage(path)).toBeNull();
  });

  test("svg passes", async () => {
    const path = join(dir, "icon.svg");
    await writeFile(
      path,
      '<svg xmlns="http://www.w3.org/2000/svg" width="9000" height="9000"></svg>',
    );
    expect(await checkImage(path)).toBeNull();
  });

  test("non-image file passes", async () => {
    const path = join(dir, "notes.txt");
    await writeFile(path, "not an image at all");
    expect(await checkImage(path)).toBeNull();
  });

  test("unreadable file with a raster extension fails", async () => {
    const path = join(dir, "corrupt.jpg");
    await writeFile(path, "");
    const reason = await checkImage(path);
    expect(reason).toMatch(/unreadable/i);
  });

  test("unreadable file with a non-raster extension still passes", async () => {
    const path = join(dir, "empty.txt");
    await writeFile(path, "");
    expect(await checkImage(path)).toBeNull();
  });
});
