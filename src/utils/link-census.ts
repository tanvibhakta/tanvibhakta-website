import MarkdownIt from "markdown-it";
import { SITE_URL } from "./site";

// linkify mirrors the GFM autolink literals Astro's markdown pipeline renders,
// so bare URLs in prose count the same as [text](url) links.
const parser = new MarkdownIt({ html: true, linkify: true });
type Token = ReturnType<typeof parser.parse>[number];
const HTML_HREF = /<a\s[^>]*?href\s*=\s*["']([^"']+)["']/gi;
const SITE_HOST = new URL(SITE_URL).hostname;

/** Every link href in a markdown body, in document order. Images excluded. */
export function extractLinks(markdown: string): string[] {
  const hrefs: string[] = [];
  const walk = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "link_open") {
        const href = token.attrGet("href");
        if (href) hrefs.push(String(href));
      } else if (token.type === "html_inline" || token.type === "html_block") {
        for (const [, href] of token.content.matchAll(HTML_HREF)) {
          hrefs.push(href);
        }
      }
      if (token.children) walk(token.children);
    }
  };
  walk(parser.parse(markdown, {}));
  return hrefs;
}

export type ClassifiedLink =
  | { kind: "internal"; target: string }
  | { kind: "outgoing"; target: string; domain: string };

/**
 * Sort a href into internal (a path on this site, normalised so /blog/x,
 * /blog/x/#p-3 and https://tanvibhakta.in/blog/x all count as one target) or
 * outgoing (another host, grouped by domain). Same-page anchors, mailto: and
 * other non-web schemes return null — they don't point at a "thing".
 */
export function classifyLink(
  href: string,
  fromPath: string,
): ClassifiedLink | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  let url: URL;
  try {
    // Resolving against the linking page handles relative hrefs too.
    url = new URL(trimmed, new URL(fromPath, SITE_URL));
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^www\./, "");
  if (host === SITE_HOST) {
    const path = decodeURI(url.pathname).replace(/\/+$/, "") || "/";
    return { kind: "internal", target: path };
  }
  url.hash = "";
  return {
    kind: "outgoing",
    target: url.href.replace(/\/$/, ""),
    domain: host,
  };
}

/** A page on the site: where it's served and its markdown source. */
export type LinkSource = { href: string; body: string };

export type TargetCount = {
  target: string;
  count: number;
  /** Distinct pages the target is linked from. */
  sources: number;
};
export type DomainCount = TargetCount & { urls: TargetCount[] };

export type LinkCensus = {
  total: number;
  internal: TargetCount[];
  outgoing: DomainCount[];
};

// Most-linked first; ties broken alphabetically so the page is stable.
const byCount = (a: TargetCount, b: TargetCount) =>
  b.count - a.count || a.target.localeCompare(b.target);

function tally(
  links: { target: string; source: string }[],
): Map<string, TargetCount> {
  const counts = new Map<string, TargetCount & { from: Set<string> }>();
  for (const { target, source } of links) {
    const entry = counts.get(target) ?? {
      target,
      count: 0,
      sources: 0,
      from: new Set<string>(),
    };
    entry.count++;
    entry.from.add(source);
    entry.sources = entry.from.size;
    counts.set(target, entry);
  }
  return new Map(
    [...counts].map(([k, { target, count, sources }]) => [
      k,
      { target, count, sources },
    ]),
  );
}

/** Count and rank every link across a set of pages. */
export function buildLinkCensus(pages: LinkSource[]): LinkCensus {
  const internal: { target: string; source: string }[] = [];
  const outgoing: { target: string; source: string; domain: string }[] = [];

  for (const page of pages) {
    for (const href of extractLinks(page.body)) {
      const link = classifyLink(href, page.href);
      if (!link) continue;
      if (link.kind === "internal") {
        internal.push({ target: link.target, source: page.href });
      } else {
        outgoing.push({ ...link, source: page.href });
      }
    }
  }

  const domains = tally(
    outgoing.map(({ domain, source }) => ({ target: domain, source })),
  );
  return {
    total: internal.length + outgoing.length,
    internal: [...tally(internal).values()].sort(byCount),
    outgoing: [...domains.values()]
      .map((domain) => ({
        ...domain,
        urls: [
          ...tally(outgoing.filter((l) => l.domain === domain.target)).values(),
        ].sort(byCount),
      }))
      .sort(byCount),
  };
}
