/**
 * Note embeds in MDX posts. A paragraph that is nothing but a note's URL —
 * `https://tanvibhakta.in/2026aug20-01` pasted on its own line, or the bare
 * path `/2026aug20-01` — becomes `<NoteEmbed slug="2026aug20-01" />`.
 * NoteEmbed (src/components/NoteEmbed.astro) reads the note from the content
 * collection and renders it with Note.astro; EntryPage supplies it to MDX.
 *
 * Only .mdx files: plain markdown can't hold a component, so there a note
 * URL stays a link. Notes themselves are .md, so they never embed — notes
 * connect to each other by threading (inReplyTo), not by embedding.
 *
 * Why not @remark-embedder/core (the established "link-only paragraph →
 * embed" plugin): its transformers return HTML strings, so the note would be
 * rendered outside the content collection — a second reader of note files
 * and a second copy of the note markup. Emitting a component keeps one of
 * each.
 */
import { isNoteSlug } from "../utils/note-slug.ts";

const SITE_PATH = /^(?:https?:\/\/(?:www\.)?tanvibhakta\.in)?\/([^/?#]+)\/?$/;

/** The note slug a paragraph consists of, or null. */
function embedSlug(node) {
  if (node.type !== "paragraph" || node.children.length !== 1) return null;
  const [only] = node.children;
  let target = null;
  if (only.type === "text") target = only.value.trim();
  // A pasted URL autolinks, and its text is the URL itself. A hand-written
  // [label](/slug) alone on a line stays a link.
  if (
    only.type === "link" &&
    only.children.length === 1 &&
    only.children[0].type === "text" &&
    only.children[0].value === only.url
  ) {
    target = only.url;
  }
  const slug = target?.match(SITE_PATH)?.[1];
  return slug && isNoteSlug(slug) ? slug : null;
}

export function remarkNoteEmbeds() {
  return (tree, file) => {
    if (!file.path?.endsWith(".mdx")) return;
    const visit = (parent) => {
      if (!parent.children) return;
      parent.children = parent.children.map((child) => {
        const slug = embedSlug(child);
        if (!slug) {
          visit(child);
          return child;
        }
        return {
          type: "mdxJsxFlowElement",
          name: "NoteEmbed",
          attributes: [{ type: "mdxJsxAttribute", name: "slug", value: slug }],
          children: [],
        };
      });
    };
    visit(tree);
  };
}
