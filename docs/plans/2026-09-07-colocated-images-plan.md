# Colocated Images Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Site-wide image support — colocated ≤3000px WebP files, responsive serving, gallery grouping, lightbox, feed absolutization, and guard rails — per `docs/plans/2026-09-07-colocated-images-design.md`.

**Architecture:** Images live in a sibling `images/` folder per collection and are referenced relatively from markdown. Astro ≥5.10's `image.layout: 'constrained'` emits responsive derivatives at build. A rehype plugin groups consecutive images into galleries; a dialog lightbox opens them full-size. Feeds rewrite relative srcs to absolute derivative URLs. Guards: a sharp optimize script, a metadata/size check shared by lint-staged and CI, a repo-size CI check, and a Netlify build-time Telegram alert.

**Tech Stack:** Astro 5, vitest, sharp (already a dep), unist-util-visit (already a dep), Sveltia CMS, GitHub Actions, Netlify build plugins. No new dependencies anywhere.

**Conventions to honor:** pnpm only (never npm). `rg` not `grep`. Commit messages via `git commit -F <file>` written with the Write tool (a PreToolUse hook blocks heredocs/sed-like strings). Pre-commit runs lint-staged → conditional typecheck → full vitest (including a real `astro build` in linkChecker.test.ts), so every commit is an integration test.

---

### Task 1: Astro ≥5.10 + responsive image config

**Files:**

- Modify: `package.json` / `pnpm-lock.yaml` (via CLI only)
- Modify: `astro.config.mjs`

**Step 1: Update Astro in-range**

Run: `pnpm update astro`
Then: `pnpm astro --version` — expect ≥5.10.

**Step 2: Add the image block to `astro.config.mjs`** (top level of `defineConfig`, after `site`):

```js
  image: {
    // Responsive markdown images: srcset + sizes + lazy loading for every
    // relative ![]() image. Stabilized in Astro 5.10.
    layout: "constrained",
    // The prose column is md:w-1/2 (~50vw desktop); cap candidate widths so
    // browsers don't over-fetch. 1280 is also the width feeds.ts requests,
    // keeping the feed derivative shared with this set.
    breakpoints: [640, 960, 1280, 1600, 2048],
  },
```

**Step 3: Verify with a real image**

Create a throwaway test entry with an image (any small JPEG):

```bash
mkdir -p posts/blog/images
cp <some-test-image>.jpg posts/blog/images/plan-smoke-test.jpg
```

Add `posts/blog/9999-01-01-image-smoke-test.md` with frontmatter (`title: image smoke test`, `publishedOn: 9999-01-01`, `draft: true`) and body `![smoke](images/plan-smoke-test.jpg)`.

Run: `pnpm build`
Then: `rg -o 'srcset="[^"]*"' dist/drafts/blog/9999-01-01-image-smoke-test/index.html | head -1`
Expected: a srcset with multiple `/_astro/…webp` candidates. Delete the throwaway post + image afterwards (keep for Tasks 2–5 if convenient; delete before the final commit of Task 13).

**Step 4: Typecheck + tests**

Run: `pnpm typecheck` and `pnpm vitest run` — both green.

**Step 5: Commit** (`feat: responsive images via constrained layout`)

---

### Task 2: Gallery grouping rehype plugin (TDD)

**Files:**

- Create: `src/plugins/rehype-gallery.mjs`
- Test: `tests/rehype-gallery.test.ts`

Model the test harness on `tests/rehype-anchors.test.ts` (plain hast trees, call the plugin's transformer directly — no unified pipeline needed).

**Behavior spec.** Input shapes (both must group, because `remark-breaks` turns adjacent lines into `<br>` inside one `<p>`):

- One `<p>` containing only `<img>`s, `<br>`s, and whitespace text → one gallery.
- A run of ≥1 consecutive such paragraphs → one gallery spanning the run.

Output per group:

```html
<figure class="gallery" data-count="N">
  <img … />
  <img … />
</figure>
```

- `<br>`s and whitespace dropped.
- An `<img>` with a `title` attribute contributes `<figcaption>` (first title in the group wins; the `title` attr stays on the img — the lightbox reuses it).
- A single image still wraps (count 1) so CSS/lightbox treat all post images uniformly.
- A paragraph with any non-whitespace text or non-img element is left alone.
- Runs are broken by any intervening non-image node (prose, heading, hr).
- **`sizes` rewrite (from Task 1 review):** the plugin sets a `sizes`
  property on each grouped img reflecting actual render width — Astro's
  default derives `sizes` from intrinsic width and over-fetches ~2x on the
  `md:w-1/2` column. Values by group count (grid: 1 col; 2 cols for
  count≥2; 3 cols at ≥768px for count≥3):
  - count 1 → `(min-width: 768px) 50vw, 100vw`
  - count 2 → `(min-width: 768px) 25vw, 50vw`
  - count ≥3 → `(min-width: 768px) 17vw, 50vw`
    Add a test asserting the property. **Empirical caveat:** Astro's own
    image rewriting runs after this plugin and may override `sizes`; Task 3's
    build check must confirm the emitted HTML honors it — if Astro wins,
    remove the rewrite (and its test) and note that in the Task 3 commit.

**Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { rehypeGallery } from "../src/plugins/rehype-gallery.mjs";

type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
};
type HastText = { type: "text"; value: string };
type HastNode = HastElement | HastText;

function elem(
  tagName: string,
  properties: Record<string, unknown> = {},
  children: HastNode[] = [],
): HastElement {
  return { type: "element", tagName, properties, children };
}
const text = (value: string): HastText => ({ type: "text", value });
const img = (src: string, extra: Record<string, unknown> = {}) =>
  elem("img", { src, ...extra });
const p = (...children: HastNode[]) => elem("p", {}, children);

function run(children: HastNode[]) {
  const tree = { type: "root" as const, children };
  rehypeGallery()(tree);
  return tree.children as HastElement[];
}

describe("rehypeGallery", () => {
  test("single image paragraph becomes a count-1 gallery", () => {
    const out = run([p(img("images/a.webp"))]);
    expect(out).toHaveLength(1);
    expect(out[0].tagName).toBe("figure");
    expect(out[0].properties.className).toEqual(["gallery"]);
    expect(out[0].properties.dataCount).toBe(1);
    expect(out[0].children.map((c) => (c as HastElement).tagName)).toEqual([
      "img",
    ]);
  });

  test("adjacent-line images (one <p> with <br>) group; br dropped", () => {
    const out = run([
      p(img("images/a.webp"), elem("br"), text("\n"), img("images/b.webp")),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].properties.dataCount).toBe(2);
    expect(out[0].children.map((c) => (c as HastElement).tagName)).toEqual([
      "img",
      "img",
    ]);
  });

  test("consecutive image paragraphs merge into one gallery", () => {
    const out = run([p(img("images/a.webp")), p(img("images/b.webp"))]);
    expect(out).toHaveLength(1);
    expect(out[0].properties.dataCount).toBe(2);
  });

  test("prose between images breaks the group", () => {
    const out = run([
      p(img("images/a.webp")),
      p(text("hello")),
      p(img("images/b.webp")),
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].properties.dataCount).toBe(1);
    expect(out[1].tagName).toBe("p");
    expect(out[2].properties.dataCount).toBe(1);
  });

  test("paragraph mixing text and image is untouched", () => {
    const out = run([p(text("look: "), img("images/a.webp"))]);
    expect(out[0].tagName).toBe("p");
  });

  test("first title attribute becomes the figcaption", () => {
    const out = run([
      p(
        img("images/a.webp", { title: "Chai break" }),
        elem("br"),
        img("images/b.webp"),
      ),
    ]);
    const caption = out[0].children.at(-1) as HastElement;
    expect(caption.tagName).toBe("figcaption");
    expect((caption.children[0] as HastText).value).toBe("Chai break");
  });
});
```

(`dataCount` as a hast property serializes to `data-count="N"` — verified:
`property-information` kebab-cases any `data[A-Z]…` name generically.)

**Step 2: Run to verify failure**

Run: `pnpm vitest run tests/rehype-gallery.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `src/plugins/rehype-gallery.mjs`**

```js
/**
 * Groups consecutive image-only paragraphs (and images separated only by
 * <br> within one paragraph — remark-breaks turns adjacent lines into
 * <br>s) into <figure class="gallery" data-count="N"> containers.
 *
 * Must run BEFORE rehypeAnchors in markdown.rehypePlugins: anchors target
 * every <p>, and grouping first removes image paragraphs from its reach.
 *
 * A markdown image title (`![alt](src "title")`) becomes the group's
 * <figcaption>; the first titled image in a group wins.
 */
export function rehypeGallery() {
  return (tree) => {
    walk(tree);
  };
}

function walk(parent) {
  if (!parent.children) return;
  const out = [];
  let runImages = [];

  const flush = () => {
    if (runImages.length === 0) return;
    out.push(galleryFigure(runImages));
    runImages = [];
  };

  for (const node of parent.children) {
    const images = imageOnlyParagraph(node);
    if (images) {
      runImages.push(...images);
    } else {
      flush();
      out.push(node);
      walk(node);
    }
  }
  flush();
  parent.children = out;
}

// The images of a <p> containing only imgs, brs, and whitespace — else null.
function imageOnlyParagraph(node) {
  if (node.type !== "element" || node.tagName !== "p") return null;
  const images = [];
  for (const child of node.children) {
    if (child.type === "element" && child.tagName === "img") {
      images.push(child);
    } else if (child.type === "element" && child.tagName === "br") {
      continue;
    } else if (child.type === "text" && child.value.trim() === "") {
      continue;
    } else {
      return null;
    }
  }
  return images.length > 0 ? images : null;
}

function galleryFigure(images) {
  const title = images.find((i) => i.properties?.title)?.properties.title;
  const children = [...images];
  if (title) {
    children.push({
      type: "element",
      tagName: "figcaption",
      properties: {},
      children: [{ type: "text", value: String(title) }],
    });
  }
  return {
    type: "element",
    tagName: "figure",
    properties: { className: ["gallery"], dataCount: images.length },
    children,
  };
}
```

**Step 4: Run tests** — `pnpm vitest run tests/rehype-gallery.test.ts` → PASS.

**Step 5: Commit** (`feat: rehype plugin grouping consecutive images into galleries`)

---

### Task 3: Register the plugin (ORDER MATTERS)

**Files:**

- Modify: `astro.config.mjs`

**Step 1:** Import and register **before `rehypeSlug`** (i.e. first in `rehypePlugins` — definitely before `rehypeAnchors`, see plugin comment):

```js
import { rehypeGallery } from "./src/plugins/rehype-gallery.mjs";
// …
    rehypePlugins: [
      rehypeGallery,
      rehypeSlug,
      // …existing entries unchanged
```

**Step 2: Verify against the smoke-test post** — give it two adjacent image lines, run `pnpm build`, and check:

Run: `rg -o '<figure class="gallery"[^>]*'  dist/drafts/blog/9999-01-01-image-smoke-test/index.html`
Expected: `data-count="2"`, and no `anchor-link` inside the figure.

**Note:** content is cached — if the rebuilt HTML looks stale, delete `node_modules/.astro/data-store.json` and rebuild (known repo behavior).

**Step 3: Full tests** (`pnpm vitest run`) then **commit** (`feat: enable gallery grouping in markdown pipeline`).

---

### Task 4: Gallery styles

**Files:**

- Modify: `src/styles/global.css`

Plugin-emitted classes belong in global.css (per CLAUDE.md styling rules — these elements have no component to carry Tailwind classes).

**Step 1: Add:**

```css
/* Galleries emitted by rehype-gallery (src/plugins/rehype-gallery.mjs). */
.prose figure.gallery {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(var(--gallery-cols, 1), 1fr);
}
.prose figure.gallery[data-count="2"] {
  --gallery-cols: 2;
}
.prose figure.gallery[data-count="3"],
.prose figure.gallery[data-count="4"],
.prose figure.gallery[data-count="5"],
.prose figure.gallery[data-count="6"] {
  --gallery-cols: 2;
}
@media (min-width: 48rem) {
  .prose figure.gallery[data-count="3"],
  .prose figure.gallery[data-count="4"],
  .prose figure.gallery[data-count="5"],
  .prose figure.gallery[data-count="6"] {
    --gallery-cols: 3;
  }
}
.prose figure.gallery img {
  margin: 0;
  width: 100%;
  cursor: zoom-in;
}
.prose figure.gallery[data-count]:not([data-count="1"]) img {
  aspect-ratio: 1;
  object-fit: cover;
}
.prose figure.gallery figcaption {
  grid-column: 1 / -1;
}
```

**Step 2:** `pnpm dev`, open the smoke-test draft, eyeball 1/2/3-image variants (single image full-width and uncropped; multi-image rows tidy).

**Step 3: Commit** (`feat: gallery grid styles`)

---

### Task 5: Lightbox

**Files:**

- Create: `src/components/Lightbox.astro`
- Modify: `src/layouts/Layout.astro` (render `<Lightbox />` just before `</body>`)

Native `<dialog>` + scroll-snap; no library. Progressive: without JS images render in place; the dialog full-view shows the largest derivative (browser pinch-zoom works inside it).

**Step 1: Create the component:**

```astro
---
// Full-screen viewer for post images. Collects every .prose img at load,
// opens a <dialog> scroll-snap strip on click, starting at the tapped image.
// The largest srcset candidate is used for the full view.
---

<dialog id="lightbox" class="lightbox">
  <div class="lightbox-strip" id="lightbox-strip"></div>
</dialog>

<script>
  const dialog = document.getElementById("lightbox") as HTMLDialogElement;
  const strip = document.getElementById("lightbox-strip")!;
  const proseImages = [
    ...document.querySelectorAll<HTMLImageElement>(".prose img"),
  ];

  const largestSource = (img: HTMLImageElement): string => {
    const candidates = img.srcset
      .split(",")
      .map((c) => c.trim().split(/\s+/))
      .filter((parts) => parts[0]);
    if (candidates.length === 0) return img.src;
    candidates.sort((a, b) => parseInt(b[1] ?? "0") - parseInt(a[1] ?? "0"));
    return candidates[0][0];
  };

  if (dialog && proseImages.length > 0) {
    proseImages.forEach((img, index) => {
      img.addEventListener("click", () => {
        strip.replaceChildren(
          ...proseImages.map((source) => {
            const full = document.createElement("img");
            full.src = largestSource(source);
            full.alt = source.alt;
            if (source.title) full.title = source.title;
            return full;
          }),
        );
        dialog.showModal();
        strip.children[index]?.scrollIntoView({ inline: "center" });
      });
    });
    // Click on the backdrop (the dialog itself, not an img) closes.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target === strip) dialog.close();
    });
  }
</script>

<style>
  .lightbox {
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    border: none;
    padding: 0;
    background: rgb(0 0 0 / 0.92);
  }
  .lightbox-strip {
    display: flex;
    height: 100%;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
  }
  .lightbox-strip :global(img) {
    flex: 0 0 100%;
    height: 100%;
    object-fit: contain;
    scroll-snap-align: center;
  }
</style>
```

**Step 2:** In `Layout.astro`, import and render `<Lightbox />` before `</body>`.

**Step 3: Manual verification** in `pnpm dev` on the smoke-test draft: click opens dialog at the clicked image, Esc and backdrop-click close, swiping snaps between images. Check a page with no images loads with no console errors.

**Important:** `pnpm typecheck` does NOT parse `.astro` `<script>` blocks (verified — bare `tsc` skips them, and `astro check` isn't in this repo's toolchain), so the manual browser check is the only gate for this component. Be thorough here.

**Step 4: Commit** (`feat: dialog lightbox for post images`)

---

### Task 6: digital-garden excerpt fix (TDD)

**Files:**

- Modify: `src/pages/digital-garden/index.astro` (`extractFirstParagraph`, lines ~11–26)

The helper takes the first non-blank, non-`#` raw line as a fallback description — an image-leading post would show literal `![...](…)`. Skip image lines too: extend the existing line-rejection logic with `/^!\[/`. The helper lives in the .astro frontmatter; extract it to `src/utils/collections.ts` ONLY if a test is otherwise impossible — prefer the minimal in-place edit plus a manual check with the smoke-test entry moved to digital-garden shape. (If extracted, mirror an existing util test in `tests/collections.test.ts`.)

Verify: temporary digital-garden entry starting with an image, `pnpm dev`, `/digital-garden` shows the post's first _text_ line as the blurb. **Delete the temporary entry before committing.** Commit (`fix: skip image lines in digital-garden excerpts`).

---

### Task 7: Feed image absolutization (TDD)

**Files:**

- Create: `src/utils/feed-images.ts` (pure sync rewriter — NO astro imports)
- Create: `src/utils/feed-image-map.ts` (async resolver — imports `astro:assets`)
- Modify: `src/utils/feeds.ts`
- Test: `tests/feed-images.test.ts` (+ extend `tests/feeds.test.ts` mocks)

**Module split rationale (load-bearing):** `astro:assets` is a virtual module
only resolvable inside Astro's Vite pipeline — plain vitest cannot import it
(verified: it errors at load). So the pure rewriter lives in its own module
with no Astro imports, and only `feed-image-map.ts` touches `astro:assets`.
`tests/feed-images.test.ts` imports ONLY the pure module; `tests/feeds.test.ts`
(which transitively pulls in the resolver via `feeds.ts`) must add
`vi.mock("astro:assets", () => ({ getImage: vi.fn(async () => ({ src: "/_astro/mock.webp" })) }))`
alongside its existing `astro:content` mock.

**Step 1: Failing tests** for the pure rewrite step (no Astro imports needed):

```ts
import { describe, expect, test } from "vitest";
import { absolutizeImages } from "../src/utils/feed-images";

describe("absolutizeImages", () => {
  const map = new Map([
    ["images/chai.webp", "https://tanvibhakta.in/_astro/chai.abc_1280.webp"],
  ]);

  test("relative srcs are rewritten through the map", () => {
    const html = '<p><img src="images/chai.webp" alt="chai"></p>';
    expect(absolutizeImages(html, map)).toContain(
      'src="https://tanvibhakta.in/_astro/chai.abc_1280.webp"',
    );
  });

  test("absolute srcs pass through", () => {
    // toContain, not toBe: sanitize-html re-serializes void elements
    // ("<img …>" becomes "<img … />"), so byte-exact comparison fails.
    const html = '<img src="https://elsewhere.example/x.png">';
    expect(absolutizeImages(html, map)).toContain(
      'src="https://elsewhere.example/x.png"',
    );
  });

  test("unresolvable relative srcs are dropped rather than emitted broken", () => {
    const html = '<p>hi</p><img src="images/missing.webp">';
    expect(absolutizeImages(html, map)).toBe("<p>hi</p>");
  });
});
```

**Step 2:** Run → FAIL (module not found).

**Step 3: Implement.**

`src/utils/feed-images.ts` — the pure rewriter (sanitize-html is already a
dependency, so parsing stays consistent with `markdownToHtml`):

```ts
import sanitizeHtml from "sanitize-html";

/** Rewrite relative img srcs through the map; drop unresolvable ones. */
export function absolutizeImages(
  html: string,
  map: Map<string, string>,
): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        if (/^(https?:)?\/\//.test(src) || src.startsWith("/")) {
          return { tagName, attribs };
        }
        const resolved = map.get(src);
        // Renaming to a non-allowlisted tag makes sanitize-html discard
        // the element — that alone is the drop mechanism (an
        // exclusiveFilter would never even fire for a discarded tag).
        return resolved
          ? { tagName, attribs: { ...attribs, src: resolved } }
          : { tagName: "dropped-img", attribs: {} };
      },
    },
  });
}
```

`src/utils/feed-image-map.ts` — the build-only resolver:

```ts
import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import { SITE_URL } from "./site";

const FEED_IMAGE_WIDTH = 1280; // from image.breakpoints — shares the derivative

// Every colocated content image, keyed by site-root path. The shape
// { default: ImageMetadata } is produced by Astro's asset Vite plugin at
// build; under vitest this module is only ever reached via the
// astro:assets mock in tests/feeds.test.ts. Perf note: this eager glob
// imports every content image at module load — if vitest runs ever get
// slow as the image library grows, convert to lazy glob + await.
const sources = import.meta.glob<{ default: ImageMetadata }>(
  "/posts/**/images/*",
  { eager: true },
);

/**
 * Map of an entry's relative image references ("images/foo.webp") to
 * absolute optimized URLs. entryFilePath is entry.filePath from the glob
 * loader, e.g. "posts/blog/2026-09-07-my-post.md" (root-relative POSIX —
 * verified in Astro's glob loader source).
 */
export async function entryImageMap(
  entryFilePath: string | undefined,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!entryFilePath) return map;
  const dir = entryFilePath.replace(/[^/]+$/, "");
  for (const [path, module] of Object.entries(sources)) {
    if (!path.startsWith(`/${dir}images/`)) continue;
    const relative = path.slice(dir.length + 1);
    const image = await getImage({
      src: module.default,
      width: FEED_IMAGE_WIDTH,
    });
    map.set(relative, new URL(image.src, SITE_URL).href);
  }
  return map;
}
```

**Step 4:** In `feeds.ts`, both `generateMainFeed` and `generateCollectionFeed` item mappers become async: `content: absolutizeImages(markdownToHtml(entry.body), await entryImageMap(entry.filePath))` (use `Promise.all` over the map callbacks). Extend the `TestEntry` type/mocks in `tests/feeds.test.ts` with `filePath`, and add `vi.mock("astro:assets", …)` returning a fake `getImage`.

**Step 5:** `pnpm vitest run` → PASS. Build once (`pnpm build`) and inspect `dist/blog/feed.xml` (or main `feed.xml`) with the smoke-test entry present: img src is absolute. **Commit** (`feat: absolute optimized image URLs in feeds`).

---

### Task 8: `pnpm img` optimize script (TDD)

**Files:**

- Create: `scripts/optimize-image.ts`
- Modify: `package.json` (add script `"img": "node scripts/optimize-image.ts"`)
- Test: `tests/optimize-image.test.ts`

**Step 1: Failing test** (generate fixtures with sharp itself; write to a temp dir via `fs.mkdtemp`):

```ts
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
});
```

**Step 2:** Run → FAIL.

**Step 3: Implement** — export the function; CLI entry at the bottom:

```ts
import { basename } from "node:path";
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

const cliInput = process.argv[2];
if (cliInput && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await optimizeImage(cliInput);
  console.log(`wrote ${out}`);
  console.log(`markdown: ![](images/${basename(out)} "")`);
}
```

(Add `import { pathToFileURL } from "node:url";` to the imports. The guard is
needed because — unlike `scripts/new-content.ts` / `scripts/transcode-audio.ts`,
which are never imported and so carry no guard — this module IS imported by its
test. `pathToFileURL` comparison is the canonical form. Node ≥24 runs TS
directly; that's why `pnpm img` can be plain `node`.)

**Step 4:** Tests PASS; try the CLI once on a real photo. **Step 5: Commit** (`feat: pnpm img optimize script`).

---

### Task 9: Image guard for lint-staged + CI (TDD)

**Files:**

- Create: `scripts/check-image-metadata.ts`
- Modify: `package.json` (lint-staged block)
- Test: `tests/check-image-metadata.test.ts`

**Behavior:** given file paths, exit non-zero (with a helpful message naming `pnpm img`) if any raster image is wider/taller than 3000px OR carries exif/iptc/xmp metadata. SVGs and non-image files pass. Export a `checkImage(path): Promise<string | null>` (null = ok, string = failure reason) for tests; CLI maps over argv and exits 1 if any fail.

**Tests:** same sharp-fixture approach as Task 8 — an oversized webp fails, an exif-carrying webp fails (`.keepExif()`/`.withExifMerge` to plant it), a clean 800px webp passes.

**lint-staged wiring** in `package.json` (keys are globs relative to repo root; entries run with staged file paths appended):

```json
  "lint-staged": {
    "*.{js,jsx,ts,tsx,json,css,scss,md,astro}": [
      "prettier --write"
    ],
    "posts/**/images/*": [
      "node scripts/check-image-metadata.ts"
    ]
  }
```

Verify manually: stage an oversized jpeg under `posts/blog/images/`, attempt a commit, expect the block message; unstage. **Commit** (`feat: pre-commit guard for oversized or metadata-carrying images`).

---

### Task 10: CI checks — EXIF backstop + repo size

**Files:**

- Modify: `.github/workflows/content-validation.yml`

Append two steps to the existing `validate` job (it already checks out, installs pnpm, and runs on `posts/**` pushes — sharp is in node_modules after `pnpm install`):

```yaml
- name: Image metadata / size backstop (detects, does not block deploys)
  run: |
    # -print0/-0: null-delimited so filenames with spaces survive;
    # --no-run-if-empty so zero images is a pass, not an error.
    find posts -path '*/images/*' -type f -print0 |
      xargs -0 --no-run-if-empty node scripts/check-image-metadata.ts

- name: Repo size threshold (R2 trigger at 750MB)
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    size_kb=$(gh api "repos/${GITHUB_REPOSITORY}" --jq .size)
    echo "repo size: ${size_kb} KB"
    if [ "$size_kb" -gt 768000 ]; then
      echo "::error::Repo exceeds 750MB — time to design the R2 originals split (see docs/plans/2026-09-07-colocated-images-design.md)"
      exit 1
    fi
```

Verify YAML with `gh workflow view` after push, or minimally by running the find/node line locally. Note per the design: these detect and email (GitHub notifies the pusher on failure) — they do not gate the Netlify deploy. **Commit** (`ci: image metadata backstop and repo-size threshold`).

---

### Task 11: Netlify build-time alert plugin

**Files:**

- Create: `netlify/plugins/build-time-alert/manifest.yml`
- Create: `netlify/plugins/build-time-alert/index.mjs`
- Modify: `netlify.toml`

**manifest.yml:**

```yaml
name: build-time-alert
```

**index.mjs:**

```js
// Telegrams the site owner when the build phase runs long — the canary for
// image-processing regressions. Best-effort by design: an alert failure
// must never fail the deploy, so everything is wrapped and onEnd never throws.
const startedAt = { time: null };

export const onPreBuild = () => {
  startedAt.time = Date.now();
};

export const onEnd = async () => {
  try {
    const threshold = Number(process.env.BUILD_TIME_ALERT_SECONDS ?? 120);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ALLOWED_USER_ID;
    if (!startedAt.time || !token || !chatId) return;
    const elapsed = Math.round((Date.now() - startedAt.time) / 1000);
    if (elapsed <= threshold) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `⚠️ tanvibhakta.in build took ${elapsed}s (threshold ${threshold}s) — commit ${process.env.COMMIT_REF?.slice(0, 7) ?? "?"}`,
      }),
    });
  } catch (error) {
    console.error("build-time-alert failed (non-fatal):", error);
  }
};
```

**netlify.toml** addition:

```toml
[[plugins]]
  package = "./netlify/plugins/build-time-alert"
```

`TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALLOWED_USER_ID` already exist in Netlify env (used by the webhook function); the chat ID equals the allowed user ID for a DM bot — verify once against the webhook env before relying on it. Local verification: none beyond syntax (plugin runs only on Netlify); after deploy, check the build log lists the plugin. Optionally set `BUILD_TIME_ALERT_SECONDS=1` in Netlify UI for one deploy to see the alert fire, then remove. **Commit** (`feat: netlify plugin alerting on slow builds`).

---

### Task 12: Sveltia config

**Files:**

- Modify: `public/admin/config.yml`

**Step 1:** Add to EACH of the six collections (blog, poetry, weeknotes, digitalGarden, notes, pages), right after its `folder:` line:

```yaml
media_folder: images
public_folder: images
```

**Step 2:** Extend the existing `media_libraries.default.config.transformations.raster_image` with:

```yaml
width: 3000
height: 3000
```

**Step 3: Smoke test** (needs the local backend): `pnpm dev`, open `/admin`, create a draft blog post, drag a large NON-SQUARE jpeg into the body. Confirm: file lands in `posts/blog/images/`, reference inserted is `images/<name>.webp`, image is ≤3000px on its long edge and NOT distorted/cropped square (this verifies the width+height bounding-box assumption flagged in review — if it crops, drop `height` and keep `width` only), and no EXIF (`node scripts/check-image-metadata.ts posts/blog/images/<name>.webp`).

**Step 4: Commit** (`feat: sveltia colocated image uploads with size cap`).

---

### Task 13: Docs + cleanup + final verification

**Files:**

- Modify: `README.md` (commands section: `pnpm img`), `CLAUDE.md` (short "Images" note pointing at the design doc: colocated `images/` folders, relative refs, ≤3000px WebP, adjacency = album)
- Delete: the Task-1 smoke-test post + image (unless promoted to a real fixture — if kept, move under a `_`-prefixed draft the sitemap already excludes)

**Final gate (run bare, never through tail/head):**

```bash
pnpm typecheck
pnpm vitest run
pnpm build
```

All green → commit (`docs: image conventions`), then push the branch and open the PR (body written with the Write tool, `gh pr create --body-file`).

---

## Execution notes

- Tasks 2→5 depend on 1 (need ≥5.10 output to verify against). Tasks 6–12 are independent of each other and of 2–5; execute in order anyway — cheap, and keeps review simple.
- Every commit runs the full vitest suite including a real `astro build` (linkChecker), so a broken image pipeline cannot be committed silently.
- If any Astro ≥5.10 behavior differs from this plan's expectations (srcset shape, markdown image handling), STOP and re-verify against the design doc rather than adapting tests to match wrong output.
