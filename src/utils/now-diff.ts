// Diffs between successive /now updates. Each update in posts/now/ is a full
// copy of the page, so /now shows an older update as what it changed from the
// one before it: changed paragraphs get word-level <del>/<ins> marks, and
// runs of unchanged paragraphs collapse to an ellipsis. The output is still
// markdown (with inline HTML) for the caller to render.

type Op<T> =
  | { type: "equal"; value: T }
  | { type: "del"; value: T }
  | { type: "ins"; value: T };

/** Longest-common-subsequence diff. Inputs here are a few dozen items. */
export function diffSequences<T>(a: readonly T[], b: readonly T[]): Op<T>[] {
  // lengths[i][j] = LCS length of a[i:] and b[j:].
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const ops: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", value: a[i] });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      ops.push({ type: "del", value: a[i++] });
    } else {
      ops.push({ type: "ins", value: b[j++] });
    }
  }
  while (i < a.length) ops.push({ type: "del", value: a[i++] });
  while (j < b.length) ops.push({ type: "ins", value: b[j++] });
  return ops;
}

// Markdown links stay whole so a diff never splits one into broken syntax;
// everything else splits into words and the whitespace between them.
const TOKEN = /\[[^\]]*\]\([^)]*\)|\s+|[^\s]+/g;

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

const ELLIPSIS = "…";

function wrap(tag: "del" | "ins", text: string): string {
  // Classed so the page can tell diff marks from an author's ~~strike~~,
  // which markdown also renders as <del>.
  return text ? `<${tag} class="now-${tag}">${text}</${tag}>` : "";
}

/** Word-level diff of one paragraph, as markdown with <del>/<ins> marks. */
export function diffParagraph(before: string, after: string): string {
  let out = "";
  let pending: { del: string; ins: string } = { del: "", ins: "" };
  // Whitespace kept in common right after a change. If another change
  // follows, it joins both sides, so "this year." → "years old." reads as one
  // replacement rather than two interleaved ones.
  let gap = "";
  const flush = () => {
    out += wrap("del", pending.del) + wrap("ins", pending.ins) + gap;
    pending = { del: "", ins: "" };
    gap = "";
  };
  for (const op of diffSequences(tokenize(before), tokenize(after))) {
    const changing = pending.del || pending.ins;
    if (op.type === "equal" && changing && /^\s+$/.test(op.value)) {
      gap += op.value;
    } else if (op.type === "equal") {
      flush();
      out += op.value;
    } else {
      pending.del += gap;
      pending.ins += gap;
      gap = "";
      pending[op.type] += op.value;
    }
  }
  flush();
  return out;
}

function paragraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * What changed from `before` to `after`, paragraph by paragraph. A removed
 * paragraph paired with an added one in the same spot diffs word by word;
 * any left unpaired is struck or marked as a whole.
 */
export function diffMarkdown(before: string, after: string): string {
  const blocks: string[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    const paired = Math.min(removed.length, added.length);
    for (let k = 0; k < paired; k++) {
      blocks.push(diffParagraph(removed[k], added[k]));
    }
    for (const block of removed.slice(paired)) blocks.push(wrap("del", block));
    for (const block of added.slice(paired)) blocks.push(wrap("ins", block));
    removed = [];
    added = [];
  };

  for (const op of diffSequences(paragraphs(before), paragraphs(after))) {
    if (op.type === "equal") {
      flush();
      if (blocks.at(-1) !== ELLIPSIS) blocks.push(ELLIPSIS);
    } else {
      (op.type === "del" ? removed : added).push(op.value);
    }
  }
  flush();
  return blocks.join("\n\n");
}
