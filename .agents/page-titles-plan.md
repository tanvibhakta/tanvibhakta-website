# Page Titles Update Plan

## Goal

Update all page titles to format: `title | category | Tanvi's Web Home`

## Minimum Changes Required

### 1. Core Layout Change

**File:** `src/layouts/Layout.astro`

- Add `title` prop
- Change `<title>` tag from hardcoded to: `{title ? `${title} | Tanvi's Web Home` : "Tanvi's Web Home"}`

### 2. ProseLayout Update

**File:** `src/layouts/ProseLayout.astro`

- Pass title + category to Layout prop
- Format based on collection type (Blog, Weeknote, Poetry, etc.)

### 3. Index Pages (5 files)

- Add/update title prop when calling Layout
- Files: blog, poetry, weeknotes, digital-garden index pages + homepage

### 4. MDX/MD Pages (2 files)

**Files:** `src/pages/work.mdx`, `src/pages/now.md`

- These use ProseLayout which needs to handle pages without categories
- ProseLayout should detect when it's not a collection page and format as: `{title} | Tanvi's Web Home`
- Work page: `Work | Tanvi's Web Home`
- Now page: `Now | Tanvi's Web Home`

## Title Formats by Page Type

- Homepage: `Tanvi's Web Home` (no change)
- Blog post: `{title} | Blog | Tanvi's Web Home`
- Weeknote: `{shortened_title} | Weeknote | Tanvi's Web Home`
  - Example: "Sep 7th" instead of "Week of September 7th, 2025"
- Poetry: `{title} | Poetry | Tanvi's Web Home`
- Static pages: `{page_name} | Tanvi's Web Home`

## Implementation Impact

- **Total files to modify:** 7 existing files (no new files needed)
- **Breaking changes:** None - all changes are backward compatible
- **User-facing change:** Only browser tab titles update, no visual changes on pages

## Unit Test Specification

### Test File: `src/tests/page-titles.test.ts`

**Test Cases:**

1. **Layout Component Tests**

   - `Layout with no title prop` → renders "Tanvi's Web Home"
   - `Layout with title="About"` → renders "About | Tanvi's Web Home"
   - `Layout with empty string title` → renders "Tanvi's Web Home"

2. **ProseLayout Component Tests**

   - `ProseLayout with blog post` → renders "{title} | Blog | Tanvi's Web Home"
   - `ProseLayout with weeknote` → renders "{shortened_title} | Weeknote | Tanvi's Web Home"
   - `ProseLayout with poetry` → renders "{title} | Poetry | Tanvi's Web Home"
   - `ProseLayout with standalone page (work.mdx)` → renders "Work | Tanvi's Web Home"

3. **Weeknote Title Shortening**

   - Input: "Week of September 7th, 2025" → Output: "Sep 7th"
   - Input: "Week of December 25th, 2024" → Output: "Dec 25th"
   - Input: "Week of January 1st, 2025" → Output: "Jan 1st"

4. **Integration Tests (E2E)**
   - Navigate to `/blog/llms-create-bad-code` → title contains "LLMs create bad code | Blog | Tanvi's Web Home"
   - Navigate to `/weeknotes/week-of-sep-7th-2025` → title contains "Sep 7th | Weeknote | Tanvi's Web Home"
   - Navigate to `/work` → title contains "Work | Tanvi's Web Home"
   - Navigate to `/` → title is exactly "Tanvi's Web Home"

**Test Implementation Notes:**

- Use Vitest for unit tests (already configured)
- Mock Astro.props for component testing
- Use regex to validate title format: `/^([^|]+\s\|\s)?(([^|]+\s\|\s)?Tanvi's Web Home)$/`
