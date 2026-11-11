// In-page editor (dev only).
//
//   Text blocks (paragraphs, headings, simple lists, quotes): click into the rendered text and type,
//   as in a document. Enter or ⌘/Ctrl+Enter saves, Esc cancels. ⌘/Ctrl+B / I / E / K format.
//   Any block: hover → Source (edit raw MDX), Comment, + Paragraph.
//
// Saves rewrite the block's source lines in the .mdx file; Vite then reloads the page,
// and the scroll position is restored.
import './client.css';
import { canEditRich, toMarkdown } from './serialize.js';

const SCROLL_KEY = 'dev-editor:scroll';
const blocks = () => document.querySelectorAll('.src-block[data-src]');

if (blocks().length) init();

function init() {
  restoreScroll();

  const bar = el('div', 'ed-bar');
  const sourceBtn = button('Source', 'Edit the MDX source of this block');
  const commentBtn = button('Comment', 'Add a comment below this block');
  const addBtn = button('+ ¶', 'Add a new paragraph below this block');
  bar.append(sourceBtn, commentBtn, addBtn);
  document.body.append(bar);

  let current = null;
  let busy = false;

  for (const block of blocks()) {
    const target = richTarget(block);
    if (target) {
      target.classList.add('ed-rich');
      target.title = 'Click to edit';
    }
  }

  document.addEventListener('mouseover', (e) => {
    if (busy) return;
    const block = e.target.closest?.('.src-block[data-src]');
    if (!block || block === current) return;
    current = block;
    placeBar(bar, block);
  });
  window.addEventListener('scroll', () => current && !busy && placeBar(bar, current), { passive: true });

  document.addEventListener('click', (e) => {
    if (busy || e.target.closest('a[href]') && !e.target.closest('[contenteditable]')) return;
    const target = e.target.closest?.('.ed-rich');
    if (!target) return;
    const block = target.closest('.src-block');
    startRich(block, target);
  });

  sourceBtn.addEventListener('click', () => current && openSource(current));
  commentBtn.addEventListener('click', () => current && openText(current, 'comment'));
  addBtn.addEventListener('click', () => current && openText(current, 'insert'));

  // Notes toggle, remembered per browser.
  const toggle = button('', 'Show or hide writing notes and comments');
  toggle.className = 'ed-toggle';
  const key = 'dev-editor:hide-notes';
  const apply = (hide) => {
    document.documentElement.classList.toggle('ed-hide-notes', hide);
    toggle.textContent = hide ? 'Notes: hidden' : 'Notes: shown';
  };
  apply(safeGet(key) === '1');
  toggle.addEventListener('click', () => {
    const hide = !document.documentElement.classList.contains('ed-hide-notes');
    safeSet(key, hide ? '1' : '0');
    apply(hide);
  });
  document.body.append(toggle);

  const lock = () => {
    busy = true;
    bar.hidden = true;
  };
  const unlock = () => {
    busy = false;
    bar.hidden = false;
  };

  // ---------- rich (in-place) editing ----------

  async function startRich(block, target) {
    const { file, start, end } = info(block);
    const res = await api('GET', `/source?file=${encodeURIComponent(file)}&start=${start}&end=${end}`);
    if (!res) return;
    const original = res.text;
    lock();

    const before = target.innerHTML;
    target.contentEditable = 'true';
    target.classList.add('ed-active');
    target.focus();

    const tools = el('div', 'ed-mini');
    const fmt = [
      ['B', 'Bold (⌘/Ctrl+B)', () => document.execCommand('bold')],
      ['I', 'Italic (⌘/Ctrl+I)', () => document.execCommand('italic')],
      ['</>', 'Inline code (⌘/Ctrl+E)', () => wrapSelection('code')],
      ['Link', 'Link (⌘/Ctrl+K)', () => addLink()],
    ];
    for (const [label, title, fn] of fmt) {
      const b = button(label, title);
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
      b.addEventListener('click', fn);
      tools.append(b);
    }
    const status = el('span', 'ed-mini-status');
    status.textContent = 'Enter to save · Esc to cancel';
    const save = button('Save');
    save.classList.add('ed-primary');
    const cancel = button('Cancel');
    save.addEventListener('mousedown', (e) => e.preventDefault());
    tools.append(status, cancel, save);
    document.body.append(tools);
    const placeTools = () => {
      const r = target.getBoundingClientRect();
      tools.style.top = `${window.scrollY + r.top - tools.offsetHeight - 6}px`;
      tools.style.left = `${window.scrollX + r.left}px`;
    };
    placeTools();
    window.addEventListener('scroll', placeTools, { passive: true });

    const finish = () => {
      window.removeEventListener('scroll', placeTools);
      target.removeEventListener('keydown', onKey);
      target.removeEventListener('paste', onPaste);
      tools.remove();
      target.contentEditable = 'false';
      target.removeAttribute('contenteditable');
      target.classList.remove('ed-active');
      unlock();
    };

    const doSave = async () => {
      const md = toMarkdown(target, original);
      if (md === null) {
        status.textContent = 'Unsupported formatting here; use Source instead.';
        return;
      }
      if (md.trim() === original.trim()) {
        finish();
        return;
      }
      status.textContent = 'Saving…';
      saveScroll();
      const ok = await api('POST', '/replace', { file, start, end, original, text: md });
      if (ok) status.textContent = 'Saved — reloading…';
    };
    const doCancel = () => {
      target.innerHTML = before;
      finish();
    };

    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') return e.preventDefault(), doCancel();
      if (e.key === 'Enter' && (mod || (!e.shiftKey && !target.matches('ul, ol')))) return e.preventDefault(), doSave();
      if (mod && e.key.toLowerCase() === 'e') return e.preventDefault(), wrapSelection('code');
      if (mod && e.key.toLowerCase() === 'k') return e.preventDefault(), addLink();
    };
    const onPaste = (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ');
      document.execCommand('insertText', false, text);
    };
    target.addEventListener('keydown', onKey);
    target.addEventListener('paste', onPaste);
    save.addEventListener('click', doSave);
    cancel.addEventListener('click', doCancel);
  }

  // ---------- source / comment / insert panels ----------

  async function openSource(block) {
    const { file, start, end } = info(block);
    const res = await api('GET', `/source?file=${encodeURIComponent(file)}&start=${start}&end=${end}`);
    if (!res) return;
    const original = res.text;
    const panel = makePanel(block, original, 'Save', 'Raw MDX. Empty the text and save to delete this block.');
    block.classList.add('ed-editing');
    lock();
    panel.onSave = async (text) => {
      if (text === original) return close();
      saveScroll();
      const ok = await api('POST', '/replace', { file, start, end, original, text });
      if (ok) panel.setStatus('Saved — reloading…');
    };
    panel.onCancel = close;
    function close() {
      panel.remove();
      block.classList.remove('ed-editing');
      unlock();
    }
  }

  function openText(block, mode) {
    const { file, end } = info(block);
    const comment = mode === 'comment';
    const panel = makePanel(
      block,
      '',
      comment ? 'Add comment' : 'Add paragraph',
      comment ? 'Saved as {/* @comment … */}; hidden in production.' : 'Markdown. Saved as a new block below.',
    );
    if (comment) panel.classList.add('ed-panel-comment');
    lock();
    panel.onSave = async (text) => {
      if (!text.trim()) return;
      saveScroll();
      const ok = await api('POST', comment ? '/comment' : '/insert', { file, after: end, text });
      if (ok) panel.setStatus('Saved — reloading…');
    };
    panel.onCancel = () => {
      panel.remove();
      unlock();
    };
  }
}

// Which element inside a block can be edited in place, if any.
function richTarget(block) {
  if (block.classList.contains('src-note') || block.classList.contains('src-comment')) return null;
  const kids = [...block.children];
  if (kids.length !== 1) return null;
  const node = kids[0];
  if (!node.matches('p, h2, h3, h4, h5, h6, ul, ol, blockquote')) return null;
  return canEditRich(node) ? node : null;
}

function wrapSelection(tag) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const wrapper = document.createElement(tag);
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
  sel.removeAllRanges();
}

function addLink() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const url = window.prompt('Link URL');
  if (!url) return;
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('createLink', false, url);
}

function makePanel(block, value, saveLabel, hint) {
  const panel = el('div', 'ed-panel');
  const ta = el('textarea', 'ed-textarea');
  ta.value = value;
  ta.rows = Math.min(30, Math.max(4, value.split('\n').length + 1));
  const status = el('span', 'ed-status');
  status.textContent = hint;
  const save = button(saveLabel);
  save.classList.add('ed-primary');
  const cancel = button('Cancel');
  const row = el('div', 'ed-row');
  row.append(status, cancel, save);
  panel.append(ta, row);
  block.after(panel);
  ta.focus();

  save.addEventListener('click', () => panel.onSave?.(ta.value));
  cancel.addEventListener('click', () => panel.onCancel?.());
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save.click();
    if (e.key === 'Escape') cancel.click();
  });
  panel.setStatus = (t) => (status.textContent = t);
  return panel;
}

function placeBar(bar, block) {
  const r = rectOf(block);
  bar.style.top = `${window.scrollY + r.top}px`;
  bar.style.left = `${window.scrollX + Math.min(r.right + 8, document.documentElement.clientWidth - bar.offsetWidth - 8)}px`;
}

// .src-block uses display: contents, so measure its children instead.
function rectOf(block) {
  const rects = [...block.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rects.length) return block.getBoundingClientRect();
  return {
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
  };
}

function info(block) {
  const [start, end] = block.dataset.src.split('-').map(Number);
  return { file: block.dataset.srcFile, start, end };
}

function saveScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ path: location.pathname, y: window.scrollY, t: Date.now() }));
  } catch {}
}

function restoreScroll() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? 'null');
    // A save can trigger more than one reload (file change, then content sync), so the
    // saved position stays valid for a few seconds instead of being consumed once.
    if (saved?.path === location.pathname && Date.now() - saved.t < 8000) {
      history.scrollRestoration = 'manual';
      // Layout can still grow while fonts and figures load; re-apply until it sticks.
      let tries = 0;
      const apply = () => {
        window.scrollTo(0, saved.y);
        if (Math.abs(window.scrollY - saved.y) > 2 && ++tries < 20) setTimeout(apply, 50);
      };
      if (document.readyState === 'complete') apply();
      else window.addEventListener('load', apply, { once: true });
    }
  } catch {}
}

async function api(method, path, body) {
  try {
    const res = await fetch(`/__editor${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json;
  } catch (err) {
    alert(`Editor: ${err.message}`);
    return null;
  }
}

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function button(label, title) {
  const b = el('button');
  b.type = 'button';
  b.textContent = label;
  if (title) b.title = title;
  return b;
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}
