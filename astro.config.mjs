// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import remarkBreaks from "remark-breaks";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { rehypeAnchors } from "./src/plugins/rehype-anchors.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://tanvibhakta.in",

  image: {
    // Responsive markdown images: srcset + sizes + lazy loading for every
    // relative ![]() image. Stabilized in Astro 5.10.
    layout: "constrained",
    // The prose column is md:w-1/2 (~50vw desktop); cap candidate widths so
    // browsers don't over-fetch. 1280 is also the width feeds.ts requests,
    // keeping the feed derivative shared with this set.
    breakpoints: [640, 960, 1280, 1600, 2048],
  },

  vite: {
    // Cast needed: @tailwindcss/vite types against vite 7 while astro bundles
    // vite 6, so the two Plugin types are structurally close but not identical.
    plugins: [
      /** @type {import("astro").ViteUserConfig["plugins"]} */ (
        /** @type {unknown} */ (tailwindcss())
      ),
    ],
  },

  markdown: {
    remarkPlugins: [remarkBreaks],
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: "append",
          properties: {
            className: ["anchor-link"],
            ariaLabel: "Link to this section",
          },
          content: { type: "text", value: " #" },
          test: (/** @type {{ tagName?: string }} */ node) =>
            node.tagName !== "h1",
        },
      ],
      [
        rehypeAnchors,
        {
          skip: (/** @type {{ path?: string } | undefined} */ file) =>
            /[\\/]posts[\\/](poetry|notes)[\\/]/.test(file?.path ?? ""),
        },
      ],
    ],
  },

  redirects: {
    // '/weeknotes': {
    //   status: 302,
    //   destination: 'https://tanvibhakta.mataroa.blog'
    // },
    "/resume": {
      status: 301,
      destination: "/resume.pdf",
    },
    "/code": {
      status: 301,
      destination: "https://github.com/tanvibhakta",
    },
  },

  integrations: [
    mdx(),
    icon(),
    sitemap({
      // Keep admin tooling, machine-readable feeds, draft review pages, and
      // underscore-prefixed fixture pages (e.g. /_anchor-fixture) out of the
      // sitemap.
      filter: (page) =>
        !page.includes("/admin") &&
        !page.endsWith("/feed.xml") &&
        !new URL(page).pathname.startsWith("/drafts/") &&
        !/\/_/.test(new URL(page).pathname),
    }),
  ],
});
