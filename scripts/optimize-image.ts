import { rename, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { toSiteWebp } from "../src/utils/image-profile.ts";

/**
 * Converts a file on disk to the repo's image profile (see toSiteWebp),
 * writing `<name>.webp` next to it.
 */
export async function optimizeImage(inputPath: string): Promise<string> {
  const outPath = inputPath.replace(/\.[^.]+$/, ".webp");
  // Written to a temp sibling and renamed when converting in place (a .webp
  // input, or an extensionless path where replace() is a no-op), so a
  // failed encode never truncates the original.
  const inPlace = outPath === inputPath;
  const writePath = inPlace ? `${outPath}.optimizing.tmp` : outPath;
  await writeFile(writePath, await toSiteWebp(inputPath));
  if (inPlace) await rename(writePath, outPath);
  return outPath;
}

// CLI entry, guarded because — unlike new-content.ts/transcode-audio.ts,
// which are never imported — this module IS imported by its test.
const cliInput = process.argv[2];
if (cliInput && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const out = await optimizeImage(cliInput);
    console.log(`wrote ${out}`);
    console.log(`markdown: ![](images/${basename(out)} "")`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
