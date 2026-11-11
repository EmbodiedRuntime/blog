import { getCollection } from 'astro:content';

/** Published posts, newest first. Drafts are included only in dev. */
export async function getPosts() {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Prefix a site-relative path with the configured base (`/blog/`). */
export function withBase(path: string) {
  if (/^[a-z]+:\/\//i.test(path)) return path;
  return import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
