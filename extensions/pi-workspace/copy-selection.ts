import { stripVTControlCharacters } from "node:util";
import { Container, sliceByColumn, type Component } from "@earendil-works/pi-tui";

// Provenance belongs to the rendering adapter, never to a glyph-pattern filter.
// Weak keys do not retain messages or sessions. Only the latest render is eligible.
type Frame = { width: number; rows: string[]; inset: number; padding: number };
const frames = new WeakMap<Component, Frame>();
export function forgetCopyFrame(owner: Component): void { frames.delete(owner); }
export function rememberCopyFrame(owner: Component, width: number, rows: string[], inset = 0, padding = 0): string[] {
  frames.set(owner, { width, rows, inset, padding });
  return rows;
}
type Box = { component: Component; children: Box[]; scrollView?: unknown; scrollContentLines?: string[]; rect: { width: number } };
type Point = { row: number; col: number; scrollView?: unknown; boundary?: boolean };
type Selection = { start: Point; end: Point };
type Host = {
  currentLayout?: { root: Box };
  getActiveSelectionText: () => string | undefined;
  getSelectionBounds: () => Selection | undefined;
  getSelectionColumns: (line: string, row: number, selection: Selection) => { start: number; end: number };
};
type Span = { row: number; frame: Frame };

function findScrollBox(box: Box, scrollView: unknown, depth = 0): Box | undefined {
  if (depth > 32 || !box || !Array.isArray(box.children)) return;
  if (box.scrollView === scrollView) return box;
  for (const child of box.children) { const found = findScrollBox(child, scrollView, depth + 1); if (found) return found; }
}

/** Follow only native vertical Containers' recorded mouse layout; never rerender
 * during copying or infer coordinates for third-party/custom layout engines. */
function collect(component: Component, width: number, row: number, height: number, spans: Span[], depth = 0): void {
  if (depth > 32) return;
  const frame = frames.get(component);
  if (frame) {
    if (frame.width === width && frame.rows.length === height) spans.push({ row, frame });
    return;
  }
  if (!(component instanceof Container) || component.render !== Container.prototype.render) return;
  const layout = (component as unknown as { mouseLayout?: { width: number; children: { component: Component; height: number }[] } }).mouseLayout;
  if (!layout || layout.width !== width || !Array.isArray(layout.children) ||
    layout.children.length !== component.children.length ||
    layout.children.some((child, i) => child.component !== component.children[i] || !Number.isInteger(child.height) || child.height < 0) ||
    layout.children.reduce((sum, child) => sum + child.height, 0) !== height) return;
  for (const child of layout.children) { collect(child.component, width, row, child.height, spans, depth + 1); row += child.height; }
}

function selectedText(host: Host, native: string | undefined): string | undefined {
  if (native === undefined) return native;
  const selection = host.getSelectionBounds();
  // Fixed docks, overlays and terminal-owned regular-mode selection stay native.
  if (!selection?.start.scrollView || selection.start.scrollView !== selection.end.scrollView || !host.currentLayout) return native;
  const box = findScrollBox(host.currentLayout.root, selection.start.scrollView);
  if (!box?.scrollContentLines || box.children.length !== 1) return native;
  const source = box.scrollContentLines;
  const content = box.children[0];
  const spans: Span[] = [];
  collect(content.component, content.rect.width, 0, source.length, spans);
  if (!spans.length) return native;
  const { start, end } = selection;
  if (!Number.isInteger(start.row) || !Number.isInteger(end.row) || start.row < 0 || end.row >= source.length || end.row < start.row) return native;
  const original: string[] = [], cleaned: string[] = [];
  let changed = false;
  for (let row = start.row; row <= end.row; row++) {
    const line = source[row];
    const columns = host.getSelectionColumns(line, row, selection);
    const text = (from: number, to: number) => stripVTControlCharacters(sliceByColumn(line, from, Math.max(0, to - from), true)).trimEnd();
    original.push(text(columns.start, columns.end));
    const span = spans.find(item => row >= item.row && row < item.row + item.frame.rows.length);
    // Exact rendered row + component provenance: identical glyphs in content or
    // an unowned component cannot cause frame detection. Stale layouts fail closed.
    if (!span || line !== span.frame.rows[row - span.row]) { cleaned.push(original.at(-1)!); continue; }
    const local = row - span.row, frame = span.frame;
    changed = true;
    if (local <= frame.padding || local >= frame.rows.length - 1 - frame.padding) continue;
    const left = Math.max(columns.start, 1 + frame.inset);
    const right = Math.min(columns.end, frame.width - 1 - frame.inset);
    // A selection containing only a side border has no copyable content.
    if (right > left) cleaned.push(text(left, right));
  }
  // Guard host extraction drift (ANSI, word selection, etc.) before substituting.
  if (!changed || original.join("\n") !== native) return native;
  return cleaned.join("\n") || undefined;
}

/** Instance-only Pi 1.0 adapter. No clipboard replacement, input or timer. */
export function installFrameAwareCopy(reference: unknown): () => void {
  const noop = () => {};
  if (!reference || typeof reference !== "object") return noop;
  const key = Symbol("pi-workspace:copy-receiver");
  const proxy = reference as Host & { [key]?: () => Host };
  let host: Host | undefined;
  try {
    // Resolve Pi's forwarding proxy so cleanup restores the actual renderer.
    proxy[key] = function () { return this; };
    host = proxy[key]!();
  } catch { return noop; }
  finally { if (host) delete (host as typeof proxy)[key]; }
  if (!host || typeof host.getActiveSelectionText !== "function" || typeof host.getSelectionBounds !== "function" || typeof host.getSelectionColumns !== "function") return noop;
  const target = host, original = target.getActiveSelectionText;
  const own = Object.hasOwn(target, "getActiveSelectionText");
  let active = true;
  const wrapped = function () {
    const native = original.call(target);
    if (!active) return native;
    try { return selectedText(target, native); } catch { return native; }
  };
  target.getActiveSelectionText = wrapped;
  return () => {
    active = false;
    if (target.getActiveSelectionText !== wrapped) return;
    if (own) target.getActiveSelectionText = original;
    else delete (target as Partial<Host>).getActiveSelectionText;
  };
}
