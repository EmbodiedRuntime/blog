// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import devEditor from './tools/dev-editor/index.mjs';

// Served as a GitHub Pages project site: https://embodiedruntime.github.io/blog/
export default defineConfig({
  site: 'https://embodiedruntime.github.io',
  base: '/blog',
  trailingSlash: 'always',
  // devEditor is a no-op outside `astro dev`.
  integrations: [devEditor(), mdx()],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
