// Dev-only Sätteri mdast plugin: wraps every top-level block of a post in
//   <div class="src-block" data-src-file="…" data-src="start-end">
// so the in-page editor can map what you click back to source lines.
// MDX comments `{/* … */}` become visible note boxes; ones starting with `@comment` are reader comments.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMENT_RE = /^\s*\/\*([\s\S]*)\*\/\s*$/;
const SKIP = new Set(['yaml', 'toml', 'mdxjsEsm', 'definition']);

function jsx(name, attrs, children = []) {
  return {
    type: 'mdxJsxFlowElement',
    name,
    attributes: Object.entries(attrs).map(([k, v]) => ({ type: 'mdxJsxAttribute', name: k, value: String(v) })),
    children,
  };
}

function dedent(text) {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

export function devSourcePlugin({ root }) {
  const contentDir = path.join(root, 'src', 'content') + path.sep;

  // Factory form: decide per document whether the plugin applies.
  return ({ fileURL, sourceFormat }) => {
    if (!fileURL || sourceFormat !== 'mdx') return null;
    const file = fileURLToPath(fileURL);
    if (!file.startsWith(contentDir)) return null;
    const rel = path.relative(root, file);

    return {
      name: 'dev-editor-source',
      options: { position: true },
      before(tree, ctx) {
        for (const node of tree.children) {
          if (!node.position || SKIP.has(node.type)) continue;
          const attrs = {
            'data-src-file': rel,
            'data-src': `${node.position.start.line}-${node.position.end.line}`,
          };

          if (node.type === 'mdxFlowExpression') {
            const m = node.value.match(COMMENT_RE);
            if (!m) continue;
            let text = dedent(m[1]).replace(/([^\n])\n(?!\n|\s*[-*] )/g, '$1 ');  // reflow hard wraps
            let kind = 'note';
            if (/^@comment\b/.test(text)) {
              kind = 'comment';
              text = text.replace(/^@comment\b:?\s*/, '');
            }
            const aside = jsx('aside', { class: `dev-${kind}` }, [{ type: 'paragraph', children: [{ type: 'text', value: text }] }]);
            ctx.replaceNode(node, jsx('div', { class: `src-block src-${kind}`, ...attrs }, [aside]));
            continue;
          }

          ctx.wrapNode(node, jsx('div', { class: 'src-block', ...attrs }));
        }
      },
    };
  };
}
