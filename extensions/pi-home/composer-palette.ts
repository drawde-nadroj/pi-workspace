import type { Theme } from "@earendil-works/pi-coding-agent";
import { parseColor, visibleWidth, type Color } from "@earendil-works/pi-tui";
import { cleanLabel } from "./ui.ts";

/** The retained Composer preview/theme colors; no retired gallery direction is loaded. */
export type Palette = Record<string, Color>;
export function makeComposerPalette(light = false): Palette {
  const colors = {
    base: "#0d111c", panel: "#161e30", input: "#202b43", inset: "#101827", text: "#ecf0ff",
    muted: "#a7b6d1", faint: "#647796", line: "#354461", accent: "#bbadff", secondary: "#77dde6",
    success: "#98deae", warning: "#f2ca83", error: "#ff9ea7", glow: "#ffffff",
    ...(light ? {
      base: "#edf0f4", panel: "#dfe5eb", input: "#d2dce6", inset: "#e7edf1", text: "#1c2938",
      muted: "#45586a", faint: "#657788", line: "#98a7b5", accent: "#6546aa", secondary: "#176f80",
      success: "#276842", warning: "#87541d", error: "#a3334c", glow: "#273a5b",
    } : {}),
  };
  return Object.fromEntries(Object.entries(colors).map(([name, value]) => [name, parseColor(value)]));
}

interface Cell { text: string; span: number; fg: string; bg: string; bold: boolean }
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Fixed-cell synthetic preview; returns ordinary Pi component rows. */
export class Canvas {
  private cells: Cell[][];
  constructor(readonly width: number, readonly height: number, private theme: Theme, readonly palette: Palette) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => this.blank()));
  }
  private blank(bg = "base"): Cell { return { text: " ", span: 1, fg: "text", bg, bold: false }; }
  fill(x: number, y: number, width: number, height: number, bg: string): void {
    for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row++) {
      for (let col = Math.max(0, x); col < Math.min(this.width, x + width); col++) {
        this.erase(col, row);
        this.cells[row][col] = this.blank(bg);
      }
    }
  }
  private erase(x: number, y: number): void {
    const row = this.cells[y];
    let lead = x;
    while (lead > 0 && row[lead].span === 0) lead--;
    const span = Math.max(1, row[lead].span);
    for (let i = lead; i < Math.min(this.width, lead + span); i++) row[i] = this.blank(row[i].bg);
  }
  text(x: number, y: number, value: string, fg = "text", bg?: string, bold = false, limit = this.width - x): void {
    if (y < 0 || y >= this.height || limit <= 0) return;
    const end = Math.min(this.width, x + limit);
    for (const { segment } of segmenter.segment(cleanLabel(value))) {
      const span = visibleWidth(segment);
      if (!span) continue;
      if (x + span > end) break;
      if (x >= 0) {
        const background = bg ?? this.cells[y][x].bg;
        for (let i = 0; i < span; i++) this.erase(x + i, y);
        this.cells[y][x] = { text: segment, span, fg, bg: background, bold };
        for (let i = 1; i < span; i++) this.cells[y][x + i] = { text: "", span: 0, fg, bg: background, bold };
      }
      x += span;
    }
  }
  right(y: number, value: string, fg = "muted", margin = 2, bg?: string): void {
    this.text(Math.max(margin, this.width - margin - visibleWidth(cleanLabel(value))), y, value, fg, bg, false, this.width - 2 * margin);
  }
  rule(x: number, y: number, width: number, fg = "line", char = "─"): void { this.text(x, y, char.repeat(Math.max(0, width)), fg); }
  badge(x: number, y: number, label: string, fg = "accent", bg = "input"): number {
    const text = ` ${label} `;
    this.text(x, y, text, fg, bg, true);
    return visibleWidth(text);
  }
  render(): string[] {
    return this.cells.map((row) => {
      let out = "", text = "", previous: Cell | undefined;
      const flush = () => {
        if (previous && text) out += this.theme.style(text, {
          fg: this.palette[previous.fg] ?? this.palette.text,
          bg: this.palette[previous.bg] ?? this.palette.base,
          bold: previous.bold,
        });
        text = "";
      };
      for (const cell of row) {
        if (previous && (cell.fg !== previous.fg || cell.bg !== previous.bg || cell.bold !== previous.bold)) flush();
        previous = cell;
        text += cell.text;
      }
      flush();
      return out;
    });
  }
}
