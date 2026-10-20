# Markdown pipelines

Content reaches `posts/` through several authoring paths, and the committed
markdown is then rendered by several different parsers. They disagree. This
doc tracks every path, how it treats markdown, and known breakages, so we can
standardise. Update it whenever a new path appears or a quirk is found.

## The failure that started this

`posts/blog/what’s-in-a-name.md` (2026-10-17, commits `b99e30b`, `7fb56a4`)
was written in iA Writer and pasted into Sveltia. The published file contained
escaped syntax (since fixed by hand), so it rendered as literal characters:

```md
\> What’s the story behind your domain name? ...
I can’t think of anything I would change it \*to\*.
\---
```

Mechanism: Sveltia's `markdown` widget opens in **rich text** mode. Pasted
markdown is treated as plain prose, and on save Sveltia's serializer escapes
every character that would otherwise be syntax. Emphasis that was re-applied
by hand in the rich editor (the `7fb56a4` update) came out as `_italic_`,
Sveltia's own emphasis style; the rest stayed escaped.

## The shared failure mode

Two inputs are **WYSIWYG/entity-based**: they store formatting as structure,
not as characters. Anything you type that looks like markdown is assumed to be
literal and gets backslash-escaped.

| Input                 | Formatting comes from        | Typed/pasted `*x*`, `> x`, `---` |
| --------------------- | ---------------------------- | -------------------------------- |
| Sveltia (rich text)   | editor toolbar / shortcuts   | escaped → renders literally      |
| Telegram notes bot    | Telegram message entities    | escaped → renders literally      |
| Sveltia (raw mode)    | the characters you type      | kept as markdown                 |
| VS Code / iA Writer   | the characters you type      | kept as markdown                 |

So: **pasting markdown source into Sveltia rich text or into Telegram breaks
it.** Typing markdown in a plain-text editor works.

## Authoring paths

### Sveltia CMS (`public/admin/config.yml`)

- Body fields use `widget: markdown`. Until the fix below they had no
  `modes` option, so rich text was the default.
- Serializer style observed: `_italic_`, curly quotes preserved, trailing
  spaces at line ends preserved.
- Entry filenames come from `{{slug}}` of the title and keep curly
  apostrophes (`what’s-in-a-name.md`). The site's slug strips them, so the
  URL is clean (`/blog/whats-in-a-name`); only the repo filename is odd.
- Open question: does it serialize bold as `**` or `__`, lists as `-` or `*`?

### Telegram notes bot (`src/utils/telegram-entities.ts`)

- Converts Telegram entities to CommonMark/GFM: `**bold**`, `*italic*`,
  `~~strike~~`, `<u>underline</u>`, fenced code, `> ` blockquotes, `[text](url)`.
- `escapeText` escapes `\ * _ [ ] < `` ` everywhere, and `>`, `#`, `-`, `+`,
  `1.` at line starts — by design, since entity-less text is "meant literally".
- Spoilers, custom emoji and text mentions degrade to plain text.
- Some Telegram clients turn typed `**x**` into a bold entity before sending;
  others send it as literal text, which then gets escaped. Unverified per
  client.

### VS Code (direct file edits)

- What you type is what gets committed. No transformation.
- VS Code's preview is GFM **without** `remark-breaks`, so single newlines
  look different there than on the site.

### iA Writer

- Not an input on its own: text is copied out of it into one of the above.
- Unverified: whether its copy puts plain markdown or rich HTML on the
  clipboard (it depends on settings / "Copy as" choice). If it offers rich
  HTML, pasting that into Sveltia rich text may convert correctly; plain
  markdown does not (see the failure above).
- iA Writer's preview has its own typography (smart quotes, line breaks).

### Claude / coding agents

- Write files directly, like VS Code. Habits vary between sessions: straight
  vs curly quotes, `*` vs `_`, hard-wrapped vs unwrapped paragraphs.

### One-off imports

- **Twitter archive** (e.g. `c53fe31`, the LHTL thread): tweets → notes by
  script; hand-edited afterwards. t.co links and @handles need care.
- **Mataroa export** (`1653671`, `c247e08`): Mataroa's markdown, with links
  rewritten to internal ones.
- **Jekyll `_posts/`** (2018): legacy, not in a content collection.
- `pnpm new` (`scripts/new-content.ts`) only scaffolds frontmatter.

## Rendering paths

The same file is rendered by different parsers with different settings:

| Renderer                       | Parser                      | Single newline | Galleries | Anchors |
| ------------------------------ | --------------------------- | -------------- | --------- | ------- |
| Site pages                     | Astro remark/rehype + GFM   | `<br>` (`remark-breaks`) | yes | yes, except poetry/notes |
| RSS feeds (`src/utils/feeds.ts`) | `new MarkdownIt()` default | joined into one line | no | no |
| Titles (`src/utils/title-markdown.ts`) | markdown-it, inline subset | n/a | n/a | n/a |
| Sveltia preview                | Sveltia's own               | unverified     | no        | no      |
| GitHub file view, VS Code preview | GFM                      | joined         | no        | no      |

### Known rendering mismatches

- **Feeds ignore line breaks.** markdown-it's `breaks` is off, so poems and
  notes that rely on single newlines collapse into one paragraph in RSS
  readers while looking right on the site.
- **Feeds get no galleries.** Grouped images come through as separate `<img>`.
- **Emoji shortcodes** (`:grin:`) aren't rendered anywhere — no plugin.

## Sveltia editor fixes

Options for the editor itself, from Sveltia's config schema
(`https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json`):

| Option | Effect | Status |
| --- | --- | --- |
| `modes: [raw, rich_text]` | Editor opens on markdown source; rich text is one toggle away. Pasting markdown works. | **Done** — every body field |
| `modes: [raw]` | Rich text removed entirely; no way to hit the bug. | Fallback if raw-first still gets toggled by habit |
| `editor_components: [..., hr, table]` | Rich text has no horizontal-rule or table button by default, which is why `---` could only be typed (and got escaped). Setting this replaces the default list, so every built-in component must be listed too. | Not done; only matters if rich text stays in use |
| `publish_mode: preview` | Each save opens a PR with a deploy preview instead of committing to `main`, so broken formatting is visible before it's live. | Not done; changes the publishing workflow |

Raw mode doesn't escape anything, so pastes from iA Writer, VS Code or
anywhere else arrive as written. Things to recheck after the change:
whether the toggle remembers rich text per entry, and how raw mode handles
the image upload button.

## Standardisation options (not yet decided)

1. ~~Sveltia raw-first editing~~ — done, see above.
2. A lint/pre-commit check that flags `\*`, `\>`, `\---`, `\_` in `posts/`
   — almost always an escaping accident outside Telegram.
3. Make the feed renderer match the site (`breaks: true`, or render via the
   same remark pipeline).
4. Pick one emphasis style (`*` or `_`) and normalise with Prettier. Note
   Prettier (lint-staged) only runs on **local** commits — VS Code and
   agents. Sveltia and the Telegram bot commit via the GitHub API and skip
   every pre-commit hook, so normalising them needs a CI step or a check
   in their own code.
5. Slugify away curly quotes in Sveltia filenames (cosmetic; URLs are
   already clean).
