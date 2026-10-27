/**
 * rehype plugin: after each link with a recorded Wayback Machine snapshot,
 * adds a bracketed link to it — `<a href=…>page</a> [archive]`.
 *
 * Snapshots come from a plain `{ url: snapshotUrl }` map (see
 * `rehype-wayback/sync` for building one), so rendering never touches the
 * network. Keys are normalized with `archiveKey`.
 *
 * Run it after any plugin that adds content to links (icons, screen-reader
 * text), or that plugin will decorate the archive links too.
 */
import { archiveKey } from "./lib/key.js";

export { archiveKey };

/**
 * @typedef {{ type: "text", value: string }} Text
 * @typedef {{
 *   type: "element",
 *   tagName: string,
 *   properties: Record<string, unknown>,
 *   children: Node[],
 * }} Element
 * @typedef {Text | Element | { type: string, children?: Node[] }} Node
 *
 * @typedef {object} Options
 * @property {Record<string, string>} archives archiveKey(href) → snapshot URL
 * @property {string} [label] link text, default "archive"
 * @property {string} [className] class on the wrapping span, default
 *   "archive-link"
 * @property {Record<string, unknown>} [properties] extra properties for the
 *   archive `<a>`, e.g. `{ target: "_blank", rel: ["noopener"] }`
 * @property {string} [screenReaderText] appended to the link in a
 *   `.sr-only` span, e.g. " copy (opens in a new tab)"
 * @property {(link: Element) => boolean} [test] which links get an archive
 *   link; default: those with visible text (so not image-only links)
 */

/** @param {Options} options */
export default function rehypeWayback(options) {
  const {
    archives,
    label = "archive",
    className = "archive-link",
    properties = {},
    screenReaderText,
    test = hasVisibleText,
  } = options;

  /** @param {string} href */
  function archiveLink(href) {
    /** @type {Node[]} */
    const children = [{ type: "text", value: label }];
    if (screenReaderText) {
      children.push(
        element("span", { className: ["sr-only"] }, [
          { type: "text", value: screenReaderText },
        ]),
      );
    }
    // The space stays outside the span so the bracket can wrap to the next
    // line; the span is styled no-wrap so "[archive]" never splits.
    return [
      { type: "text", value: " " },
      element("span", { className: [className] }, [
        { type: "text", value: "[" },
        element("a", { href, ...properties }, children),
        { type: "text", value: "]" },
      ]),
    ];
  }

  /** @param {Node} tree */
  return (tree) => {
    // Spliced in after the walk, so it never visits its own links.
    /** @type {[Element, Element, string][]} */
    const pending = [];
    walk(tree, (link, parent) => {
      const key = archiveKey(String(link.properties.href ?? ""));
      if (!key || !Object.hasOwn(archives, key) || !test(link)) return;
      pending.push([parent, link, archives[key]]);
    });
    for (const [parent, link, href] of pending) {
      parent.children.splice(
        parent.children.indexOf(link) + 1,
        0,
        ...archiveLink(href),
      );
    }
  };
}

/**
 * @param {string} tagName
 * @param {Record<string, unknown>} properties
 * @param {Node[]} children
 * @returns {Element}
 */
function element(tagName, properties, children) {
  return { type: "element", tagName, properties, children };
}

/**
 * @param {Node} node
 * @param {(link: Element, parent: Element) => void} fn
 */
function walk(node, fn) {
  for (const child of node.children ?? []) {
    if (child.type !== "element") continue;
    const el = /** @type {Element} */ (child);
    // Links don't nest, so there's nothing to find inside one.
    if (el.tagName === "a") fn(el, /** @type {Element} */ (node));
    else walk(el, fn);
  }
}

/**
 * Text a sighted reader sees: skips `hidden`, `aria-hidden` and the common
 * visually-hidden classes, so a link holding only an image plus
 * screen-reader text counts as image-only.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function hasVisibleText(node) {
  if (node.type === "text")
    return /** @type {Text} */ (node).value.trim() !== "";
  if (node.type === "element") {
    const { properties } = /** @type {Element} */ (node);
    const classes = /** @type {unknown[]} */ (properties.className ?? []);
    if (
      properties.hidden ||
      properties.ariaHidden === "true" ||
      properties.ariaHidden === true ||
      classes.some((c) => c === "sr-only" || c === "visually-hidden")
    ) {
      return false;
    }
  }
  return (node.children ?? []).some(hasVisibleText);
}
