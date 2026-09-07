import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

/**
 * The repo's one image profile (matches Sveltia's upload transform):
 * ≤3000px longest edge, WebP q85, all metadata stripped (orientation baked
 * in first via rotate()). Equivalent to
 * `cwebp -q 85 -m 6 -sharp_yuv` for the encoding step.
 */
export async function optimizeImage(inputPath: string): Promise<string> {
  const outPath = inputPath.replace(/\.[^.]+$/, ".webp");
  await sharp(inputPath)
    .rotate()
    .resize({
      width: 3000,
      height: 3000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85, effort: 6, smartSubsample: true })
    .toFile(outPath);
  return outPath;
}

// CLI entry, guarded because — unlike new-content.ts/transcode-audio.ts,
// which are never imported — this module IS imported by its test.
const cliInput = process.argv[2];
if (cliInput && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await optimizeImage(cliInput);
  console.log(`wrote ${out}`);
  console.log(`markdown: ![](images/${basename(out)} "")`);
}
