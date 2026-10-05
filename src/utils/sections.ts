// Route → section-name logic shared by the nav (to highlight the current
// section) and by Layout (to derive the document <title> as
// "{PageName} | {SITE_TAB_TITLE}").
import { SECTIONS, STANDALONE_PAGES } from "../content.config";
import { isNoteSlug } from "./note-slug";

export type Section = { label: string; href: string };

// Labels and membership come from the registry in content.config.ts; only
// ordering and which items sit in the main nav are decided here. Home ("/")
// is excluded — the site title link covers it.
export const KNOWN_SECTIONS: readonly Section[] = [
  ...Object.values(SECTIONS),
  ...Object.values(STANDALONE_PAGES),
]
  .filter(({ href }) => href !== "/")
  .map(({ href, title }) => ({ href, label: title }));

const NAV_HREFS = ["/work", "/blog", "/weeknotes"];
export const NAV_ITEMS: readonly Section[] = NAV_HREFS.flatMap(
  (href) => KNOWN_SECTIONS.find((s) => s.href === href) ?? [],
);

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// The section a path belongs to: a known section if one matches, otherwise a
// title-cased fallback from the first path segment. Undefined for the homepage.
export function getCurrentSection(
  path: string,
  allowFallback = true,
): Section | undefined {
  const known = [...KNOWN_SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => path === s.href || path.startsWith(`${s.href}/`));
  if (known) return known;

  // Notes are served at the root (/2026oct05-01), outside /notes.
  const firstSegment = path.split("/").filter(Boolean)[0];
  if (firstSegment && isNoteSlug(firstSegment)) {
    return { label: SECTIONS.notes.title, href: SECTIONS.notes.href };
  }
  if (!allowFallback) return undefined;

  if (!firstSegment || firstSegment === "404") return undefined;
  return { label: titleCase(firstSegment), href: `/${firstSegment}` };
}

// The page name for the document <title>, or undefined for the homepage.
export function getPageName(path: string): string | undefined {
  return getCurrentSection(path)?.label;
}
