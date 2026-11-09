# rehype-wayback

Fight link rot: find the [Wayback Machine](https://web.archive.org) snapshot
of each link in a set of markdown documents, closest to the date you wrote
about it, or ask Save Page Now to create one. The results are kept in a
`{ url: snapshotUrl }` map you commit as JSON, so whatever renders your site
can show archive links without touching the network. Run it from a script or
a scheduled CI job.

The rehype plugin then attaches each snapshot to its link as an invisible
`data-archive` attribute, for your CSS or scripts to use however you like.

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
const attempts = JSON.parse(await readFile("archive-attempts.json", "utf8"));

// One entry per markdown document; `date` (YYYYMMDD) picks the snapshot
// closest to when you linked it.
const links = gatherLinks(
  [{ markdown: "See [a post](https://example.com/post).", date: "20240101" }],
  { exclude: [...SOCIAL_DOMAINS, "my-own-site.com"] },
);

const result = await updateArchives(archives, links, {
  attempts,
  // Optional: archive.org → account → S3 API keys. Without them, only
  // existing snapshots are recorded.
  keys: { access: process.env.IA_ACCESS, secret: process.env.IA_SECRET },
  onChange: async (a, t) => {
    await writeFile("archive-links.json", serializeArchives(a));
    await writeFile("archive-attempts.json", serializeArchives(t));
  },
  log: console.log,
  warn: (url, reason) => console.warn(`${url}: ${reason}`),
});
if (result.authFailed) throw new Error("archive.org rejected the keys");
```

Links already in the map are never looked up again. Entries whose link is no
longer in any document (or is now excluded) are pruned, from both maps.

Failed captures are recorded in `attempts` (`{ failures, firstFailed,
lastTried, lastError }` per link). Each run visits never-attempted links
first, then the least recently tried, so links a site always refuses can't use
up every run's captures. After `slowAfter` failures a link is captured at most
once per `slowIntervalDays`; its (cheap) lookup still runs every time, and its
entry is removed as soon as a snapshot exists.

### API

- `gatherLinks(documents, { exclude })` → `Map<url, date>` of archivable
  links: every absolute http(s) link (inline, reference definition — used or
  not, since an orphan definition is likely a mistake worth keeping a
  snapshot of — autolink, GFM bare URL) not on an excluded domain
  (subdomains included) or an archive site.
- `updateArchives(archives, links, options)` → `{ added, pruned, missing,
requests, requestErrors, authFailed }`. `requestErrors` counts requests that
  failed outright (network, timeout, HTTP error) as opposed to finding no
  snapshot, and `authFailed` is set by any 401/403, so a caller can tell an
  outage or bad keys from ordinary misses. Options:
  - `attempts`: the attempts map, mutated in place.
  - `keys`: archive.org S3 keys; without them nothing is captured.
  - `maxCaptures` (default 25): capture attempts per run, failures included.
  - `slowAfter` (default 5), `slowIntervalDays` (default 30).
  - `prune` (default true): `false` keeps entries for links not in `links`,
    for a run over a sample of them.
  - `paceMs` (default 1000): pause between links.
  - `requestTimeoutMs` (default 30000): abort a request after this long.
  - `retryAfterMs` (default 60000): wait before retrying a 429 once.
  - `pollMs` (default 5000), `captureTimeoutMs` (default 180000): how often
    and how long to wait for a capture.
  - `onRequest(info)`: called after every HTTP request with
    `{ kind, url, ms, status?, error? }`, where `kind` is `"lookup"`
    (availability API), `"capture"` (the Save Page Now POST) or `"status"`
    (one status poll); and once per finished capture with kind
    `"capture-total"`, timed from the POST to the outcome, with `error` set
    if it failed or timed out. For measuring how long archive.org takes.
  - `warn(url, reason)`: called for each link whose lookup or capture failed
    (default: a `✗ url: reason` line through `log`).
  - `onChange(archives, attempts)`, `log(line)`, `fetch`, `now`.
- `findSnapshot(url, date?, options?)`: closest snapshot via the availability
  API. `capture(url, keys, options?)`: Save Page Now capture, polled to
  completion; `null` if it doesn't finish in time. Both take `fetch`,
  `requestTimeoutMs`, `retryAfterMs`, `onRequest`, and throw `RequestError`
  (with the HTTP `status`, if any) when a request fails.
- `collectLinks(markdown)`, `shouldArchive(href, exclude)`,
  `archiveKey(href)`, `serializeArchives(map)`, `SOCIAL_DOMAINS`.

### URL keys

Links are recorded under `archiveKey(href)`: the fragment is dropped and the
host lowercased, so `https://Example.com/a#b` and `https://example.com/a`
share a snapshot. `http` and `https`, `www.` and bare hosts, and URLs that
differ only in query string (tracking parameters included) stay distinct on
purpose: stripping them could merge genuinely different pages. The cost is
the occasional duplicate lookup.

## Attaching snapshots to links

```js
import rehypeWayback from "rehype-wayback";
import archives from "./archive-links.json" with { type: "json" };

unified().use(rehypeWayback, { archives });
```

```html
<a
  href="https://example.com/post"
  data-archive="https://web.archive.org/web/20240101000000/https://example.com/post"
  >a post</a
>
```

Nothing visible is added. Links are matched by `archiveKey` (fragment
dropped, host lowercased).

## Why not an existing package

No unified/remark/rehype package found or created Wayback snapshots when this
was written. The closest tool,
[archive-md-urls](https://github.com/sbaack/archive-md-urls), scans Markdown
and picks the snapshot nearest each file's date, but rewrites the links in the
Markdown itself; this package keeps the source untouched, records snapshots in
a separate map, and creates ones that don't exist.
