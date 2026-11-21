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

export type TargetCount = { target: string; count: number };
export type OutgoingLink = Extract<ClassifiedLink, { kind: "outgoing" }>;

export type LinkCensus = {
  internal: TargetCount[];
  outgoing: OutgoingLink[];
};

// Most-linked first; ties broken alphabetically so the page is stable.
const byCount = (a: TargetCount, b: TargetCount) =>
  b.count - a.count || a.target.localeCompare(b.target);

function tally(targets: string[]): TargetCount[] {
  const counts = new Map<string, number>();
  for (const target of targets) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts]
    .map(([target, count]) => ({ target, count }))
    .sort(byCount);
}

/** Every link across a set of pages: internal ones counted, outgoing raw. */
export function buildLinkCensus(pages: LinkSource[]): LinkCensus {
  const internal: string[] = [];
  const outgoing: OutgoingLink[] = [];

  for (const page of pages) {
    for (const href of extractLinks(page.body)) {
      const link = classifyLink(href, page.href);
      if (!link) continue;
      if (link.kind === "internal") internal.push(link.target);
      else outgoing.push(link);
    }
  }

  return { internal: tally(internal), outgoing };
}

/** src/data/people.json: a person and the sites that are theirs. */
export type Person = { name: string; sites: string[] };
/**
 * src/data/platforms.json: section heading → the platforms filed under it. A
 * platform is a domain, or a list of domains that are the same thing (e.g.
 * ["x.com", "twitter.com"]); they share one row, labelled by the first.
 */
export type Platforms = Record<string, (string | string[])[]>;

/** A ranked row: a person, platform or site, and the URLs behind it. */
export type LinkGroup = { label: string; count: number; urls: TargetCount[] };
export type LinkSection = { heading: string; groups: LinkGroup[] };

export const PEOPLE_HEADING = "People";
export const OTHER_HEADING = "Blogs & Publications";

/**
 * A site is a bare domain ("ankursethi.com", which also covers its
 * subdomains) or a domain plus path ("instagram.com/barkwhip") for a profile
 * on a shared platform, which covers that path and everything under it.
 */
export function matchesSite(link: OutgoingLink, site: string): boolean {
  const [host, ...rest] = site
    .toLowerCase()
    .replace(/^www\./, "")
    .split("/");
  const domain = link.domain.toLowerCase();
  if (domain !== host && !domain.endsWith(`.${host}`)) return false;
  const path = rest.filter(Boolean).join("/");
  if (!path) return true;
  const linkPath = new URL(link.target).pathname.toLowerCase();
  return linkPath === `/${path}` || linkPath.startsWith(`/${path}/`);
}

/**
 * Where one outgoing link is filed: a person (people.json wins, so a friend's
 * Instagram is theirs), else a platform (platforms.json, aliases sharing the
 * first domain's label), else Blogs & Publications under its own domain.
 */
export function fileLink(
  link: OutgoingLink,
  people: Person[],
  platforms: Platforms,
): { heading: string; label: string } {
  const person = people.find((p) => p.sites.some((s) => matchesSite(link, s)));
  if (person) return { heading: PEOPLE_HEADING, label: person.name };
  for (const [heading, entries] of Object.entries(platforms)) {
    for (const entry of entries) {
      const domains = [entry].flat();
      if (domains.some((d) => matchesSite(link, d)))
        return { heading, label: domains[0] };
    }
  }
  return { heading: OTHER_HEADING, label: link.domain };
}

/**
 * File each outgoing link under a person (people.json wins, so a friend's
 * Instagram is theirs, not Instagram's), else a platform section
 * (platforms.json), else Blogs & Publications grouped by its own domain.
 * Sections come back People, Blogs & Publications, then platforms.json order.
 */
export function groupOutgoing(
  links: OutgoingLink[],
  people: Person[],
  platforms: Platforms,
): LinkSection[] {
  const sections = new Map<string, Map<string, string[]>>(
    [PEOPLE_HEADING, OTHER_HEADING, ...Object.keys(platforms)].map((h) => [
      h,
      new Map(),
    ]),
  );
  const file = (heading: string, label: string, url: string) => {
    const groups = sections.get(heading)!;
    groups.set(label, [...(groups.get(label) ?? []), url]);
  };

  for (const link of links) {
    const { heading, label } = fileLink(link, people, platforms);
    file(heading, label, link.target);
  }

  return [...sections].map(([heading, groups]) => ({
    heading,
    groups: [...groups]
      .map(([label, urls]) => ({
        label,
        count: urls.length,
        urls: tally(urls),
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  }));
}

/** A person's footprint across the site: their URLs and the pages citing them. */
export type PersonMentions = {
  person: Person;
  urls: TargetCount[];
  /** Hrefs of the pages that link to them, in source order, deduplicated. */
  pages: string[];
};

/**
 * Every person in people.json who is linked from at least one page, with the
 * URLs used and the pages they appear on. Same matching as groupOutgoing.
 */
export function mentionsByPerson(
  pages: LinkSource[],
  people: Person[],
): PersonMentions[] {
  const found = new Map<string, { urls: string[]; pages: Set<string> }>();
  for (const page of pages) {
    for (const href of extractLinks(page.body)) {
      const link = classifyLink(href, page.href);
      if (link?.kind !== "outgoing") continue;
      const person = people.find((p) =>
        p.sites.some((s) => matchesSite(link, s)),
      );
      if (!person) continue;
      const entry = found.get(person.name) ?? { urls: [], pages: new Set() };
      entry.urls.push(link.target);
      entry.pages.add(page.href);
      found.set(person.name, entry);
    }
  }
  return people
    .filter((person) => found.has(person.name))
    .map((person) => {
      const { urls, pages } = found.get(person.name)!;
      return { person, urls: tally(urls), pages: [...pages] };
    });
}
