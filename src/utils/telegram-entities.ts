/**
 * Converts Telegram Bot API message text + MessageEntity annotations into
 * CommonMark/GFM markdown suitable for committing as site content.
 *
 * Tree construction adapted from @telegraf/entity (MIT © 2023 Feathers
 * Studio). The serializer deliberately targets standard markdown, NOT
 * Telegram's MarkdownV2 dialect: minimal escaping, `**bold**`, GFM
 * strikethrough, fenced code blocks, and inline HTML where CommonMark has
 * no equivalent (underline).
 *
 * Entity offsets/lengths are UTF-16 code units — which is exactly how
 * JavaScript strings are indexed, so plain .slice() is correct even for
 * text containing astral-plane emoji.
 */

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  user?: { id: number; first_name?: string };
  custom_emoji_id?: string;
}

interface EntityNode extends TelegramMessageEntity {
  text: string;
  children: TreeNode[];
}

type TreeNode = string | EntityNode;

// Entity types whose visible text already renders correctly and must not be
// escaped (a backslash inside a URL or @mention would corrupt it).
const RAW_TYPES = new Set([
  "url",
  "mention",
  "hashtag",
  "cashtag",
  "bot_command",
  "email",
  "phone_number",
]);

// Telegram splits overlapping formats into adjacent entities of the same
// type; these are the wrapper types where "**co****ming**" artifacts would
// otherwise appear.
const MERGEABLE_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
]);

export function entitiesToMarkdown(
  text: string,
  entities: TelegramMessageEntity[] = [],
): string {
  const sorted = [...entities].sort(
    (a, b) => a.offset - b.offset || b.length - a.length,
  );
  return serialize(mergeAdjacent(toTree(text, sorted, 0, text.length)));
}

// Telegram guarantees entities are properly nested or disjoint, so a
// containment check against the parent's end is enough to collect children.
function toTree(
  text: string,
  entities: TelegramMessageEntity[],
  offset: number,
  upto: number,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  let last = offset;
  let i = 0;
  while (i < entities.length) {
    const entity = entities[i];
    if (last < entity.offset) {
      nodes.push(text.slice(last, entity.offset));
    }
    const end = entity.offset + entity.length;
    const children: TelegramMessageEntity[] = [];
    for (let j = i + 1; j < entities.length; j++) {
      if (entities[j].offset + entities[j].length > end) break;
      children.push(entities[j]);
    }
    nodes.push({
      ...entity,
      text: text.slice(entity.offset, end),
      children: toTree(text, children, entity.offset, end),
    });
    last = end;
    i += children.length + 1;
  }
  if (last < upto) {
    const tail = text.slice(last, upto);
    if (tail) nodes.push(tail);
  }
  return nodes;
}

function mergeAdjacent(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (
      typeof node !== "string" &&
      prev !== undefined &&
      typeof prev !== "string" &&
      prev.type === node.type &&
      prev.offset + prev.length === node.offset &&
      MERGEABLE_TYPES.has(node.type)
    ) {
      prev.length += node.length;
      prev.text += node.text;
      prev.children = mergeAdjacent([...prev.children, ...node.children]);
    } else if (typeof node === "string") {
      out.push(node);
    } else {
      out.push({ ...node, children: mergeAdjacent(node.children) });
    }
  }
  return out;
}

function serialize(nodes: TreeNode[]): string {
  let out = "";
  for (const node of nodes) {
    out += typeof node === "string" ? escapeText(node) : serializeNode(node);
  }
  return out;
}

function serializeNode(node: EntityNode): string {
  switch (node.type) {
    case "bold":
      return wrapEmphasis(serialize(node.children), "**");
    case "italic":
      return wrapEmphasis(serialize(node.children), "*");
    case "strikethrough":
      return wrapEmphasis(serialize(node.children), "~~");
    case "underline":
      return `<u>${serialize(node.children)}</u>`;
    case "code":
      return codeSpan(node.text);
    case "pre":
      return preBlock(node.text, node.language ?? "");
    case "text_link":
      return `[${serialize(node.children)}](${node.url ?? ""})`;
    case "blockquote":
    case "expandable_blockquote":
      return serialize(node.children)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    default:
      // Raw types render as-is; spoiler/text_mention/custom_emoji have no
      // markdown equivalent and degrade to their visible text.
      return RAW_TYPES.has(node.type) ? node.text : serialize(node.children);
  }
}

// CommonMark flanking rules reject emphasis whose content starts/ends with
// whitespace ("**ab **" is literal asterisks), so shift it outside.
function wrapEmphasis(inner: string, delim: string): string {
  const [, lead, core, trail] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (!core) return inner;
  return `${lead}${delim}${core}${delim}${trail}`;
}

function codeSpan(content: string): string {
  const longestRun = (content.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0,
  );
  const fence = "`".repeat(longestRun + 1);
  const pad = content.startsWith("`") || content.endsWith("`") ? " " : "";
  return `${fence}${pad}${content}${pad}${fence}`;
}

function preBlock(content: string, language: string): string {
  const longestRun = (content.match(/`{3,}/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    2,
  );
  const fence = "`".repeat(longestRun + 1);
  return `${fence}${language}\n${content.replace(/\n$/, "")}\n${fence}`;
}

// Escape only what CommonMark actually assigns meaning to. Inline specials
// are escaped everywhere; block markers (headings, lists, quotes) only
// where they'd trigger: at the start of a line, followed by the syntax
// they need. Telegram messages are plain text plus entities, so any such
// character the author typed was meant literally.
function escapeText(text: string): string {
  return text
    .replace(/[\\*_[\]<`]/g, (ch) => `\\${ch}`)
    .replace(/^(\s*)(>|#{1,6}(?= )|[-+](?= ))/gm, "$1\\$2")
    .replace(/^(\s*\d+)\.(?= )/gm, "$1\\.");
}
