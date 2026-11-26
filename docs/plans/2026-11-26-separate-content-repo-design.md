# Separate content repo

**Date:** 2026-11-26
**Status:** Design. No plan yet.

## Goal

Move the site's content out of `tanvibhakta/tanvibhakta-website` into a
private repo, `tanvibhakta/tanvibhakta-content`. The site repo keeps only
code. The site reads the content at build time.

Two problems drive this:

1. **Drafts are public.** The site repo is public, so every `draft: true`
   file, and every revision of it, can be read on GitHub.
2. **Content and code share one history.** 81 of the 169 commits on `main`
   touch `posts/`. Sveltia saves, Telegram notes and audio transcodes
   crowd out code changes in `git log`, CI runs and PR diffs.

Content stays versioned, in markdown, in git. This doc moves it to a repo of
its own and changes nothing about how it is written or rendered.

## Non-goals

- **Changing the content format.** Markdown, frontmatter, colocated
  `images/` folders, and gallery and caption conventions all stay as they are.
  `src/content.config.ts` keeps its schemas.
- **Removing `/drafts` from production.** It stays, unlisted and noindex,
  as it is now; see "Drafts" for the follow-up toggle.
- **Scrubbing old drafts from the site repo's history.** See "History".
- **Moving images to R2.** The 750MB trigger in
  `2026-09-07-colocated-images-design.md` now applies to the content repo.

## What moves

| Today (site repo)       | Content repo      | Notes                                     |
| ----------------------- | ----------------- | ----------------------------------------- |
| `posts/blog/`           | `blog/`           | with `images/`                            |
| `posts/poetry/`         | `poetry/`         |                                           |
| `posts/weeknotes/`      | `weeknotes/`      |                                           |
| `posts/digital-garden/` | `digital-garden/` |                                           |
| `posts/notes/`          | `notes/`          | the Telegram bot writes here              |
| `posts/pages/`          | `pages/`          | includes `_anchor-fixture.md` (see below) |
| `public/media/audio/`   | `media/audio/`    | served at `/media/audio/...` as now       |
| `_posts/` (Jekyll 2018) | `_legacy/jekyll/` | not in a collection; archived only        |

**Stays in the site repo:** the code (`src/`, `scripts/`, `tests/`), the
Sveltia config `public/admin/`, `public/_redirects`, `public/resume.pdf`,
the favicons, and `src/pages/work.mdx` and `src/pages/404.md`. Those two
are routes with layout and component imports, so they belong with the code.

The content repo has no top-level `posts/` folder. Every path in it is
already content, so a prefix would only make paths longer. Paths inside
markdown don't change: images are relative (`images/foo.webp`) and audio is
root-absolute (`/media/audio/x.ogg`).

## How the site finds content

One env var, `CONTENT_DIR`, defaults to `./content`, which is gitignored in
the site repo. One helper, `src/utils/content-dir.ts`, resolves it, and
everything that needs a content path goes through it:

```ts
// src/utils/content-dir.ts
export const CONTENT_DIR = path.resolve(process.env.CONTENT_DIR ?? "content");
export const contentPath = (...p: string[]) => path.join(CONTENT_DIR, ...p);
```

Callers that change:

- **`src/content.config.ts`:** each loader becomes `glob({ base:
contentPath("blog"), ... })`. If `CONTENT_DIR` is missing, the build
  fails up front with a "run `pnpm content:pull`" message. Otherwise the
  only symptom would be a silently empty site.
- **`scripts/new-content.ts` and `scripts/transcode-audio.ts`:** the
  directories become `contentPath(...)`.
- **`pnpm img`:** unchanged. It takes a file path.
- **`tests/cms-tags.test.ts`:** reads folders from the Sveltia config,
  which are now content-repo-relative, and resolves them against
  `CONTENT_DIR` instead of the site root.
- **Audio:** audio must be under `public/` to be served. The fetch step
  symlinks `content/media` → `public/media`, and `public/media` is
  gitignored. A symlink rather than a copy, so dev picks up new audio
  without re-running anything.

### Getting the content

`scripts/fetch-content.sh` does the work for both local use and Netlify:

1. If `$CONTENT_DIR` is already a git checkout, `git pull --ff-only`.
   Otherwise `git clone --depth 1` the content repo into it. On Netlify the
   clone URL carries `CONTENT_REPO_TOKEN`; locally your own git credentials
   are used.
2. Symlink `public/media` to `$CONTENT_DIR/media`.
3. Print the content commit SHA, so every build log records which content
   it built.

`pnpm content:pull` runs it.

**Worktrees:** `.worktrees/<branch>/content` would be a separate clone per
worktree. Instead, set `CONTENT_DIR` to one shared checkout, e.g.
`~/code/tanvibhakta-content`, in a shell profile or `.env`. The script then
only pulls it. Editing content from a site worktree means working in that
checkout.

### Why not a git submodule

A submodule pins the site to a content commit. Every content change would
then also need a "bump content" commit in the site repo, which brings the
coupling back. The site should build whatever content `main` holds right
now. The SHA in the build log is enough to tell which content a deploy
used.

## Netlify

- **Build command:**
  `bash scripts/fetch-content.sh && rm -rf node_modules/.astro && pnpm run build`.
  The cache wipe stays, for the reason given in `netlify.toml`.
- **`CONTENT_REPO_TOKEN`:** a fine-grained PAT with only _Contents:
  read_ on `tanvibhakta-content`, saved as a Netlify env var. Scope it to
  builds only; functions don't need it.
- **Rebuild on content change:** create a Netlify build hook for `main`.
  Content-repo workflow `deploy.yml` runs on every push to `main` and POSTs
  to the hook:
  `curl -X POST -d '{}' "$NETLIFY_BUILD_HOOK?trigger_title=content+$SHA"`.
  The hook URL is a content-repo secret. `trigger_title` puts the content
  SHA in Netlify's deploy list.
- **Bad content:** if content fails the schema, the Netlify build fails
  and the last good deploy keeps serving. Content CI (below) should catch
  it before that.

Site-repo pushes still deploy as now, against current content `main`.

## Writing tools

### Sveltia

`public/admin/config.yml`:

- `backend.repo: tanvibhakta/tanvibhakta-content`.
- `folder: posts/blog` → `folder: blog`, and so on for every collection.
- Global `media_folder: public/media` → `media`. Audio fields:
  `media_folder: /media/audio`, with `public_folder` unchanged.

Sveltia signs in to GitHub as you, so a private repo works. `local_backend`
needs the local proxy run from the content checkout, not the site's.

### Telegram notes bot

- **Netlify function env:** `GITHUB_REPO` →
  `tanvibhakta/tanvibhakta-content`. `GITHUB_TOKEN` becomes a
  fine-grained PAT with _Contents: read and write_ on the content repo
  only. That is narrower than today, because the bot can no longer write
  to the code repo.
- **Code:** `NOTES_DIR` in `src/utils/photo-note.ts` and
  `src/utils/note-reply.ts` goes from `"posts/notes"` to `"notes"`.
  Path fixtures in `tests/photo-note.test.ts`, `tests/note-reply.test.ts`
  and `tests/github-commit.test.ts` change to match.
- **Unchanged:** the "live once the rebuild finishes" reply, because the
  commit triggers `deploy.yml`.

The function keeps running from the site repo. Its code is site code; it
just writes to a different repo.

## CI

### Content repo

The content repo has no `package.json`. It borrows the site's tooling by
checking out the site repo, which is public and needs no token, next to
itself:

- **`validate.yml`** runs on push and PR. It checks out content and the
  site's `main`, runs `pnpm install`, and with `CONTENT_DIR` pointing at the
  content checkout runs:
  - `pnpm build`, which catches schema errors such as a bad date or a tag
    that isn't kebab-case;
  - `pnpm test`, which runs the link checker, feeds and horizontal scroll;
  - `scripts/check-image-metadata.ts` over `**/images/*`;
  - `prettier --check` with the site's config;
  - the repo-size check, moved from `content-validation.yml`.
- **`transcode-audio.yml`** moves here unchanged in what it does. It runs
  the site's `scripts/transcode-audio.ts` against the content checkout and
  commits to the content repo.
- **`deploy.yml`** runs the build hook, as described under "Netlify". It
  runs only after `validate.yml` passes, so a red push never deploys.

### Site repo

- **`ci.yml`** clones content with a `CONTENT_REPO_TOKEN` repo secret
  before `pnpm check`. Integration tests keep running against real
  content, which is what makes them useful.
- **Removed:** `content-validation.yml` and `transcode-audio.yml`. Their
  checks have moved to the content repo.
- **lint-staged:** the `posts/**/images/*` rule is removed. The image
  guard is now CI-only for content.

### What is lost: the pre-commit image guard on content

Content commits from a laptop no longer go through the site's Husky hooks,
so a full-size, metadata-bearing image can reach the content repo. It would
then fail `validate.yml` and never deploy, but it stays in the repo's
history. Sveltia's upload transform and `pnpm img` already cover the usual
paths. If this bites, add a minimal `package.json` and Husky hook to the
content repo that runs the site's checker.

## Drafts

The content repo being private fixes problem 1 for the repo. It does not
change `/drafts/...` on the live site, which is still unlisted, noindex,
and reachable by anyone with the URL. That route is a feature: drafts can
be shared for review, and `public/_redirects` relies on the draft URL
mirroring the published one.

**Follow-up, not part of this migration:** gate the `/drafts` routes on
`BUILD_DRAFTS=true`.

- **Production:** set it false.
- **Draft previews:** set it true on a `drafts` branch deploy of the site
  repo. Point a second build hook at that branch and have `deploy.yml`
  POST to both, so drafts show up at `drafts--<site>.netlify.app/drafts/...`.
- **Redirects:** draft URLs would then 404 in production, so the
  draft-to-published redirects in `_redirects` would only be needed for
  links shared from the preview host.

## History

- **New content repo:** built with `git filter-repo` from a fresh clone of
  the site repo, so the content keeps its full history:

  ```sh
  git clone https://github.com/tanvibhakta/tanvibhakta-website content-split
  cd content-split
  git filter-repo \
    --path posts/ --path public/media/ --path _posts/ \
    --path-rename posts/: \
    --path-rename public/media/:media/ \
    --path-rename _posts/:_legacy/jekyll/
  git remote add origin git@github.com:tanvibhakta/tanvibhakta-content.git
  git push -u origin main
  ```

- **Site repo:** a single commit deletes those paths. Its history still
  holds every past draft. Rewriting that history would mean a force-push
  to a public `main`, broken PR refs, and stale forks and GitHub caches,
  and it still wouldn't guarantee removal. Do it only if one specific past
  draft has to go. In that case, use GitHub's sensitive-data removal process
  for that one path rather than a blanket rewrite.

## Cutover

Order matters: nothing should be able to write content to the old repo after
the split commit.

1. Create `tanvibhakta-content`, private, and push the filtered history to it.
2. Create both PATs. Set `CONTENT_REPO_TOKEN` on Netlify and in site
   repo secrets, and `NETLIFY_BUILD_HOOK` in content repo secrets.
3. Add the content repo's workflows, with `validate.yml` temporarily
   checking out the step 4 PR branch. The site's `main` still reads
   `posts/`, so validating against it would fail. Switch it back to `main`
   after the merge.
4. Site PR: `content-dir.ts`, the loader and script changes, the fetch
   script, the build command, Sveltia config, `NOTES_DIR`, CI changes,
   deletion of the moved paths, `.gitignore` entries, README and
   CLAUDE.md updates. Its deploy preview proves the clone-and-build path
   end to end.
5. Pause Telegram by unsetting the webhook, and stop editing in Sveltia.
6. Re-run the filter and force-push the content repo. That picks up
   anything committed since step 1. This is safe because nothing else has
   written to the content repo yet.
7. Merge the site PR, then switch `GITHUB_REPO`/`GITHUB_TOKEN` on the
   function and re-set the Telegram webhook.
8. Check: send a Telegram note, save a Sveltia draft, push an audio file.
   Each should land in the content repo and deploy.

## Docs to update

- **`CLAUDE.md`:** the content-collections paths, the images section's
  `posts/blog/images/` example, and the Telegram paths.
- **`README.md`:** `pnpm content:pull` and `CONTENT_DIR` in setup.
- **`docs/markdown-pipelines.md`:** the `_posts/` line.
- **Content repo `README`:** what lives here, that it renders via the
  site repo, and how to preview locally.

## Open questions

- **`_anchor-fixture.md`** is a test fixture living in content. Moving it
  with `pages/` changes no code, but site tests then depend on a file in
  the content repo. Alternative: a fixtures-only collection in the site repo
  under `tests/fixtures/`. Defer until it causes a problem.
- **Site PRs build against live content `main`.** A content change can
  break a site PR's CI with nothing wrong in the code. That is acceptable
  for one author, and it shows up in the next content push's own CI anyway.
