import type { APIRoute } from "astro";
import { getPublishedEntries } from "../utils/collections";
import { TAGS } from "../content.config";

const SITE_URL = "https://tanvibhakta.in";

type Url = { loc: string; lastmod?: Date };

/**
 * A single, exhaustive sitemap.xml for search engines. Lists every
 * indexable URL on the site (every post, not just top-level sections —
 * that's the point of a machine sitemap). The human-readable table of
 * contents lives at /sitemap.
 */
export const GET: APIRoute = async () => {
  const [blog, poetry, weeknotes, garden, pages] = await Promise.all([
    getPublishedEntries("blog"),
    getPublishedEntries("poetry"),
    getPublishedEntries("weeknotes"),
    getPublishedEntries("digitalGarden"),
    getPublishedEntries("pages"),
  ]);

  const urls: Url[] = [
    // Top-level / standalone pages
    { loc: "/" },
    { loc: "/work/" },
    { loc: "/subscribe/" },
    { loc: "/sitemap/" },
    { loc: "/blog/" },
    { loc: "/poetry/" },
    { loc: "/weeknotes/" },
    { loc: "/digital-garden/" },
    { loc: "/tags/" },

    // `pages` collection (e.g. /care, /now), excluding underscore fixtures
    ...pages
      .filter((p) => !p.id.startsWith("_"))
      .map((p) => ({ loc: `/${p.id}/` })),

    // Content collections
    ...blog.map((p) => ({ loc: `/blog/${p.id}/`, lastmod: p.data.publishedOn })),
    ...poetry.map((p) => ({
      loc: `/poetry/${p.id}/`,
      lastmod: p.data.publishedOn,
    })),
    ...weeknotes.map((p) => ({
      loc: `/weeknotes/${p.id}/`,
      lastmod: p.data.publishedOn,
    })),
    ...garden.map((p) => ({
      loc: `/digital-garden/${p.id}/`,
      lastmod: p.data.lastUpdatedOn,
    })),

    // Tag pages
    ...TAGS.map((tag) => ({ loc: `/tags/${tag}/` })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(({ loc, lastmod }) => {
    const lastmodTag = lastmod
      ? `<lastmod>${lastmod.toISOString().split("T")[0]}</lastmod>`
      : "";
    return `  <url><loc>${SITE_URL}${loc}</loc>${lastmodTag}</url>`;
  })
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
};
