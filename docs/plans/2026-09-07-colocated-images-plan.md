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

Add `posts/blog/9999-01-01-image-smoke-test.md` with frontmatter (`title: image smoke test`, `publishedOn: 9999-01-01`, `draft: true`) and body `![smoke](images/plan-smoke-test.jpg)`. (Superseded by numbered fixtures: `plan-smoke-test.jpg` was later replaced by 13 distinct sharp-generated images `plan-smoke-01.jpg`…`plan-smoke-13.jpg` — one per smoke-post slot — so lightbox navigation is visually verifiable.)

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
    // mdast-util-to-hast emits a "\n" text node between block siblings,
    // so this is the shape real trees carry.
    const out = run([
      p(img("images/a.webp")),
      text("\n"),
      p(img("images/b.webp")),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].properties.dataCount).toBe(2);
  });

  test("prose between images breaks the group", () => {
    const out = run([
      p(img("images/a.webp")),
      text("\n"),
      p(text("hello")),
      text("\n"),
      p(img("images/b.webp")),
    ]);
    // [figure, p, "\n", figure]: the newline after the first image
    // paragraph is consumed with its run; the one after the prose survives.
    expect(out).toHaveLength(4);
    expect(out[0].properties.dataCount).toBe(1);
    expect(out[1].tagName).toBe("p");
    expect(out[3].properties.dataCount).toBe(1);
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
    } else if (
      runImages.length > 0 &&
      node.type === "text" &&
      node.value.trim() === ""
    ) {
      // mdast-util-to-hast emits interstitial "\n" text nodes between block
      // siblings, so blank-line-separated image paragraphs arrive with a
      // newline between them. While a run is open, whitespace-only text is
      // run-neutral: skipped, not emitted, not run-breaking.
      continue;
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

**Step 2: Verify against the smoke-test post** — give it BOTH shapes: two adjacent image lines, and two images separated by a blank line (blank-line paragraphs arrive with an interstitial `"\n"` text node between them in the real pipeline, so this shape must also merge). Run `pnpm build`, and check:

Run: `rg -o '<figure class="gallery"[^>]*'  dist/drafts/blog/9999-01-01-image-smoke-test/index.html`
Expected: `data-count="2"` for the adjacent-lines pair AND `data-count="2"` for the blank-line-separated pair (two figures total, each count 2), and no `anchor-link` inside either figure.

**Note:** content is cached — if the rebuilt HTML looks stale, delete `node_modules/.astro/data-store.json` and rebuild (known repo behavior).

**Step 3: Full tests** (`pnpm vitest run`) then **commit** (`feat: enable gallery grouping in markdown pipeline`).

---

### Task 4: Gallery styles

**Files:**

- Modify: `src/styles/global.css`

Plugin-emitted classes belong in global.css (per CLAUDE.md styling rules — these elements have no component to carry Tailwind classes).

**Review deviation (Task 4/5 code review):** the column rules originally
enumerated `data-count="2"`…`"6"`, which silently degraded galleries of 7+
to one column while still square-cropping them. Replaced with open-ended
`:not()` selectors — 2 columns for anything above count 1, 3 columns at
≥48rem for anything above count 2. Counts 1/2/3 behave identically to the
enumerated version.

**Step 1: Add:**

```css
/* Galleries emitted by rehype-gallery (src/plugins/rehype-gallery.mjs). */
.prose figure.gallery {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(var(--gallery-cols, 1), 1fr);
}
.prose figure.gallery:not([data-count="1"]) {
  --gallery-cols: 2;
}
@media (min-width: 48rem) {
  .prose figure.gallery:not([data-count="1"]):not([data-count="2"]) {
    --gallery-cols: 3;
  }
}
.prose figure.gallery img {
  margin: 0;
  width: 100%;
  cursor: pointer; /* user-requested: plain pointer, not zoom-in */
}
.prose figure.gallery[data-count]:not([data-count="1"]) img {
  aspect-ratio: 1;
  object-fit: cover;
}
.prose figure.gallery figcaption {
  grid-column: 1 / -1;
}
```

**Step 2:** First extend the smoke-test post to cover all variants: it
currently holds two count-2 groups — add a lone image (count 1), a
blank-line-separated triple (count 3), and a blank-line-separated group of
five (count 5, exercising the open-ended 3-column rule past the old
enumerated counts), all referencing the same file (superseded by numbered
fixtures: each slot now references its own `plan-smoke-NN.jpg`). Then
`pnpm dev`, open the smoke-test draft, eyeball 1/2/3-image variants (single
image full-width and uncropped; multi-image rows tidy).

Also eyeball `/work`: **accepted deviation (Task 3 review)** — @astrojs/mdx
extends the markdown config, so the gallery plugin also wraps `work.mdx`'s
portfolio image (count-1, full-width, correct sizes). This is deliberate:
uniform behavior, and the Task 5 lightbox will apply there too. If it ever
needs opting out, mirror rehypeAnchors' `skip`-by-path option — do NOT use
`extendMarkdownConfig: false` (it would drop remarkBreaks and the anchor
plugins from MDX).

**Step 3: Commit** (`feat: gallery grid styles`)

---

### Task 5: Lightbox

**Files:**

- Create: `src/components/Lightbox.astro`
- Modify: `src/layouts/Layout.astro` (render `<Lightbox />` just before `</body>`)

Native `<dialog>` + scroll-snap; no library. Progressive: without JS images render in place; the dialog full-view shows the largest derivative (browser pinch-zoom works inside it).

**Review deviations (code review):** the first draft had no close affordance
reachable on touch (slide image boxes fill the dialog, so backdrop taps never
land) and no keyboard path in. The shipped version adds a visible ✕ close
button, makes tapping a slide image close, promotes inline images to
keyboard-operable buttons (`tabindex`/`role`/Enter/Space), overlays `title`
captions on slides (tooltips are hover-only), and picks up `100dvh`,
`overscroll-behavior: contain`, `loading="lazy"`, and `block: "nearest"`.

**User-requested UX changes (post-review):** inline gallery images use
`cursor: pointer` instead of `zoom-in` (Task 4 CSS); the dialog backdrop is
translucent (`rgb(0 0 0 / 0.65)`) so the page stays visible beneath and the
overlay reads as an overlay, not a navigation; and the lightbox integrates
with history — opening pushes a `{ lightbox: true }` state so the browser
back button/gesture closes it, and every other close path consumes that
entry via `history.back()` (a `closingFromPopstate` flag prevents
double-back). A later user request added arrow-key navigation: Left/Right
move one slide (clamped at the ends), with the current slide derived from
scroll position at keypress time so touch-swipes and keys stay consistent —
necessary because the ✕ close button holds focus in the open dialog, making
arrows dead keys otherwise.

**Step 1: Create the component:**

```astro
---
// Full-screen viewer for post images. Collects every .prose img at load,
// opens a <dialog> scroll-snap strip on click or keyboard, starting at the
// tapped image. The largest srcset candidate is used for the full view.
---

<dialog id="lightbox" class="lightbox">
  <button
    id="lightbox-close"
    class="lightbox-close"
    type="button"
    aria-label="Close">✕</button
  >
  <div class="lightbox-strip" id="lightbox-strip"></div>
</dialog>

<script>
  const dialog = document.getElementById("lightbox") as HTMLDialogElement;
  const strip = document.getElementById("lightbox-strip")!;
  const closeButton = document.getElementById("lightbox-close")!;
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

  const buildSlide = (source: HTMLImageElement): HTMLDivElement => {
    const slide = document.createElement("div");
    slide.className = "lightbox-slide";
    const full = document.createElement("img");
    full.src = largestSource(source);
    full.alt = source.alt;
    full.loading = "lazy";
    // The image box fills the slide (object-fit only letterboxes pixels),
    // so on touch it would swallow every backdrop tap — tapping it closes.
    full.addEventListener("click", () => dialog.close());
    slide.appendChild(full);
    if (source.title) {
      full.title = source.title;
      // title tooltips are hover-only; surface the caption for touch too.
      const caption = document.createElement("div");
      caption.className = "lightbox-caption";
      caption.textContent = source.title;
      slide.appendChild(caption);
    }
    return slide;
  };

  // History integration: opening pushes a state so the browser back
  // button/gesture closes the lightbox instead of leaving the page —
  // on mobile especially, "back" is the instinctive dismiss gesture.
  // Set while a popstate is closing the dialog, so the close handler
  // knows the history entry is already consumed and doesn't back() again.
  let closingFromPopstate = false;

  const open = (index: number) => {
    // Guard: never push twice for one open (currently unreachable — inline
    // images sit under the modal while it's open — but cheap insurance).
    if (!dialog.open) history.pushState({ lightbox: true }, "");
    strip.replaceChildren(...proseImages.map(buildSlide));
    dialog.showModal();
    strip.children[index]?.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
  };

  if (dialog && proseImages.length > 0) {
    proseImages.forEach((img, index) => {
      // Keyboard path in: inline images act as buttons.
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.addEventListener("click", () => open(index));
      img.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(index);
        }
      });
    });
    closeButton.addEventListener("click", () => dialog.close());
    // Click on the backdrop (the dialog itself, not a slide img) closes.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target === strip) dialog.close();
    });
    // Arrow-key navigation (user-requested): the ✕ close button holds focus
    // while the dialog is open, so without this handler Left/Right are dead
    // keys in the dialog. The current slide is derived from scroll position
    // at keypress time, so touch-swipes and arrow keys stay consistent.
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const current = Math.round(strip.scrollLeft / strip.clientWidth);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const target = Math.min(
        Math.max(current + delta, 0),
        strip.children.length - 1,
      );
      strip.children[target]?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
    });
    // Back button/gesture while open: close instead of navigating away.
    window.addEventListener("popstate", () => {
      if (dialog.open) {
        closingFromPopstate = true;
        dialog.close();
      }
    });
    // "close" fires for EVERY close path (✕, image tap, backdrop, Esc).
    // Unless this close was itself triggered by popstate, the pushed
    // lightbox entry is still on the stack — consume it so the next back
    // press navigates normally instead of no-opping on a stale entry.
    dialog.addEventListener("close", () => {
      if (closingFromPopstate) {
        closingFromPopstate = false;
      } else if (history.state?.lightbox) {
        history.back();
      }
    });
  }
</script>

<style>
  .lightbox {
    width: 100vw;
    height: 100vh; /* fallback for browsers without dvh */
    height: 100dvh; /* mobile Safari: track the collapsing toolbar */
    max-width: 100vw;
    max-height: 100vh;
    max-height: 100dvh;
    border: none;
    padding: 0;
    /* Translucent, not near-opaque: the page staying visible underneath is
       what tells the user this is an overlay, not a navigation. The close
       button and caption bar carry their own dark backgrounds, so their
       contrast doesn't depend on this value. */
    background: rgb(0 0 0 / 0.65);
  }
  .lightbox-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 1;
    width: 2.75rem;
    height: 2.75rem;
    border: none;
    border-radius: 9999px;
    background: rgb(0 0 0 / 0.5);
    color: white;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
  }
  .lightbox-strip {
    display: flex;
    height: 100%;
    overflow-x: auto;
    overscroll-behavior: contain;
    scroll-snap-type: x mandatory;
  }
  /* Slides and captions are created by the script, so :global is required —
     runtime-built elements never receive Astro's scoping attribute. */
  .lightbox-strip :global(.lightbox-slide) {
    position: relative;
    flex: 0 0 100%;
    height: 100%;
    scroll-snap-align: center;
  }
  .lightbox-strip :global(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .lightbox-strip :global(.lightbox-caption) {
    position: absolute;
    inset: auto 0 0 0;
    padding: 0.5rem 1rem;
    background: rgb(0 0 0 / 0.6);
    color: white;
    font-size: 0.875rem;
    text-align: center;
  }
</style>
```

**Step 2:** In `Layout.astro`, import and render `<Lightbox />` before `</body>`.

**Step 3: Manual verification** in `pnpm dev` on the smoke-test draft: click opens dialog at the clicked image; ✕ button, Esc, backdrop-click, and tapping the slide image all close; Tab reaches an inline image and Enter/Space opens it; the titled image shows its caption bar in the strip; swiping snaps between images. Check a page with no images loads with no console errors.

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
- Delete: the smoke-test post `posts/blog/9999-01-01-image-smoke-test.md` and the 13 numbered fixtures `posts/blog/images/plan-smoke-01.jpg`…`plan-smoke-13.jpg` (unless promoted to real fixtures — if kept, move under a `_`-prefixed draft the sitemap already excludes)

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
