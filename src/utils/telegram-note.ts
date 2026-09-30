import * as prettier from "prettier/standalone";
import markdownPlugin from "prettier/plugins/markdown";
import {
  entitiesToMarkdown,
  type TelegramMessageEntity,
} from "./telegram-entities";

export interface TelegramMessage {
  message_id: number;
  date: number; // Unix epoch seconds, UTC
  text?: string;
  entities?: TelegramMessageEntity[];
  from?: { id: number };
  chat?: { id: number; type: string };
}

export interface NoteFile {
  filename: string;
  content: string;
}

/**
 * Shapes a Telegram message into a note file matching the conventions of
 * scripts/new-content.ts: filename `YYYY-MM-DD-HHmm.md`, frontmatter holding
 * only a naive local wall-clock `publishedOn` (no offset — the site displays
 * it verbatim), body converted from Telegram entities to markdown.
 */
export function buildNote(
  message: TelegramMessage,
  timeZone: string,
): NoteFile | null {
  if (!message.text?.trim()) return null;
  const timestamp = wallClockTimestamp(message.date, timeZone);
  const body = entitiesToMarkdown(message.text, message.entities);
  return {
    filename: `${timestamp.slice(0, 10)}-${timestamp.slice(11, 16).replace(":", "")}.md`,
    content: `---\npublishedOn: ${timestamp}\n---\n\n${body}\n`,
  };
}

/**
 * Runs a note through Prettier before it is committed.
 *
 * Every hand-authored file is formatted by lint-staged on the way into a
 * commit, but the webhook writes to main through the GitHub Contents API and
 * never touches a local hook — so CI's `prettier --check` was the first thing
 * to see these files, and it failed the whole run on notes that were already
 * published. Formatting here puts the same pass in front of the commit.
 *
 * `prettier/standalone` with an explicit plugin, rather than the usual
 * `prettier` entrypoint, because the latter resolves parsers by dynamic
 * import at runtime — which esbuild cannot follow when Netlify bundles this
 * function. Standalone also means `.prettierrc` is not read: the config sets
 * nothing that affects markdown today, and the tests assert this output
 * against real Prettier *with* that config, so a divergence fails there
 * rather than on main.
 *
 * The markdown plugin alone, without prettier/plugins/yaml (188kb): it holds
 * frontmatter as an opaque node and reprints it verbatim, and the only
 * frontmatter a note has is the single `publishedOn` line written above.
 *
 * Whitespace is fixed as a side effect of the round trip, not by a rule of
 * ours — CommonMark drops trailing spaces at parse time and paragraph gaps
 * are structural, so the printer cannot reproduce either. None of it was
 * visible anyway: remark-breaks already makes a single newline a line break.
 */
export async function formatNote(note: NoteFile): Promise<NoteFile> {
  return {
    ...note,
    content: await prettier.format(note.content, {
      parser: "markdown",
      plugins: [markdownPlugin],
    }),
  };
}

/**
 * The permalink number of the newest note, given the filenames in
 * posts/notes/. Notes get xkcd-style sequential slugs ordered by publish
 * time (src/utils/notes.ts) and are only added forward in time, so the note
 * that just landed is number `count of note files`.
 */
export function noteNumberFromListing(filenames: string[]): number {
  return filenames.filter((name) => name.endsWith(".md")).length;
}

// "YYYY-MM-DDTHH:mm:ss" as read off a clock in `timeZone`.
function wallClockTimestamp(epochSeconds: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(epochSeconds * 1000))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
