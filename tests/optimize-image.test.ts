import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, test } from "vitest";
import { optimizeImage } from "../scripts/optimize-image.ts";

const dir = await mkdtemp(join(tmpdir(), "img-test-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("optimizeImage", () => {
  test("resizes past 3000px, converts to webp, strips metadata", async () => {
    const input = join(dir, "big.jpg");
    await sharp({
      create: { width: 4000, height: 2000, channels: 3, background: "#888" },
    })
      .jpeg()
      .withExifMerge({ IFD0: { ImageDescription: "secret" } })
      .toFile(input);
    // Self-proving: the fixture must actually carry EXIF, or the strip
    // assertion below would pass vacuously.
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const outPath = await optimizeImage(input);
    expect(outPath).toBe(join(dir, "big.webp"));
    const meta = await sharp(outPath).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(3000);
    expect(meta.exif).toBeUndefined();
  });

  test("small images are converted but not upscaled", async () => {
    const input = join(dir, "small.png");
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#333" },
    })
      .png()
      .toFile(input);
    const outPath = await optimizeImage(input);
    expect((await sharp(outPath).metadata()).width).toBe(800);
  });

  test("webp input is optimized in place (same path)", async () => {
    const input = join(dir, "already.webp");
    await sharp({
      create: { width: 4000, height: 2000, channels: 3, background: "#555" },
    })
      .webp()
      .withExifMerge({ IFD0: { ImageDescription: "secret" } })
      .toFile(input);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const outPath = await optimizeImage(input);
    expect(outPath).toBe(input);
    const meta = await sharp(outPath).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(3000);
    expect(meta.exif).toBeUndefined();
  });
});
