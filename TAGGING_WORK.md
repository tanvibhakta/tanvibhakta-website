# Tagging System Work Log

Worktree: `.worktrees/tagging-system` (branch: `feature/tagging-system`)

## Principles (from karl-voit.at/2022/01/29/How-to-Use-Tags/)

1. **Minimize tags** — small controlled vocabulary
2. **No overlap** — each tag is distinctive
3. **Plural form** — `reviews` not `review`
4. **Lowercase only**
5. **Single words or hyphenated** — no spaces
6. **General level** — category not specifics (`ai` not `chatgpt`)
7. **Omit obvious** — don't tag what the collection name already says (e.g. a poetry post doesn't need `poetry`)
8. **One language** — English
9. **Document definitions** — each tag has a clear scope

---

## Step 1: Tag Taxonomy (final)

### Tag definitions

| Tag          | Definition                                                              |
| ------------ | ----------------------------------------------------------------------- |
| `ai-usage`   | Posts about using AI/LLMs — patterns, workflows, critique, observations |
| `konkani`    | Posts related to Konkani language, identity, or culture                 |
| `philosophy` | Reflective posts about values, definitions, ways of thinking            |
| `reviews`    | Book, film, anthology, media reviews                                    |

### Principles applied

- Format tags excluded — format is already encoded in the collection (blog, weeknotes, poetry, digital-garden)
- Weeknotes are tagged too
- Start with 4; add more only when a tag would apply to 3+ existing posts
- A post can have multiple tags (e.g. a philosophical post about AI gets both `philosophy` and `ai-usage`)

---

## Step 2: Astro Implementation ✅

- `src/content.config.ts`: exported `TAGS` const + `Tag` type; added `tags: z.array(z.enum(TAGS)).optional().default([])` to `collectionSchema`
- Build-time validation: typos in frontmatter break the build

## Step 3: Sveltia CMS Configuration ✅

- `public/admin/config.yml`: added `select` widget with `multiple: true` to blog, poetry, weeknotes, digitalGarden collections
- Pages collection intentionally excluded

## Step 4: Display in templates ✅

- `src/layouts/ProseLayout.astro`: tags appear after `<slot />` as small-caps links separated by a hairline rule
- Each tag links to `/tags/[tag]`
- New pages:
  - `src/pages/tags/index.astro` — lists all 4 tags with post counts
  - `src/pages/tags/[tag].astro` — cross-collection post list for a tag, sorted by date

## Step 5: Tag all posts

TODO — needs manual review of each post
