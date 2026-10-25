import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripVTControlCharacters } from "node:util";
import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";
import { selectionHighlight } from "./footer-selection.ts";

export interface PreviewRegion { id: string; x: number; y: number; width: number; affected?: boolean }
export interface SelectablePreview { rows: string[]; hits: PreviewRegion[] }

/** Egregore-only visual adapter. No application state, settings, input, or timers. */
export function connectPreview(theme: Theme, view: SelectablePreview, selected: string, options: {
  frameId: string; phase?: number; related?: string[];
}): SelectablePreview {
  // Discover actual perimeters, including side rails. Small unframed fallbacks
  // receive no invented frame target. Label targets precede perimeter targets.
  const hits = view.hits.filter(hit => hit.id !== options.frameId);
  view.rows.forEach((row, y) => {
    const plain = stripVTControlCharacters(row), width = visibleWidth(row);
    if (width < 2) return;
    if (/^[╭┌┏╰└┗]/u.test(plain) && /[╮┐┓╯┘┛]$/u.test(plain)) {
      hits.push({ id: options.frameId, x: 0, y, width });
    } else if (/^[│┃]/u.test(plain) && /[│┃]$/u.test(plain)) {
      hits.push({ id: options.frameId, x: 0, y, width: 1 }, { id: options.frameId, x: width - 1, y, width: 1 });
    }
  });
  const selectedIds = new Set([selected, ...(options.related ?? [])]);
  const rows = view.rows.map((row, y) => {
    const width = visibleWidth(row);
    const onRow = hits.filter(hit => hit.y === y && hit.x >= 0 && hit.width > 0 && hit.x + hit.width <= width);
    let ranges = onRow.filter(hit => selectedIds.has(hit.id) && hit.affected !== false).map(hit => ({ start: hit.x, end: hit.x + hit.width }));
    if (selected === options.frameId) {
      // A perimeter selection must not cover labels with unrelated custom or
      // semantic colors. Subtract their real cell rectangles, not string indices.
      for (const hit of onRow.filter(hit => hit.id !== options.frameId)) {
        ranges = ranges.flatMap(range => {
          if (hit.x >= range.end || hit.x + hit.width <= range.start) return [range];
          return [
            { start: range.start, end: Math.min(range.end, hit.x) },
            { start: Math.max(range.start, hit.x + hit.width), end: range.end },
          ].filter(part => part.end > part.start);
        });
      }
    }
    const merged: typeof ranges = [];
    for (const range of ranges.sort((a, b) => a.start - b.start)) {
      const last = merged.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    if (!merged.length) return row;
    let painted = "", column = 0;
    for (const range of merged) {
      painted += sliceByColumn(row, column, range.start - column);
      painted += selectionHighlight(theme, sliceByColumn(row, range.start, range.end - range.start), {
        phase: options.phase, underline: selected !== options.frameId,
      });
      column = range.end;
    }
    return painted + sliceByColumn(row, column, width - column);
  });
  return { rows, hits };
}
