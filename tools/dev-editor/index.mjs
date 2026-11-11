// Astro integration: in-page editing and comments for posts, active only under `astro dev`.
// Production builds are untouched — nothing here runs during `astro build`.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { satteri, isSatteriProcessor } from '@astrojs/markdown-satteri';
import { devSourcePlugin } from './source-plugin.mjs';

const clientEntry = fileURLToPath(new URL('./client.js', import.meta.url));

export default function devEditor() {
  let root;
  return {
    name: 'dev-editor',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig, injectScript, logger }) => {
        if (command !== 'dev') return;
        root = fileURLToPath(config.root);
        // Extend the configured Sätteri processor (MDX inherits it) with the source-mapping plugin.
        const current = config.markdown.processor;
        if (current && !isSatteriProcessor(current)) {
          logger.warn('dev-editor needs the Sätteri markdown processor; in-page editing is disabled.');
          return;
        }
        const options = current?.options ?? {};
        updateConfig({
          markdown: {
            processor: satteri({
              ...options,
              mdastPlugins: [...(options.mdastPlugins ?? []), devSourcePlugin({ root })],
            }),
          },
        });
        injectScript('page', `import ${JSON.stringify(clientEntry)};`);
      },
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use('/__editor', async (req, res) => {
          try {
            const url = new URL(req.url, 'http://localhost');
            const body = req.method === 'POST' ? JSON.parse(await readBody(req)) : {};
            const params = { ...Object.fromEntries(url.searchParams), ...body };
            const file = resolveContentFile(root, params.file);
            const lines = (await fs.readFile(file, 'utf8')).split('\n');

            if (url.pathname === '/source' && req.method === 'GET') {
              const [start, end] = range(params);
              return send(res, 200, { text: lines.slice(start - 1, end).join('\n') });
            }

            if (url.pathname === '/replace' && req.method === 'POST') {
              const [start, end] = range(params);
              const current = lines.slice(start - 1, end).join('\n');
              if (current !== params.original) return send(res, 409, { error: 'The file changed since this block was loaded. Reload the page.' });
              const replacement = params.text.trim() === '' ? [] : params.text.replace(/\s+$/, '').split('\n');
              lines.splice(start - 1, end - start + 1, ...replacement);
              tidyBlankLines(lines, start - 1, start - 1 + replacement.length);
              await fs.writeFile(file, lines.join('\n'));
              logger.info(`edited ${params.file}:${start}-${end}`);
              return send(res, 200, { ok: true });
            }

            if (url.pathname === '/insert' && req.method === 'POST') {
              const after = Number(params.after);
              if (!Number.isInteger(after) || after < 1 || after > lines.length) throw new Error('bad line');
              const text = String(params.text).replace(/\s+$/, '');
              if (!text.trim()) return send(res, 400, { error: 'Nothing to insert' });
              const added = text.split('\n');
              lines.splice(after, 0, '', ...added, '');
              tidyBlankLines(lines, after, after + added.length + 2);
              await fs.writeFile(file, lines.join('\n'));
              logger.info(`inserted ${added.length} line(s) into ${params.file} after line ${after}`);
              return send(res, 200, { ok: true });
            }

            if (url.pathname === '/comment' && req.method === 'POST') {
              const after = Number(params.after);
              if (!Number.isInteger(after) || after < 1 || after > lines.length) throw new Error('bad line');
              const text = String(params.text).trim().replaceAll('*/', '* /');
              if (!text) return send(res, 400, { error: 'Empty comment' });
              const d = new Date();
              const pad = (n) => String(n).padStart(2, '0');
              const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
              const comment = `{/* @comment (${stamp}): ${text.replace(/\n/g, '\n   ')} */}`;
              lines.splice(after, 0, '', comment, '');
              tidyBlankLines(lines, after, after + 3);
              await fs.writeFile(file, lines.join('\n'));
              logger.info(`comment added to ${params.file} after line ${after}`);
              return send(res, 200, { ok: true });
            }

            send(res, 404, { error: 'Unknown editor endpoint' });
          } catch (err) {
            send(res, 400, { error: String(err.message ?? err) });
          }
        });
      },
    },
  };
}

function resolveContentFile(root, rel) {
  const contentDir = path.join(root, 'src', 'content');
  const file = path.resolve(root, String(rel ?? ''));
  if (!file.startsWith(contentDir + path.sep) || !/\.mdx?$/.test(file)) throw new Error('File is outside src/content');
  return file;
}

function range({ start, end }) {
  const s = Number(start);
  const e = Number(end);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s) throw new Error('bad range');
  return [s, e];
}

// Collapse runs of blank lines at the two edges of a splice [from, to), leaving the rest of the file alone.
function tidyBlankLines(lines, from, to) {
  for (const edge of [to, from]) {
    while (edge > 0 && edge < lines.length && lines[edge].trim() === '' && lines[edge - 1].trim() === '') {
      lines.splice(edge, 1);
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data || '{}'));
    req.on('error', reject);
  });
}

function send(res, status, json) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(json));
}
