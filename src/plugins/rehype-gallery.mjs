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
 *
 * Each grouped img also gets a `sizes` attribute reflecting its actual
 * render width in the gallery grid (1 col; 2 cols for count≥2; 3 cols at
 * ≥768px for count≥3) inside the md:w-1/2 prose column — Astro's default
 * derives `sizes` from intrinsic width and over-fetches ~2x.
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

// Actual render width by group count: full column for a lone image, half
// for a 2-up grid, a third (3 cols ≥768px, 2 below) for larger groups.
function sizesFor(count) {
  if (count === 1) return "(min-width: 768px) 50vw, 100vw";
  if (count === 2) return "(min-width: 768px) 25vw, 50vw";
  return "(min-width: 768px) 17vw, 50vw";
}

function galleryFigure(images) {
  const sizes = sizesFor(images.length);
  for (const image of images) {
    image.properties = { ...image.properties, sizes };
  }
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
