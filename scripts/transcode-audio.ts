/**
 * Transcode AAC audio files under public/media/audio/ to Ogg Opus.
 *
 * Sveltia uploads raw .aac files that don't decode via the browser's
 * Web Audio API, so wavesurfer can't render a waveform. This script
 * converts them to .ogg (Opus codec), rewrites any references in
 * posts/**\/*.md, and deletes the originals.
 *
 * Opus is used instead of Vorbis because it sounds better at lower
 * bitrates for voice and is universally available in ffmpeg builds.
 *
 * Runs automatically via .github/workflows/transcode-audio.yml whenever
 * audio files are pushed to main. Requires ffmpeg on PATH.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import { join, dirname, basename, extname, relative } from "node:path";
import { execFileSync } from "node:child_process";

const AUDIO_ROOT = "public/media/audio";
const POSTS_ROOT = "posts";
const TRANSCODE_EXTS = new Set([".aac"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function collectMarkdownFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(POSTS_ROOT)) {
    const full = join(POSTS_ROOT, entry);
    if (statSync(full).isDirectory()) {
      for (const file of walk(full)) {
        if (file.endsWith(".md")) out.push(file);
      }
    }
  }
  return out;
}

function publicUrl(fsPath: string): string {
  return "/" + relative("public", fsPath).split("\\").join("/");
}

function main() {
  let audioFiles: string[];
  try {
    audioFiles = walk(AUDIO_ROOT);
  } catch {
    console.log(`no ${AUDIO_ROOT} directory; nothing to do.`);
    return;
  }

  const renames = new Map<string, string>();

  for (const srcPath of audioFiles) {
    const ext = extname(srcPath).toLowerCase();
    if (!TRANSCODE_EXTS.has(ext)) continue;

    const stem = basename(srcPath, ext);
    const outPath = join(dirname(srcPath), `${stem}.ogg`);

    console.log(`transcoding: ${srcPath} → ${outPath}`);
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i", srcPath,
        "-c:a", "libopus",
        "-b:a", "64k",
        outPath,
      ],
      { stdio: "inherit" },
    );

    unlinkSync(srcPath);
    renames.set(publicUrl(srcPath), publicUrl(outPath));
  }

  if (renames.size === 0) {
    console.log("no files needed transcoding.");
    return;
  }

  // rewrite references in markdown
  let touchedPosts = 0;
  for (const mdFile of collectMarkdownFiles()) {
    const original = readFileSync(mdFile, "utf8");
    let updated = original;
    for (const [from, to] of renames) {
      if (updated.includes(from)) {
        updated = updated.split(from).join(to);
      }
    }
    if (updated !== original) {
      writeFileSync(mdFile, updated);
      touchedPosts++;
      console.log(`updated refs in: ${mdFile}`);
    }
  }

  console.log(`\ndone. transcoded ${renames.size} file(s), updated ${touchedPosts} post(s).`);
}

main();
