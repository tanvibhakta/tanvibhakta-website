import sharp from "sharp";

/**
 * The repo's one image profile (matches Sveltia's upload transform):
 * ≤3000px longest edge, WebP q95, all metadata stripped (orientation baked
 * in first via rotate()). Equivalent to
 * `cwebp -q 95 -m 6 -sharp_yuv` for the encoding step. q95, not 85: the
 * committed file is the source Astro re-encodes derivatives from, so this
 * buys freedom from generational loss; q100 would double the bytes for an
 * imperceptible gain.
 *
 * Shared by `pnpm img` (scripts/optimize-image.ts) and the Telegram notes
 * webhook, so every authoring path commits identical output. Throws if
 * sharp can't decode the input — callers rely on that to reject files that
 * merely claim to be images.
 */
export async function toSiteWebp(input: Buffer | string): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: 3000,
      height: 3000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 95, effort: 6, smartSubsample: true })
    .toBuffer();
}
