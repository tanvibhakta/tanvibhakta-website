/**
 * The images the lightbox strip holds when `clicked` is opened: the prose
 * images of its enclosing <article>, so swiping on the /notes feed stays
 * inside one note. Pages with no article (or one article, like a blog
 * post) get every prose image, as before.
 */
export function stripImages(
  clicked: HTMLImageElement,
  root: ParentNode,
): HTMLImageElement[] {
  const article = clicked.closest("article");
  // Filter the page-wide list rather than article.querySelectorAll(): the
  // `.prose` ancestor sits outside the article, and a filter doesn't depend
  // on scoped selector matching across that boundary.
  return [...root.querySelectorAll<HTMLImageElement>(".prose img")].filter(
    (img) => !article || article.contains(img),
  );
}
