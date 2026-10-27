import { archiveKey } from "../utils/archive-links.ts";

/**
 * Makes links that leave the site open in a new tab, and says so: a trailing
 * "external link" icon for sighted readers and visually-hidden "(opens in a
 * new tab)" text for screen readers.
 *
 * External means an http(s) URL on another host. Relative links, fragments,
 * mailto:/tel:, and absolute links back to `site` (with or without `www.`, on
 * either scheme) stay internal and keep same-tab behaviour.
 *
 * The icon must never wrap onto a line by itself, so the link's last word and
 * the icon are wrapped together in a no-wrap span. Links with no text (an
 * image link) get no icon, only the screen-reader text.
 *
 * A link with a Wayback Machine snapshot in `archives` (recorded by
 * `pnpm archive`, scripts/archive-links.ts) is followed by a bracketed
 * "[archive]" link to that snapshot. It also opens in a new tab but carries
 * no icon: one per link is enough.
 *
 * Why not the `rehype-external-links` package: it can add target/rel and
 * append content to a link, but can't wrap the last word with the icon, so
 * its icon can wrap onto a line alone — nor add a sibling after the link.
 *
 * Styling for the emitted classes lives in src/styles/global.css.
 *
 * @param {{ site?: string, archives?: Record<string, string> }} [options]
 *   `site` is the site's own origin, e.g. "https://tanvibhakta.in";
 *   `archives` maps archiveKey(href) to a snapshot URL.
 */
export function rehypeExternalLinks(options = {}) {
  const archives = options.archives ?? {};
  const siteHost = options.site ? bareHost(new URL(options.site).host) : null;

  /** @param {unknown} href */
  function isExternal(href) {
    if (typeof href !== "string") return false;
    let url;
    try {
      // Resolve against the site so relative links come out internal.
      url = new URL(href, options.site ?? "http://localhost");
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return bareHost(url.host) !== siteHost;
  }

  return (tree) => {
    // Archive links are spliced in after the walk, so it never visits them.
    /** @type {[any, any, string][]} */
    const pending = [];
    walk(tree, (node, parent) => {
      if (node.tagName !== "a" || !isExternal(node.properties?.href)) return;

      const rel = new Set(asList(node.properties.rel));
      rel.add("noopener");
      node.properties = {
        ...node.properties,
        target: "_blank",
        rel: [...rel],
      };

      const text = hasText(node);
      if (text) appendToLastWord(node, structuredClone(ICON));
      node.children.push({
        type: "element",
        tagName: "span",
        properties: { className: ["sr-only"] },
        children: [{ type: "text", value: " (opens in a new tab)" }],
      });

      const key = archiveKey(String(node.properties.href));
      const archive = key && Object.hasOwn(archives, key) && archives[key];
      // An image link has no text for "[archive]" to sit after.
      if (archive && parent && text) {
        pending.push([parent, node, archive]);
      }
    });
    for (const [parent, node, archive] of pending) {
      const i = parent.children.indexOf(node);
      parent.children.splice(i + 1, 0, ...archiveLink(archive));
    }
  };
}

/**
 * ` [archive]`: the space stays outside the no-wrap span so the bracket can
 * move to the next line, but never splits from itself.
 *
 * @param {string} href the snapshot URL
 */
function archiveLink(href) {
  return [
    { type: "text", value: " " },
    {
      type: "element",
      tagName: "span",
      properties: { className: ["archive-link"] },
      children: [
        { type: "text", value: "[" },
        {
          type: "element",
          tagName: "a",
          properties: { href, target: "_blank", rel: ["noopener"] },
          children: [
            { type: "text", value: "archive" },
            {
              type: "element",
              tagName: "span",
              properties: { className: ["sr-only"] },
              children: [{ type: "text", value: " copy (opens in a new tab)" }],
            },
          ],
        },
        { type: "text", value: "]" },
      ],
    },
  ];
}

// Lucide "external-link" (ISC), stroked in currentColor so it follows the
// link's colour, hover filter included.
const ICON = {
  type: "element",
  tagName: "svg",
  properties: {
    className: ["external-link-icon"],
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    width: "0.75em",
    height: "0.75em",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ariaHidden: "true",
    focusable: "false",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        d: "M15 3h6v6m-11 5L21 3m-3 10v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
      },
      children: [],
    },
  ],
};

/** @param {string} host */
function bareHost(host) {
  return host.toLowerCase().replace(/^www\./, "");
}

/** @param {unknown} value @returns {string[]} */
function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function walk(node, fn, parent) {
  if (node.type === "element") fn(node, parent);
  // A link never contains another link, so there's no need to look inside
  // one — which also keeps us from re-visiting the icon we just added.
  if (node.tagName === "a") return;
  for (const child of node.children ?? []) walk(child, fn, node);
}

function hasText(node) {
  if (node.type === "text") return node.value.trim() !== "";
  return (node.children ?? []).some(hasText);
}

/**
 * Wraps the last word of `node`'s text together with `icon` in a no-wrap
 * span, descending into trailing inline elements (`<em>`, `<code>`) so the
 * icon sits right after the final visible character.
 */
function appendToLastWord(node, icon) {
  const children = node.children;
  // Skip trailing whitespace-only text so "link " still finds "link".
  let i = children.length - 1;
  while (
    i >= 0 &&
    children[i].type === "text" &&
    children[i].value.trim() === ""
  ) {
    i--;
  }
  const last = children[i];

  if (last?.type === "element" && hasText(last)) {
    appendToLastWord(last, icon);
    return;
  }

  const tail = {
    type: "element",
    tagName: "span",
    properties: { className: ["external-link-tail"] },
    children: [],
  };

  if (last?.type === "text") {
    const text = last.value.trimEnd();
    const cut = text.search(/\S+$/);
    const before = text.slice(0, cut);
    tail.children.push({ type: "text", value: text.slice(cut) }, icon);
    children.splice(
      i,
      children.length - i,
      ...(before ? [{ type: "text", value: before }] : []),
      tail,
    );
  } else {
    // Last thing is a text-less element (e.g. an <img> after some text):
    // the icon goes after it, still unbreakable from it.
    tail.children.push(...(last ? [last] : []), icon);
    children.splice(Math.max(i, 0), children.length - Math.max(i, 0), tail);
  }
}
