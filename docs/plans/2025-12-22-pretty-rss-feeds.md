# Pretty RSS Feeds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add XSL stylesheet to transform RSS feed XML into styled HTML that matches tanvibhakta.in design when opened in browsers, while keeping feed content unchanged.

**Architecture:** Create an XSL stylesheet that transforms RSS XML into HTML using Tailwind CSS from CDN. The stylesheet will be served statically and referenced via XML processing instruction in feed headers. Feed readers ignore the XSL and use raw XML; browsers render the styled HTML.

**Tech Stack:** XSL, Tailwind CSS (CDN), Astro RSS generation

---

## Task 1: Create XSL Stylesheet

**Files:**

- Create: `src/styles/feed.xsl`

**Step 1: Write the XSL stylesheet**

Create `/Users/tanvibhakta/Code/tanvibhakta-website/src/styles/feed.xsl`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>
          <xsl:value-of select="rss/channel/title"/>
        </title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .feed-content { max-width: 65ch; }
          .feed-content img { max-width: 100%; height: auto; }
          .feed-content pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
          .feed-content code { font-family: "Monaco", "Courier New", monospace; }
        </style>
      </head>
      <body class="bg-white text-gray-900">
        <!-- Header -->
        <header class="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div class="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <h1 class="text-4xl font-bold tracking-tight text-gray-900">
              <xsl:value-of select="rss/channel/title"/>
            </h1>
            <p class="mt-2 text-lg text-gray-700">
              <xsl:value-of select="rss/channel/description"/>
            </p>
          </div>
        </header>

        <!-- Subscribe Section -->
        <section class="bg-gray-50 border-b border-gray-200">
          <div class="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <h2 class="text-sm font-semibold text-gray-900 uppercase tracking-wide">Subscribe</h2>
            <p class="mt-2 text-sm text-gray-600 mb-4">
              Copy this feed URL into your favorite RSS reader to stay updated.
            </p>
            <div class="bg-white p-4 rounded border border-gray-200 font-mono text-sm break-all text-gray-700">
              <xsl:value-of select="rss/channel/link"/>
            </div>
          </div>
        </section>

        <!-- Feed Entries -->
        <main class="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div class="space-y-12">
            <xsl:for-each select="rss/channel/item">
              <article class="border-b border-gray-200 pb-12 last:border-b-0">
                <header class="mb-4">
                  <h3 class="text-2xl font-bold text-gray-900 mb-2">
                    <a href="{link}" class="text-blue-600 hover:text-blue-700 hover:underline">
                      <xsl:value-of select="title"/>
                    </a>
                  </h3>
                  <time class="text-sm text-gray-500">
                    <xsl:value-of select="substring(pubDate, 1, 16)"/>
                  </time>
                </header>
                <div class="feed-content prose prose-sm max-w-none text-gray-700">
                  <xsl:copy-of select="content:encoded/node() | description/node()"/>
                </div>
              </article>
            </xsl:for-each>
          </div>
        </main>

        <!-- Footer -->
        <footer class="bg-gray-50 border-t border-gray-200">
          <div class="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <p class="text-sm text-gray-600">
              <a href="https://tanvibhakta.in" class="text-blue-600 hover:text-blue-700 hover:underline">
                tanvibhakta.in
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
```

**Step 2: Verify XSL file is valid XML**

Run: `xmllint --noout src/styles/feed.xsl`
Expected: No errors (file is valid XML)

---

## Task 2: Copy XSL to Public Directory

**Files:**

- Create: `public/feed.xsl` (copy of src/styles/feed.xsl)

**Step 1: Copy the XSL file to public**

Run: `cp src/styles/feed.xsl public/feed.xsl`

**Step 2: Verify file exists**

Run: `ls -la public/feed.xsl`
Expected: File exists and is readable

---

## Task 3: Update SITE_URL

**Files:**

- Modify: `src/utils/feeds.ts:7`

**Step 1: Update domain**

In `src/utils/feeds.ts`, change line 7 from:

```typescript
const SITE_URL = "https://tanvibhakta.com";
```

To:

```typescript
const SITE_URL = "https://tanvibhakta.in";
```

**Step 2: Verify change**

Run: `grep "SITE_URL" src/utils/feeds.ts`
Expected: Shows `const SITE_URL = "https://tanvibhakta.in";`

**Step 3: Commit**

Run: `git add src/utils/feeds.ts && git commit -m "fix: update SITE_URL from tanvibhakta.com to tanvibhakta.in"`

---

## Task 4: Modify Feed Generation to Include XSL Processing Instruction

**Files:**

- Modify: `src/utils/feeds.ts:91-114` and `116-139`

**Step 1: Create helper function to add XSL processing instruction**

Add this function after the `setRssMimeType` function (around line 32):

```typescript
/**
 * Add XSL processing instruction to RSS feed for browser rendering
 */
function addXslProcessingInstruction(xmlString: string): string {
  // Find the XML declaration and add the stylesheet reference after it
  const xmlDeclarationMatch = xmlString.match(/^<\?xml[^?]*\?>/);
  if (xmlDeclarationMatch) {
    const xmlDeclaration = xmlDeclarationMatch[0];
    const xslInstruction =
      '\n<?xml-stylesheet type="text/xsl" href="https://tanvibhakta.in/feed.xsl"?>';
    return xmlString.replace(xmlDeclaration, xmlDeclaration + xslInstruction);
  }
  return xmlString;
}
```

**Step 2: Modify generateMainFeed function**

Update the `generateMainFeed` function (lines 91-114) to process the response:

```typescript
export async function generateMainFeed() {
  const allEntries = await getAllCollectionEntries();

  // Sort by date and limit
  const sortedEntries = allEntries
    .sort(
      (a, b) =>
        new Date(b.data.publishedOn).getTime() -
        new Date(a.data.publishedOn).getTime(),
    )
    .slice(0, FEED_LIMIT);

  const response = await rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: SITE_URL,
    items: sortedEntries.map((entry) => ({
      title: `[${capitalizeFirst(entry.collection)}] ${entry.data.title}`,
      pubDate: entry.data.publishedOn,
      link: `/${entry.collection}/${entry.id}/`,
      content: markdownToHtml(entry.body),
    })),
  });

  // Get the response body and add XSL processing instruction
  const body = await response.text();
  const styledBody = addXslProcessingInstruction(body);

  return new Response(styledBody, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
```

**Step 3: Modify generateCollectionFeed function**

Update the `generateCollectionFeed` function (lines 116-139) similarly:

```typescript
export async function generateCollectionFeed(collectionName: CollectionName) {
  const entries = await getCollectionEntries(collectionName);

  // Sort by date and limit
  const sortedEntries = entries
    .sort(
      (a, b) =>
        new Date(b.data.publishedOn).getTime() -
        new Date(a.data.publishedOn).getTime(),
    )
    .slice(0, FEED_LIMIT);

  const response = await rss({
    title: `${SITE_TITLE} - ${capitalizeFirst(collectionName)}`,
    description: `${capitalizeFirst(collectionName)} posts from ${SITE_TITLE}`,
    site: SITE_URL,
    items: sortedEntries.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.publishedOn,
      link: `/${entry.collection}/${entry.id}/`,
      content: markdownToHtml(entry.body),
    })),
  });

  // Get the response body and add XSL processing instruction
  const body = await response.text();
  const styledBody = addXslProcessingInstruction(body);

  return new Response(styledBody, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
```

**Step 4: Verify syntax**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 5: Commit**

Run: `git add src/utils/feeds.ts && git commit -m "feat: add XSL stylesheet processing instruction to RSS feeds"`

---

## Task 5: Test Feed Generation

**Files:**

- Run existing tests: `tests/feeds.test.ts`

**Step 1: Run existing feed tests**

Run: `npm test -- tests/feeds.test.ts`
Expected: All tests pass

**Step 2: Build the project**

Run: `npm run build`
Expected: Build succeeds, dist/feed.xml and collection feeds are generated

**Step 3: Verify XSL processing instruction in feed**

Run: `head -n 5 dist/feed.xml`
Expected: Output shows:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="https://tanvibhakta.in/feed.xsl"?>
<rss version="2.0"...
```

**Step 4: Verify collection feed also has XSL**

Run: `head -n 5 dist/blog/feed.xml`
Expected: Same XSL processing instruction present

**Step 5: Commit test verification**

Run: `git add -A && git commit -m "test: verify XSL stylesheet processing instruction in generated feeds"`

---

## Task 6: Manual Browser Test (Optional but Recommended)

**Step 1: Start dev server**

Run: `npm run dev`
Expected: Server running on localhost:4321

**Step 2: Open feed in browser**

Navigate to: `http://localhost:4321/feed.xml` in a modern browser (Chrome, Firefox, Safari)
Expected: See styled HTML page with your feed content, not raw XML

**Step 3: Check collection feeds**

Navigate to: `http://localhost:4321/blog/feed.xml`
Expected: Styled HTML with just blog entries

**Step 4: Verify feed readers still work**

Copy feed URL into any RSS reader (Feedly, Apple News+, etc.)
Expected: Reader correctly parses and displays feed content (XSL is ignored by readers)
