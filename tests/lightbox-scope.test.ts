// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { stripImages } from "../src/utils/lightbox-scope";

const ids = (images: HTMLImageElement[]) => images.map((img) => img.id);

describe("stripImages", () => {
  test("on a feed, the strip is the clicked note's images only", () => {
    document.body.innerHTML = `
      <main class="prose">
        <article><img id="a1"><img id="a2"></article>
        <article><img id="b1"></article>
      </main>`;
    const clicked = document.getElementById("a2") as HTMLImageElement;
    expect(ids(stripImages(clicked, document))).toEqual(["a1", "a2"]);
  });

  test("outside an article, the strip is every prose image on the page", () => {
    document.body.innerHTML = `
      <main class="prose"><img id="x"><p><img id="y"></p></main>
      <img id="not-prose">`;
    const clicked = document.getElementById("y") as HTMLImageElement;
    expect(ids(stripImages(clicked, document))).toEqual(["x", "y"]);
  });
});
