// Components MDX posts can use without importing them. Both the post page
// (EntryPage) and the RSS feed (utils/feeds) render post bodies, so both pass
// this map: a component missing from either fails the build.
import Table from "./Table.astro";

export const mdxComponents = { Table };
