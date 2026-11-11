# Embodied Runtime blog

Source for <https://embodiedruntime.github.io/blog/>, built with [Astro](https://astro.build) + MDX and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Develop

Requires Node ≥ 22.22 (`nvm use` picks it up from `.nvmrc`).

```sh
npm install
npm run dev       # http://localhost:4321/blog/ — drafts are visible here
npm run build     # production build into dist/ — drafts are excluded
npm run preview   # serve dist/ locally
```

One-time GitHub setup: **Settings → Pages → Source: GitHub Actions**.

## Editing in the browser (dev only)

With `npm run dev` running, open a post:

- **Click any paragraph, heading, list, or quote** to edit the rendered text in place, like a document. **Enter** saves (Shift+Enter in lists adds an item), **Esc** cancels. ⌘/Ctrl+B bold, ⌘/Ctrl+I italic, ⌘/Ctrl+E inline code, ⌘/Ctrl+K link. Blocks with content that cannot round-trip (footnotes, components, tables, code) are not click-editable; use Source.
- Hover any block for **Source** (edit its raw MDX; saving empty text deletes the block), **Comment** (inserts `{/* @comment (time): … */}` below it), and **+ ¶** (add a new Markdown paragraph below it).
- Comments and writing notes (`{/* … */}`) are shown as boxes in dev and never appear in production builds. **Notes: shown/hidden** (bottom right) toggles them.

Saves write straight to the `.mdx` file; the page reloads at the same scroll position. The tool lives in `tools/dev-editor/` and is inactive during `npm run build`.

## Layout

```
src/
├── content.config.ts          # post schema (title, description, date, draft, …)
├── content/posts/<slug>/
│   ├── index.mdx              # the post; URL is /blog/posts/<slug>/
│   └── *.astro / images       # components and assets used only by this post
├── components/                # shared components: Figure, Video
├── layouts/                   # Base (site chrome), Post (article header + TOC)
├── pages/                     # index (post list), posts/[slug] (post route)
├── lib/posts.ts               # getPosts(), withBase(), formatDate()
└── styles/global.css          # theme tokens (light/dark) and article typography
public/
└── videos/<slug>/             # video files, served as-is
```

## Writing a post

Create `src/content/posts/<slug>/index.mdx`:

```mdx
---
title: 'Post title'
description: 'One-sentence summary used on the index and in link previews.'
date: 2026-10-16
authors: ['Your Name']
tags: ['robotics']
draft: true          # remove when ready to publish
---

import Video from '../../../components/Video.astro';
import MyWidget from './MyWidget.astro';

<Video src="videos/<slug>/rollout.mp4" poster="videos/<slug>/rollout.jpg" caption="…" />
<MyWidget />
```

### Video

`<Video src poster caption mode wide />` — `src`/`poster` are paths under `public/` or absolute URLs.
`mode="player"` (default) shows controls; `mode="ambient"` is a muted autoplay loop for short rollouts.

Encode for the web before committing:

```sh
ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p -crf 26 -preset slow -movflags +faststart -an out.mp4
```

GitHub rejects files over 100 MB and Pages sites should stay under 1 GB. For larger collections, host the files elsewhere and pass absolute URLs, or track `public/videos/**` with Git LFS (the deploy workflow already checks out LFS files).

### Interactive components

Write an `.astro` component with markup, a scoped `<style>`, and a `<script>` (bundled automatically). Wrapping the behavior in a custom element keeps multiple instances on one page independent — see `src/content/posts/system-perspective/TaskLifecycle.astro`.

For React/Svelte/Vue components, run `npx astro add react` (etc.) and hydrate with `client:visible`.

## License

The posts — their text, figures, images, and videos (`src/content/posts/`, `public/images/`,
`public/videos/`) — are licensed under [CC BY 4.0](LICENSE-CONTENT): you may share and adapt
them with attribution. The site's code — layouts, components, the editing tools, and the build
configuration — is licensed under the [MIT License](LICENSE).
