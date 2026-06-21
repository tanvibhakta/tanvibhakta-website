// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import mdx from '@astrojs/mdx';
import icon from 'astro-icon';
import remarkBreaks from 'remark-breaks';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { rehypeAnchors } from './src/plugins/rehype-anchors.mjs';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    remarkPlugins: [remarkBreaks],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, {
        behavior: 'append',
        properties: {
          className: ['anchor-link'],
          ariaLabel: 'Link to this section',
        },
        content: { type: 'text', value: ' #' },
        test: (node) => node.tagName !== 'h1',
      }],
      [rehypeAnchors, { skip: (file) => /[\\/]posts[\\/](poetry|notes)[\\/]/.test(file?.path ?? "") }],
    ],
  },

  redirects: {
    // '/weeknotes': {
    //   status: 302,
    //   destination: 'https://tanvibhakta.mataroa.blog'
    // },
    '/resume': {
      status: 301,
      destination: '/resume.pdf'
    },
    '/code': {
      status: 301,
      destination: 'https://github.com/tanvibhakta'
    }
  },

  integrations: [mdx(), icon()]
});