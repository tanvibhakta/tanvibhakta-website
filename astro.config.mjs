// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
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

  integrations: [mdx()]
});