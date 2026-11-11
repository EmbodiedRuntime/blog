// Converts an edited, rendered text block back into Markdown/MDX source.
// Only simple content round-trips: text, bold, italic, inline code, links, line breaks.
// Anything else (footnotes, images, inline components, nested lists) makes the block
// source-only, so the in-place editor never silently drops formatting.

const INLINE = new Set(['STRONG', 'B', 'EM', 'I', 'CODE', 'A', 'BR', 'SPAN', 'FONT']);

export function canEditRich(node) {
  try {
    serializeBlock(node, '');
    return true;
  } catch {
    return false;
  }
}

/** Returns Markdown for `node`, or null if it contains unsupported content. */
export function toMarkdown(node, original) {
  try {
    return serializeBlock(node, original);
  } catch {
    return null;
  }
}

function serializeBlock(node, original) {
  const tag = node.tagName;
  if (tag === 'P') return keepLineStyle(inline(node), original);
  if (/^H[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline(node)}`;
  if (tag === 'UL' || tag === 'OL') {
    const bullet = original.match(/^\s*([-*+])\s/)?.[1] ?? '-';
    return [...node.children]
      .map((li, i) => {
        if (li.tagName !== 'LI') throw new Error('unexpected list child');
        return `${tag === 'OL' ? `${i + 1}.` : bullet} ${listItem(li)}`;
      })
      .join('\n');
  }
  if (tag === 'BLOCKQUOTE') {
    return [...node.children]
      .map((p) => {
        if (p.tagName !== 'P') throw new Error('unexpected quote child');
        return `> ${inline(p)}`;
      })
      .join('\n>\n');
  }
  throw new Error(`unsupported block ${tag}`);
}

function listItem(li) {
  const parts = [];
  for (const c of li.childNodes) {
    if (c.nodeType === Node.ELEMENT_NODE && c.tagName === 'P') parts.push(inline(c));
    else if (c.nodeType === Node.ELEMENT_NODE && (c.tagName === 'UL' || c.tagName === 'OL')) throw new Error('nested list');
    else parts.push(inlineNode(c));
  }
  return tidy(parts.join(' '));
}

function inline(node) {
  return tidy([...node.childNodes].map(inlineNode).join(''));
}

function inlineNode(n) {
  if (n.nodeType === Node.TEXT_NODE) return escapeText(n.textContent.replace(/\s+/g, ' '));
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = n.tagName;
  if (tag === 'DIV') return ' ' + inline(n); // stray block from contenteditable
  if (!INLINE.has(tag)) throw new Error(`unsupported inline ${tag}`);
  if (tag === 'BR') return ' ';
  if (tag === 'SPAN' || tag === 'FONT') {
    if (n.className && n.className !== 'ed-rich') throw new Error('styled span');
    return inline(n);
  }
  const inner = inline(n);
  if (!inner.trim()) return inner;
  if (tag === 'STRONG' || tag === 'B') return wrapMark(inner, '**');
  if (tag === 'EM' || tag === 'I') return wrapMark(inner, '*');
  if (tag === 'CODE') {
    const text = n.textContent;
    const fence = text.includes('`') ? '``' : '`';
    return `${fence}${text}${fence}`;
  }
  if (tag === 'A') return `[${inner}](${n.getAttribute('href') ?? ''})`;
  return inner;
}

// Keep surrounding spaces outside the markers: "** bold **" is not bold in Markdown.
function wrapMark(text, mark) {
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  return `${lead}${mark}${text.trim()}${mark}${trail}`;
}

function escapeText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/([*`[\]{}<])/g, '\\$1')
    .replace(/(^|\W)_|_(?=\W|$)/g, (m) => m.replace('_', '\\_'));
}

function tidy(s) {
  return s.replace(/[ \t]+/g, ' ').trim();
}

// If the original paragraph was written one sentence per line, keep that style.
function keepLineStyle(md, original) {
  const lines = original.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return md;
  return md.replace(/([.!?:;])\s+(?=[A-Z“"(\[*`])/g, '$1\n');
}
