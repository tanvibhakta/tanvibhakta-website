# rehype-wayback

Fight link rot: add a bracketed link to a [Wayback Machine](https://web.archive.org)
snapshot after each external link, so `[a post](https://example.com/post)`
renders as "a post [archive]", with "archive" linking to the snapshot. The
brackets come from a wrapping `<span class="archive-link">`.

It comes in two halves, so builds never touch the network:

- **`rehype-wayback/sync`** (Node) finds the snapshot of each link closest to
  the date you wrote about it, or asks Save Page Now to create one, and keeps
  the results in a `{ url: snapshotUrl }` map you commit as JSON. Run it from
  a script or a scheduled CI job.
- **`rehype-wayback`** (the rehype plugin) renders archive links from that
  map.

## Install

```sh
npm install rehype-wayback
```

## Recording snapshots

```js
import { readFile, writeFile } from "node:fs/promises";
import {
  gatherLinks,
  updateArchives,
  serializeArchives,
  SOCIAL_DOMAINS,
} from "rehype-wayback/sync";

const archives = JSON.parse(await readFile("archive-links.json", "utf8"));

// One entry per markdown document; `date` (YYYYMMDD) picks the snapshot
// closest to when you linked it.
const links = gatherLinks(
  [{ markdown: "See [a post](https://example.com/post).", date: "20240101" }],
  { exclude: [...SOCIAL_DOMAINS, "my-own-site.com"] },
);

await updateArchives(archives, links, {
  // Optional: archive.org → account → S3 API keys. Without them, only
  // existing snapshots are recorded.
  keys: { access: process.env.IA_ACCESS, secret: process.env.IA_SECRET },
  onChange: (a) => writeFile("archive-links.json", serializeArchives(a)),
  log: console.log,
});
```

Links already in the map are never looked up again. Entries whose link is no
longer in any document (or is now excluded) are pruned.

### API

- `gatherLinks(documents, { exclude })` → `Map<url, date>` of archivable
  links: every absolute http(s) link (inline, reference, autolink, GFM bare
  URL) not on an excluded domain (subdomains included) or an archive site.
- `updateArchives(archives, links, options)` → `{ added, pruned, missing }`.
  Options: `keys`, `paceMs` (default 1000, between requests),
  `maxCaptures` (default 25 per run), `onChange`, `log`, `fetch`.
- `findSnapshot(url, date?)`: closest snapshot via the availability API.
- `capture(url, keys)`: Save Page Now capture, polled to completion.
- `collectLinks(markdown)`, `shouldArchive(href, exclude)`,
  `archiveKey(href)`, `serializeArchives(archives)`, `SOCIAL_DOMAINS`.

## Rendering

```js
import rehypeWayback from "rehype-wayback";
import archives from "./archive-links.json" with { type: "json" };

unified().use(rehypeWayback, {
  archives,
  properties: { target: "_blank", rel: ["noopener"] },
  screenReaderText: " copy (opens in a new tab)",
});
```

Options:

- `archives` (required): the map from `rehype-wayback/sync`.
- `label`: link text, default `"archive"`.
- `tagName`: wrapping element, default `"span"`; `"sup"` for a superscript.
- `className`: class on the wrapping element, default `"archive-link"`. Style
  it `white-space: nowrap` so the brackets never split.
- `brackets`: text around the link, default `["[", "]"]`; `false` for none.
- `properties`: extra properties for the archive `<a>`.
- `screenReaderText`: appended in a `.sr-only` span.
- `test(link)`: which links get one; default: links with visible text, so
  image-only links are skipped.

Run it **after** plugins that add content to links (icons, screen-reader
text); otherwise they decorate the archive links too.

## Why not an existing package

No remark/rehype plugin found or created Wayback snapshots when this was
written; the nearest tool was an Obsidian plugin.
