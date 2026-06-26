// Single source of truth for the site's sections and how a route maps to a
// human-readable page name. Used by the nav (to highlight the current section)
// and by Layout (to derive the document <title> as "{PageName} | {SITE_NAME}").

export const SITE_NAME = "Tanvi's Web Home";

export interface Section {
  label: string;
  href: string;
}

// Sections shown in the primary nav.
export const NAV_ITEMS: readonly Section[] = [
  { label: "Work", href: "/work" },
  { label: "Blog", href: "/blog" },
  { label: "Weeknotes", href: "/weeknotes" },
] as const;

// Every section the site knows how to name (a superset of the nav).
export const KNOWN_SECTIONS: readonly Section[] = [
  ...NAV_ITEMS,
  { label: "Poetry", href: "/poetry" },
  { label: "Digital Garden", href: "/digital-garden" },
  { label: "Notes", href: "/notes" },
  { label: "Tags", href: "/tags" },
  { label: "Subscribe", href: "/subscribe" },
] as const;

export function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// The section a path belongs to: a known section if one matches, otherwise a
// title-cased fallback from the first path segment. Undefined for the homepage.
export function getCurrentSection(path: string): Section | undefined {
  const known = [...KNOWN_SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => path === s.href || path.startsWith(`${s.href}/`));
  if (known) return known;

  const firstSegment = path.split("/").filter(Boolean)[0];
  if (!firstSegment || firstSegment === "404") return undefined;
  return { label: titleCase(firstSegment), href: `/${firstSegment}` };
}

// The page name for the document <title>, or undefined for the homepage.
export function getPageName(path: string): string | undefined {
  return getCurrentSection(path)?.label;
}
