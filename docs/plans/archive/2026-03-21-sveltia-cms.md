# Sveltia CMS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/admin` CMS interface using Sveltia CMS so content can be published from any device (phone, tablet, etc.) via a browser-based editor that commits directly to GitHub.

**Architecture:** Sveltia CMS is a static, client-side CMS that lives at `public/admin/`. It authenticates via GitHub OAuth (using Netlify as the OAuth client), reads/writes content as markdown files in the existing `posts/` directories, and commits changes directly to the `main` branch. No server-side code is needed — the CMS is just two static files (`index.html` + `config.yml`). We also move the `draft` field to the shared schema so all collections support drafts, and fix the RSS feed to exclude draft posts.

**Tech Stack:** Sveltia CMS (CDN script), Astro content collections, GitHub OAuth via Netlify, Vitest for tests

---

### Task 1: Move `draft` to shared schema in content.config.ts

**Files:**

- Modify: `src/content.config.ts:4-17`

**Step 1: Write the failing test**

Create a test that verifies all collections have the `draft` field in their schema. Add to `tests/content-schema.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock astro modules
vi.mock("astro:content", () => ({
  defineCollection: vi.fn((config) => config),
  z: {
    object: vi.fn((shape) => ({
      extend: vi.fn((extra) => ({ ...shape, ...extra })),
      ...shape,
    })),
    string: vi.fn(() => "z.string"),
    date: vi.fn(() => "z.date"),
    boolean: vi.fn(() => ({
      optional: vi.fn(() => "z.boolean.optional"),
    })),
  },
}));

vi.mock("astro/loaders", () => ({
  glob: vi.fn(),
}));

describe("Content Schema", () => {
  it("should include draft as optional boolean in the shared collectionSchema", async () => {
    // Re-import to get fresh module with mocks
    const { collections } = await import("../src/content.config");

    // All collections should exist
    expect(collections).toHaveProperty("blog");
    expect(collections).toHaveProperty("weeknotes");
    expect(collections).toHaveProperty("poetry");
    expect(collections).toHaveProperty("digitalGarden");
  });
});
```

**Step 2: Run test to verify it passes (baseline)**

Run: `npx vitest run tests/content-schema.test.ts`
Expected: PASS (this is a baseline sanity check)

**Step 3: Modify the shared schema**

In `src/content.config.ts`, move `draft` from the blog-specific extension to the shared `collectionSchema`:

Change this:

```typescript
const collectionSchema = z.object({
  title: z.string(),
  publishedOn: z.date(),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/blog/" }),
  schema: collectionSchema.extend({
    draft: z.boolean().optional(),
  }),
});
```

To this:

```typescript
const collectionSchema = z.object({
  title: z.string(),
  publishedOn: z.date(),
  draft: z.boolean().optional(),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts/blog/" }),
  schema: collectionSchema,
});
```

The `digitalGarden` collection keeps its own `.extend()` for `description` and `lastUpdatedOn` — those are collection-specific fields. Only `draft` moves to shared.

**Step 4: Run tests to verify nothing broke**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/content.config.ts tests/content-schema.test.ts
git commit -m "feat: move draft field to shared content schema for all collections"
```

---

### Task 2: Add draft filtering to all collection pages and slug routes

Currently only `blog/index.astro` and `blog/[...slug].astro` filter drafts. We need to add the same filtering to poetry, weeknotes, and digital-garden.

**Files:**

- Modify: `src/pages/poetry/index.astro:5`
- Modify: `src/pages/poetry/[...slug].astro:6`
- Modify: `src/pages/weeknotes/index.astro:4`
- Modify: `src/pages/weeknotes/[...slug].astro:6`
- Modify: `src/pages/digital-garden/index.astro:5`
- Modify: `src/pages/digital-garden/[...slug].astro:6`

**Step 1: Add draft filtering to poetry index**

In `src/pages/poetry/index.astro`, change:

```astro
const allPoetry = await getCollection("poetry");
```

To:

```astro
const allPoetry = (await getCollection("poetry")).filter((poem) =>
!poem.data.draft);
```

**Step 2: Add draft filtering to poetry slug route**

In `src/pages/poetry/[...slug].astro`, change:

```astro
const poetry = await getCollection("poetry");
```

To:

```astro
const poetry = (await getCollection("poetry")).filter((poem) =>
!poem.data.draft);
```

**Step 3: Add draft filtering to weeknotes index**

In `src/pages/weeknotes/index.astro`, change:

```astro
const sortedWeeknotes = (await getCollection("weeknotes")).sort(
```

To:

```astro
const sortedWeeknotes = (await getCollection("weeknotes")).filter((weeknote) =>
!weeknote.data.draft).sort(
```

**Step 4: Add draft filtering to weeknotes slug route**

In `src/pages/weeknotes/[...slug].astro`, change:

```astro
const weeknotes = await getCollection("weeknotes");
```

To:

```astro
const weeknotes = (await getCollection("weeknotes")).filter((weeknote) =>
!weeknote.data.draft);
```

**Step 5: Add draft filtering to digital-garden index**

In `src/pages/digital-garden/index.astro`, change:

```astro
const sortedGardenPosts = (await getCollection("digitalGarden")).sort(
```

To:

```astro
const sortedGardenPosts = (await getCollection("digitalGarden")).filter((post)
=> !post.data.draft).sort(
```

**Step 6: Add draft filtering to digital-garden slug route**

In `src/pages/digital-garden/[...slug].astro`, change:

```astro
const gardenPosts = await getCollection("digitalGarden");
```

To:

```astro
const gardenPosts = (await getCollection("digitalGarden")).filter((post) =>
!post.data.draft);
```

**Step 7: Run the build to verify nothing broke**

Run: `npx astro build`
Expected: Build succeeds with no errors

**Step 8: Commit**

```bash
git add src/pages/poetry/index.astro src/pages/poetry/\[...slug\].astro src/pages/weeknotes/index.astro src/pages/weeknotes/\[...slug\].astro src/pages/digital-garden/index.astro src/pages/digital-garden/\[...slug\].astro
git commit -m "feat: filter draft posts from all collection pages and routes"
```

---

### Task 3: Exclude drafts from RSS feeds

The RSS feed currently includes all posts regardless of draft status. We need to filter them out.

**Files:**

- Modify: `src/utils/feeds.ts:74-89`
- Modify: `tests/feeds.test.ts`

**Step 1: Write the failing test**

Add a new test to `tests/feeds.test.ts` inside the "Feed Content Generation" describe block:

```typescript
it("should exclude draft posts from the main feed", async () => {
  const { getCollection: mockGetCollection } = await import("astro:content");
  const rssModule = await import("@astrojs/rss");
  const mockRss = vi.mocked(rssModule.default);

  const mockPublishedPost = {
    id: "published-post",
    collection: "blog",
    data: {
      title: "Published Post",
      publishedOn: new Date("2025-01-01"),
      draft: false,
    },
    body: "Published content",
  };

  const mockDraftPost = {
    id: "draft-post",
    collection: "blog",
    data: {
      title: "Draft Post",
      publishedOn: new Date("2025-01-02"),
      draft: true,
    },
    body: "Draft content",
  };

  const mockNoDraftField = {
    id: "no-draft-field",
    collection: "blog",
    data: {
      title: "No Draft Field",
      publishedOn: new Date("2025-01-03"),
    },
    body: "Content without draft field",
  };

  vi.mocked(mockGetCollection).mockResolvedValue([
    mockPublishedPost,
    mockDraftPost,
    mockNoDraftField,
  ]);

  mockRss.mockReturnValue(
    new Response('<?xml version="1.0"?><rss></rss>', {
      headers: { "Content-Type": "application/rss+xml" },
    }),
  );

  await generateMainFeed();

  expect(mockRss).toHaveBeenCalled();
  const callArgs = mockRss.mock.calls[0][0];
  const feedItems = callArgs.items;

  // Should include published and no-draft-field, exclude draft
  expect(feedItems).toHaveLength(2);
  expect(feedItems.map((item) => item.title)).not.toContain(
    expect.stringContaining("Draft Post"),
  );
});

it("should exclude draft posts from collection feeds", async () => {
  const { getCollection: mockGetCollection } = await import("astro:content");
  const rssModule = await import("@astrojs/rss");
  const mockRss = vi.mocked(rssModule.default);

  vi.mocked(mockGetCollection).mockResolvedValue([
    {
      id: "pub",
      collection: "poetry",
      data: { title: "Published Poem", publishedOn: new Date("2025-01-01") },
      body: "poem",
    },
    {
      id: "draft",
      collection: "poetry",
      data: {
        title: "Draft Poem",
        publishedOn: new Date("2025-01-02"),
        draft: true,
      },
      body: "draft poem",
    },
  ]);

  mockRss.mockReturnValue(
    new Response('<?xml version="1.0"?><rss></rss>', {
      headers: { "Content-Type": "application/rss+xml" },
    }),
  );

  await generateCollectionFeed("poetry");

  expect(mockRss).toHaveBeenCalled();
  const callArgs = mockRss.mock.calls[0][0];
  expect(callArgs.items).toHaveLength(1);
  expect(callArgs.items[0].title).toBe("Published Poem");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/feeds.test.ts`
Expected: FAIL — draft posts are not being filtered

**Step 3: Add draft filtering to feed utilities**

In `src/utils/feeds.ts`, modify `getAllCollectionEntries()` and `getCollectionEntries()` to filter drafts:

Change `getAllCollectionEntries` (line 74-83):

```typescript
export async function getAllCollectionEntries(): Promise<AnyCollectionEntry[]> {
  const allEntries: AnyCollectionEntry[] = [];

  for (const collectionName of getMainFeedEligibleCollections()) {
    const entries = await getCollection(collectionName);
    allEntries.push(...entries);
  }

  return allEntries;
}
```

To:

```typescript
export async function getAllCollectionEntries(): Promise<AnyCollectionEntry[]> {
  const allEntries: AnyCollectionEntry[] = [];

  for (const collectionName of getMainFeedEligibleCollections()) {
    const entries = await getCollection(collectionName);
    allEntries.push(...entries.filter((entry) => !entry.data.draft));
  }

  return allEntries;
}
```

Change `getCollectionEntries` (line 85-89):

```typescript
export async function getCollectionEntries(
  collectionName: CollectionName,
): Promise<CollectionEntry<CollectionName>[]> {
  return await getCollection(collectionName);
}
```

To:

```typescript
export async function getCollectionEntries(
  collectionName: CollectionName,
): Promise<CollectionEntry<CollectionName>[]> {
  const entries = await getCollection(collectionName);
  return entries.filter((entry) => !entry.data.draft);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/feeds.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/feeds.ts tests/feeds.test.ts
git commit -m "feat: exclude draft posts from RSS feeds"
```

---

### Task 4: Create the Sveltia CMS admin page

**Files:**

- Create: `public/admin/index.html`
- Create: `public/admin/config.yml`

**Step 1: Create `public/admin/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
  </head>
  <body>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </body>
</html>
```

Important: Do NOT add `type="module"` to the script tag. Do NOT add any CSS stylesheet links. Sveltia CMS bundles its own styles.

**Step 2: Create `public/admin/config.yml`**

```yaml
backend:
  name: github
  repo: tanvibhakta/tanvibhakta-website
  branch: main

media_folder: public/media
public_folder: /media

collections:
  - name: blog
    label: Blog
    folder: posts/blog
    create: true
    slug: "{{slug}}"
    fields:
      - { label: Title, name: title, widget: string }
      - {
          label: Publish Date,
          name: publishedOn,
          widget: datetime,
          date_format: YYYY-MM-DD,
          time_format: false,
          format: YYYY-MM-DD,
        }
      - {
          label: Draft,
          name: draft,
          widget: boolean,
          default: true,
          required: false,
        }
      - { label: Body, name: body, widget: markdown }

  - name: poetry
    label: Poetry
    folder: posts/poetry
    create: true
    slug: "{{slug}}"
    fields:
      - { label: Title, name: title, widget: string }
      - {
          label: Publish Date,
          name: publishedOn,
          widget: datetime,
          date_format: YYYY-MM-DD,
          time_format: false,
          format: YYYY-MM-DD,
        }
      - {
          label: Draft,
          name: draft,
          widget: boolean,
          default: true,
          required: false,
        }
      - { label: Body, name: body, widget: markdown }

  - name: weeknotes
    label: Weeknotes
    folder: posts/weeknotes
    create: true
    slug: "{{slug}}"
    fields:
      - { label: Title, name: title, widget: string }
      - {
          label: Publish Date,
          name: publishedOn,
          widget: datetime,
          date_format: YYYY-MM-DD,
          time_format: false,
          format: YYYY-MM-DD,
        }
      - {
          label: Draft,
          name: draft,
          widget: boolean,
          default: true,
          required: false,
        }
      - { label: Body, name: body, widget: markdown }

  - name: digitalGarden
    label: Digital Garden
    folder: posts/digital-garden
    create: true
    slug: "{{slug}}"
    fields:
      - { label: Title, name: title, widget: string }
      - {
          label: Publish Date,
          name: publishedOn,
          widget: datetime,
          date_format: YYYY-MM-DD,
          time_format: false,
          format: YYYY-MM-DD,
        }
      - {
          label: Last Updated,
          name: lastUpdatedOn,
          widget: datetime,
          date_format: YYYY-MM-DD,
          time_format: false,
          format: YYYY-MM-DD,
          default: "{{now}}",
        }
      - {
          label: Description,
          name: description,
          widget: string,
          required: false,
        }
      - {
          label: Draft,
          name: draft,
          widget: boolean,
          default: true,
          required: false,
        }
      - { label: Body, name: body, widget: markdown }
```

**Step 3: Create the `public/media/` directory with a .gitkeep**

```bash
mkdir -p public/media
touch public/media/.gitkeep
```

**Step 4: Verify the admin page loads locally**

Run: `npx astro dev`
Then open: `http://localhost:4321/admin/`
Expected: Sveltia CMS login screen loads (you won't be able to log in yet — that requires Netlify OAuth setup, which is a manual step)

**Step 5: Commit**

```bash
git add public/admin/index.html public/admin/config.yml public/media/.gitkeep
git commit -m "feat: add Sveltia CMS admin interface with config for all collections"
```

---

### Task 5: Set up Netlify OAuth for GitHub authentication

This is a **manual task** — the engineer needs to do this in the Netlify and GitHub dashboards. No code changes.

**Step 1: Register a GitHub OAuth App**

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Fill in:
   - **Application name:** `tanvibhakta.in CMS`
   - **Homepage URL:** `https://tanvibhakta.in`
   - **Authorization callback URL:** `https://api.netlify.com/auth/done`
3. Click "Register application"
4. Copy the **Client ID**
5. Click "Generate a new client secret" and copy the **Client Secret**

**Step 2: Configure Netlify OAuth**

1. Go to Netlify dashboard → Your site → Site configuration → Access & security → OAuth
2. Under "Authentication providers", click "Install provider"
3. Select "GitHub"
4. Paste the **Client ID** and **Client Secret** from Step 1
5. Save

**Step 3: Verify authentication works**

1. Deploy the site (push to main, or use `netlify deploy --prod` if you have the CLI)
2. Go to `https://tanvibhakta.in/admin/`
3. Click "Sign in with GitHub"
4. Authorize the OAuth app
5. You should see the CMS dashboard with your four collections

**Step 4: Test creating a draft post**

1. In the CMS, click "Blog" → "New Blog"
2. Fill in a title, set draft to true
3. Save
4. Verify a new markdown file was committed to your GitHub repo in `posts/blog/`
5. Verify the draft post does NOT appear on the live site or in RSS feeds

---

### Task 6: Verify end-to-end flow

This is a **manual verification task** after deployment.

**Step 1: Verify all collections appear in CMS**

Open `https://tanvibhakta.in/admin/` and confirm you see:

- Blog
- Poetry
- Weeknotes
- Digital Garden

**Step 2: Verify existing posts load correctly**

Click into each collection and verify existing posts load with correct frontmatter fields populated.

**Step 3: Verify media uploads work**

1. Create a new blog post
2. Insert an image using the media widget
3. Save and verify the image is committed to `public/media/`

**Step 4: Verify slug editing**

1. Create a new post with title "Test Post For Slug"
2. Before saving, verify the slug preview shows `test-post-for-slug`
3. Edit the slug to `custom-slug`
4. Save and verify the file is named `custom-slug.md`

**Step 5: Verify draft filtering works end-to-end**

1. Create a blog post with `draft: true`
2. Wait for Netlify to rebuild
3. Verify the post does NOT appear on `/blog/` listing
4. Verify the post does NOT appear in `/feed.xml` or `/blog/feed.xml`
5. Edit the post in CMS, set `draft: false`
6. Wait for rebuild
7. Verify the post NOW appears on `/blog/` and in feeds

**Step 6: Clean up test content**

Delete any test posts created during verification.
