import * as cheerio from "cheerio";
import { SECTIONS, STANDALONE_PAGES } from "../content.config";
import { getAllTaggedPosts, getPublishedEntries } from "./collections";
import { formatNoteTimestamp } from "./date-helpers";
import {
  buildLinkCensus,
  classifyLink,
  extractLinks,
  fileLink,
  type Person,
  type Platforms,
} from "./link-census";
import { titleHtml } from "./title-markdown";
import people from "../data/people.json";
import platforms from "../data/platforms.json";

/** One link on the site, with where it points and the post it sits in. */
export type LinkRecord = {
  heading: string;
  /** The row it's counted under, as trusted HTML (post titles render). */
  labelHtml: string;
  url: string;
  /** `date` is missing for standalone pages that have no publish date. */
  post: { href: string; titleHtml: string; date?: Date };
  /** The post, at the paragraph or list item the link sits in (↩ target). */
  backlink: string;
};

/**
 * Everything /stats and /stats.json are built from, recomputed from the
 * posts on every build: the per-target counts, a title for each page, and
 * one record per link.
 */
export async function loadLinkData() {
  // Counts links in the markdown source of every published post and markdown
  // page (underscore-prefixed fixtures excluded). Hand-built .astro/.mdx routes
  // aren't scanned — their links are mostly nav, not writing.
  const posts = await getAllTaggedPosts();
  const pages = (await getPublishedEntries("pages"))
    .filter((page) => !page.id.startsWith("_"))
    .map((page) => ({ ...page, href: `/${page.id}` }));

  const census = buildLinkCensus(
    [...posts, ...pages].map(({ href, body }) => ({ href, body: body ?? "" })),
  );

  // Internal targets show what they are, labelled like the /tags listings: a
  // post's title and section, a note's timestamp, a page or section's name.
  // Anything unrecognised falls back to its path.
  const titles = new Map<string, { html: string; meta?: string }>([
    ...[...Object.values(SECTIONS), ...Object.values(STANDALONE_PAGES)].map(
      ({ href, title }) => [href, { html: titleHtml(title) }] as const,
    ),
    ...pages.map(
      (page) => [page.href, { html: titleHtml(page.data.title) }] as const,
    ),
    ...posts.map((post) => {
      const title = (post.data as { title?: string }).title;
      return [
        post.href,
        {
          html: title
            ? titleHtml(title)
            : formatNoteTimestamp(post.data.publishedOn),
          meta: post.label,
        },
      ] as const;
    }),
  ]);

  // One record per link, with the post and date the counts throw away, filed
  // the same way as the lists.
  //
  // Each record also knows the paragraph (or list item) it sits in, read from
  // the rendered HTML so the ↩ backlink hits the same #p-N / #li-N the anchor
  // plugin gave it. Markdown links are matched to rendered ones in order, by
  // target; anything unmatched (or on a page without anchors) links to the
  // post itself.
  const anchorsIn = (html: string, from: string) => {
    const $ = cheerio.load(html);
    return $("a[href]")
      .not(".anchor-link")
      .toArray()
      .map((a) => ({
        target: classifyLink($(a).attr("href")!, from)?.target,
        id: $(a).closest("[id^='p-'], [id^='li-']").attr("id"),
      }));
  };
  const records: LinkRecord[] = [...posts, ...pages].flatMap((source) => {
    const rendered = anchorsIn(source.rendered?.html ?? "", source.href);
    return extractLinks(source.body ?? "").flatMap((href): LinkRecord[] => {
      const link = classifyLink(href, source.href);
      if (!link) return [];
      const at = rendered.findIndex((r) => r.target === link.target);
      const id = at === -1 ? undefined : rendered.splice(at, 1)[0].id;
      const backlink = id ? `${source.href}#${id}` : source.href;
      const post = {
        href: source.href,
        titleHtml: titles.get(source.href)?.html ?? source.href,
        date: source.data.publishedOn,
      };
      if (link.kind === "internal")
        return [
          {
            heading: "Internal Links",
            labelHtml: titles.get(link.target)?.html ?? link.target,
            url: link.target,
            post,
            backlink,
          },
        ];
      const { heading, label } = fileLink(
        link,
        people as Person[],
        platforms as Platforms,
      );
      return [{ heading, labelHtml: label, url: link.target, post, backlink }];
    });
  });

  return { census, titles, records };
}
