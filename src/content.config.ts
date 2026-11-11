import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Each post lives in its own folder: src/content/posts/<slug>/index.mdx.
// Components used by only one post sit next to its index.mdx.
const posts = defineCollection({
  loader: glob({
    pattern: '*/index.{md,mdx}',
    base: './src/content/posts',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    authors: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    // Drafts render in `npm run dev` but are left out of production builds.
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
