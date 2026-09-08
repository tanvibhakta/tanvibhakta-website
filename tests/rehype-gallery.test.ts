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

  test("image paragraphs inside a blockquote merge across newline nodes", () => {
    const out = run([
      elem("blockquote", {}, [
        text("\n"),
        p(img("images/q.webp")),
        text("\n"),
        p(img("images/r.webp")),
        text("\n"),
      ]),
    ]);
    const bq = out[0];
    expect(bq.tagName).toBe("blockquote");
    const figure = bq.children.find(
      (c) => (c as HastElement).tagName === "figure",
    ) as HastElement;
    expect(figure).toBeDefined();
    expect(figure.properties.dataCount).toBe(2);
    expect(
      figure.children.filter((c) => (c as HastElement).tagName === "img"),
    ).toHaveLength(2);
  });

  test("linked image (p > a > img) stays a paragraph", () => {
    const out = run([
      p(elem("a", { href: "https://example.com" }, [img("images/l.webp")])),
    ]);
    expect(out[0].tagName).toBe("p");
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

  test("grouped imgs get a sizes attribute by group count", () => {
    const galleryImgs = (out: HastElement[]) =>
      out[0].children.filter(
        (c) => (c as HastElement).tagName === "img",
      ) as HastElement[];

    const one = run([p(img("images/a.webp"))]);
    for (const image of galleryImgs(one)) {
      expect(image.properties.sizes).toBe("(min-width: 768px) 50vw, 100vw");
    }

    const two = run([p(img("images/a.webp")), p(img("images/b.webp"))]);
    for (const image of galleryImgs(two)) {
      expect(image.properties.sizes).toBe("(min-width: 768px) 25vw, 50vw");
    }

    const four = run([
      p(
        img("images/a.webp"),
        img("images/b.webp"),
        img("images/c.webp"),
        img("images/d.webp"),
      ),
    ]);
    expect(four[0].properties.dataCount).toBe(4);
    for (const image of galleryImgs(four)) {
      expect(image.properties.sizes).toBe("(min-width: 768px) 17vw, 50vw");
    }
  });
});
