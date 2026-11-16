// Every colour the site's source uses, for /components: where each is used,
// and its WCAG contrast against the page background. Built at build time by
// scanning src/, so it can't fall out of date. It doubles as the dark-mode
// to-do list: each hard-coded colour here needs a dark counterpart.
//
// What it can't see: opacity applied on top of a colour (Note's footer is
// opacity-75), and colours on a background other than the page's.
import fs from "node:fs";
import path from "node:path";
import { wcagContrast } from "culori";

/** The page background every ProseLayout page sits on (bg-stone-100). */
export const PAGE_BACKGROUND = "stone-100";

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
// Tailwind colour utilities: `text-stone-500`, `border-l-stone-300`, …
const UTILITY = new RegExp(
  `\\b(text|bg|border(?:-[trblxy])?|stroke|fill|decoration|outline|ring|divide|accent|caret)-((?:${PALETTE})-\\d{2,3}|primary|white|black)\\b`,
  "g",
);
// CSS custom properties: `var(--color-stone-300)`.
const VARIABLE = /var\(--color-([a-z]+(?:-\d{2,3})?)\)/g;
// Literal colours in CSS or inline styles.
const LITERAL = /oklch\([^)]*\)|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

export type Role = "text" | "non-text" | "surface";

export interface ColourUse {
  file: string;
  line: number;
  token: string;
}

export interface Colour {
  /** Tailwind name (`stone-500`), or the literal itself. */
  name: string;
  /** The resolved CSS value, e.g. `oklch(55.3% 0.013 58.071)`. */
  value: string;
  /** Text if any use colours text; surface if only used as a background
   *  (no contrast rule against the page); otherwise non-text (borders…). */
  role: Role;
  contrast: number;
  /** WCAG AA: 4.5:1 for text (1.4.3), 3:1 for non-text (1.4.11); null for
   *  surfaces, whose contrast matters against what sits on them instead. */
  threshold: number | null;
  uses: ColourUse[];
}

const utilityRole = (prefix: string): Role =>
  prefix === "text" ? "text" : prefix === "bg" ? "surface" : "non-text";

/** Role from a CSS declaration line, e.g. `color: var(--color-primary);`. */
const declarationRole = (line: string): Role =>
  /^\s*color:/.test(line)
    ? "text"
    : /^\s*background(-color)?:/.test(line)
      ? "surface"
      : "non-text";

const root = process.cwd();

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(astro|css|mjs|ts|mdx)$/.test(entry.name) ? [full] : [];
  });
}

/** `--color-*` values from Tailwind's theme plus the site's own @theme. */
function themeColours(): Map<string, string> {
  const sources = [
    path.join(root, "node_modules/tailwindcss/theme.css"),
    path.join(root, "src/styles/global.css"),
  ];
  const map = new Map<string, string>([
    ["white", "#fff"],
    ["black", "#000"],
  ]);
  for (const file of sources) {
    const css = fs.readFileSync(file, "utf8");
    for (const m of css.matchAll(/--color-([a-z]+(?:-\d{2,3})?):\s*([^;]+);/g))
      map.set(m[1], m[2].trim());
  }
  return map;
}

export function colourInventory(): Colour[] {
  const theme = themeColours();
  const background = theme.get(PAGE_BACKGROUND)!;
  const found = new Map<
    string,
    { value: string; role: Role; uses: ColourUse[] }
  >();

  const add = (name: string, value: string, role: Role, use: ColourUse) => {
    const entry = found.get(name) ?? { value, role, uses: [] };
    // Strongest claim wins: text > non-text > surface.
    const rank = { surface: 0, "non-text": 1, text: 2 };
    if (rank[role] > rank[entry.role]) entry.role = role;
    entry.uses.push(use);
    found.set(name, entry);
  };

  // The showcase and this file name colours as examples, not as styling.
  const skip = [
    path.join(root, "src/showcase"),
    path.join(root, "src/utils/colour-inventory.ts"),
  ];
  const files = walk(path.join(root, "src")).filter(
    (f) => !skip.some((s) => f.startsWith(s)),
  );

  for (const file of files) {
    const rel = path.relative(root, file);
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, i) => {
        const line = i + 1;
        for (const m of text.matchAll(UTILITY)) {
          const value = theme.get(m[2]);
          if (value)
            add(m[2], value, utilityRole(m[1]), {
              file: rel,
              line,
              token: m[0],
            });
        }
        for (const m of text.matchAll(VARIABLE)) {
          const value = theme.get(m[1]);
          const role = declarationRole(text);
          if (value) add(m[1], value, role, { file: rel, line, token: m[0] });
        }
        // Skip the theme definitions themselves (`--color-x: oklch(…)`).
        if (/--color-[a-z-\d]+:/.test(text)) return;
        for (const m of text.matchAll(LITERAL)) {
          const role = declarationRole(text);
          add(m[0], m[0], role, { file: rel, line, token: m[0] });
        }
      });
  }

  return [...found.entries()]
    .map(([name, { value, role, uses }]) => ({
      name,
      value,
      role,
      contrast: Math.round(wcagContrast(value, background) * 100) / 100,
      threshold: role === "text" ? 4.5 : role === "non-text" ? 3 : null,
      uses,
    }))
    .sort((a, b) => a.contrast - b.contrast);
}
