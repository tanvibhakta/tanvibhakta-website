# rehype-wayback

Fight link rot: find the [Wayback Machine](https://web.archive.org) snapshot
of each link in a set of markdown documents, closest to the date you wrote
about it, or ask Save Page Now to create one. The results are kept in a
`{ url: snapshotUrl }` map you commit as JSON, so whatever renders your site
can show archive links without touching the network. Run it from a script or
a scheduled CI job.

Rendering is not included yet: `rehype-wayback/sync` is the only entry point.

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

## Why not an existing package

No unified/remark/rehype package found or created Wayback snapshots when this
was written; the nearest tool was an Obsidian plugin.
