import { pathToFileURL } from "node:url";
import sharp from "sharp";

const MAX_EDGE = 3000;
const RASTER_EXTENSION = /\.(jpe?g|png|webp|gif|avif|tiff?)$/i;

/**
 * Guard shared by lint-staged and CI: a raster image must be ≤3000px on
 * both edges and carry no exif/iptc/xmp metadata (the `pnpm img` profile).
 * Returns null when the file is fine; a human-readable reason otherwise.
 * SVGs and non-image files always pass — this guard only polices rasters.
 */
export async function checkImage(path: string): Promise<string | null> {
  let metadata;
  try {
    metadata = await sharp(path).metadata();
  } catch {
    // A file that CLAIMS to be a raster but sharp can't read is broken, not
    // exempt — a truncated upload must not slip past the guard.
    if (RASTER_EXTENSION.test(path)) {
      return "unreadable — corrupt or truncated?";
    }
    // Not something sharp can read — not a raster image, nothing to guard.
    return null;
  }
  if (metadata.format === "svg") return null;

  const reasons: string[] = [];
  const { width = 0, height = 0 } = metadata;
  if (width > MAX_EDGE || height > MAX_EDGE) {
    reasons.push(`${width}x${height} exceeds ${MAX_EDGE}px on an edge`);
  }
  const embedded = (["exif", "iptc", "xmp"] as const).filter(
    (kind) => metadata[kind] !== undefined,
  );
  if (embedded.length > 0) {
    reasons.push(`carries embedded metadata (${embedded.join(", ")})`);
  }
  return reasons.length > 0 ? reasons.join("; ") : null;
}

// CLI entry, guarded because this module is imported by its test.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const paths = process.argv.slice(2);
    const results = await Promise.all(
      paths.map(async (path) => ({ path, reason: await checkImage(path) })),
    );
    const failures = results.filter(({ reason }) => reason !== null);
    for (const { path, reason } of failures) {
      console.error(`✗ ${path}: ${reason}`);
    }
    if (failures.length > 0) {
      console.error(`\nFix with: pnpm img <file> (rewrites to a clean webp)`);
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
