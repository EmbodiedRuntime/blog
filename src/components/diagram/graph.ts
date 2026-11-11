// Tiny geometry helpers for box-and-arrow diagrams.
// Nodes are rectangles given by their center; edges attach to the box borders.

export type NodeKind = 'default' | 'model' | 'program' | 'io' | 'runtime' | 'state' | 'ghost';

export interface GNode {
  id: string;
  x: number; // center
  y: number; // center
  w?: number;
  h?: number;
  label: string;
  sub?: string;
  kind?: NodeKind;
  /** Visible from this step on (inside <Stepper>). */
  step?: number;
  /** Visible only before this step. */
  until?: number;
  /** Highlighted as newly added at its `step`. */
  className?: string;
}

export interface GEdge {
  from: string;
  to: string;
  label?: string;
  /** Perpendicular offset of a quadratic curve; sign picks the side. */
  bend?: number;
  dashed?: boolean;
  /** Visual emphasis: accent color (e.g. events), or failure. */
  tone?: 'accent' | 'fail' | 'muted';
  step?: number;
  until?: number;
  /** Explicit path instead of the computed one (for loops around other nodes). */
  d?: string;
  labelAt?: { x: number; y: number };
}

export const DEFAULT_W = 128;
export const DEFAULT_H = 44;

const size = (n: GNode) => ({ w: n.w ?? DEFAULT_W, h: n.h ?? DEFAULT_H });

/** Point where the ray from the node center toward (tx, ty) leaves the box, plus a small gap. */
function anchor(n: GNode, tx: number, ty: number, gap = 3) {
  const { w, h } = size(n);
  const dx = tx - n.x;
  const dy = ty - n.y;
  if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
  const sx = dx === 0 ? Infinity : w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  const len = Math.hypot(dx, dy);
  return { x: n.x + dx * s + (dx / len) * gap, y: n.y + dy * s + (dy / len) * gap };
}

export function edgeGeometry(nodes: Map<string, GNode>, e: GEdge) {
  const a = nodes.get(e.from);
  const b = nodes.get(e.to);
  if (!a || !b) throw new Error(`Unknown edge endpoint ${e.from} → ${e.to}`);

  if (e.d) return { d: e.d, label: e.labelAt ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };

  if (!e.bend) {
    const p = anchor(a, b.x, b.y);
    const q = anchor(b, a.x, a.y, 3);
    return { d: `M${r(p.x)},${r(p.y)} L${r(q.x)},${r(q.y)}`, label: e.labelAt ?? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
  }

  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const cx = mx + nx * e.bend;
  const cy = my + ny * e.bend;
  const p = anchor(a, cx, cy);
  const q = anchor(b, cx, cy, 3);
  // Label at the curve midpoint (t = 0.5 on the quadratic).
  const lx = 0.25 * p.x + 0.5 * cx + 0.25 * q.x;
  const ly = 0.25 * p.y + 0.5 * cy + 0.25 * q.y;
  return { d: `M${r(p.x)},${r(p.y)} Q${r(cx)},${r(cy)} ${r(q.x)},${r(q.y)}`, label: e.labelAt ?? { x: lx, y: ly } };
}

const r = (v: number) => Math.round(v * 10) / 10;

/**
 * Arrowhead drawn as a polygon aligned with the path's final tangent, plus the path shortened so
 * the line ends at the base of the head. Avoids SVG markers, whose `orient` support varies.
 * Understands the path commands used in this kit: M, L, Q, C with absolute coordinates.
 */
export function arrowize(d: string, len = 9, halfWidth = 4.5) {
  const tokens = d.match(/[MLQC]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  type Seg = { cmd: string; pts: number[][] };
  const segs: Seg[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++].toUpperCase();
    const n = { M: 1, L: 1, Q: 2, C: 3 }[cmd as 'M'];
    if (!n) return { d, head: '' };
    const pts: number[][] = [];
    for (let k = 0; k < n; k++) pts.push([Number(tokens[i++]), Number(tokens[i++])]);
    segs.push({ cmd, pts });
  }
  if (segs.length < 2) return { d, head: '' };

  const last = segs[segs.length - 1];
  const end = last.pts[last.pts.length - 1];
  // Walk back to the nearest point that differs from the end point: that gives the tangent.
  const candidates = [...last.pts.slice(0, -1).reverse(), segs[segs.length - 2].pts.at(-1)!];
  const from = candidates.find((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) > 0.5) ?? candidates[candidates.length - 1];
  const dx = end[0] - from[0];
  const dy = end[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const base = [end[0] - ux * len, end[1] - uy * len];

  // Shorten the path so the stroke stops inside the head instead of poking through the tip.
  last.pts[last.pts.length - 1] = [end[0] - ux * (len - 1), end[1] - uy * (len - 1)];
  const trimmed = segs.map((s) => s.cmd + s.pts.map((p) => `${r(p[0])},${r(p[1])}`).join(' ')).join(' ');

  const head = `M${r(end[0])},${r(end[1])} L${r(base[0] - uy * halfWidth)},${r(base[1] + ux * halfWidth)} L${r(base[0] + uy * halfWidth)},${r(base[1] - ux * halfWidth)} Z`;
  return { d: trimmed, head };
}

export function nodeBox(n: GNode) {
  const { w, h } = size(n);
  return { x: n.x - w / 2, y: n.y - h / 2, w, h };
}

/** data-* attributes understood by <Stepper>. */
export function stepAttrs(o: { step?: number; until?: number }) {
  const attrs: Record<string, string> = {};
  if (o.step !== undefined) attrs['data-step'] = String(o.step);
  if (o.until !== undefined) attrs['data-until'] = String(o.until);
  return attrs;
}
