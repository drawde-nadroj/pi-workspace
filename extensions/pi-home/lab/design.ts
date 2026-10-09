import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, parseColor, visibleWidth, type Color } from "@earendil-works/pi-tui";
import { cleanLabel } from "../ui.ts";
import { GARDEN_COLORS, SPECTRA, type Mood } from "./lighting.ts";
export { MOODS, MOOD_NAMES, type Mood } from "./lighting.ts";

export const DIRECTIONS = ["prism", "terrarium", "arcade", "glasshouse"] as const;
export type Direction = typeof DIRECTIONS[number];
export type Palette = Record<string, Color>;
export const NAMES: Record<Direction, string> = { prism: "Prism", terrarium: "Terrarium", arcade: "Arcade Studio", glasshouse: "Glasshouse" };
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Shared semantic roles, different art direction. These are preview tokens, not a frozen plugin API.
export function makePalette(direction: Direction, light = false, mood: Mood = "biolume"): Palette {
  const schemes = {
    prism: { base: "#0d111c", panel: "#161e30", input: "#202b43", inset: "#101827", text: "#ecf0ff", muted: "#a7b6d1", faint: "#647796", line: "#354461", accent: "#bbadff", secondary: "#77dde6" },
    terrarium: { base: "#101b1a", panel: "#1b2b26", input: "#28392f", inset: "#12231e", text: "#eee6cd", muted: "#b5c0a6", faint: "#728d7f", line: "#456154", accent: "#ebc58b", secondary: "#8ac5a2" },
    arcade: { base: "#10121e", panel: "#20233a", input: "#2c3150", inset: "#15182b", text: "#f0f2ff", muted: "#b1b7d4", faint: "#717da5", line: "#4b537c", accent: "#a3f2c9", secondary: "#e0a5eb" },
  };
  const baseDirection = direction === "glasshouse" ? "terrarium" : direction;
  const s = schemes[baseDirection];
  const lightAccents = { prism: ["#6546aa", "#176f80"], terrarium: ["#805726", "#386d4f"], arcade: ["#126345", "#8b3a84"] };
  const colors: Record<string, string> = {
    ...s, success: "#98deae", warning: "#f2ca83", error: "#ff9ea7", glow: "#ffffff",
    fur: "#e5ad73", furLight: "#ffe0a3", furShade: "#ac7353", ink: "#252435", leaf: "#87bf85", pot: "#c68c77",
    ...(light ? {
      base: "#edf0f4", panel: "#dfe5eb", input: "#d2dce6", inset: "#e7edf1", text: "#1c2938", muted: "#45586a",
      faint: "#657788", line: "#98a7b5", accent: lightAccents[baseDirection][0], secondary: lightAccents[baseDirection][1],
      success: "#276842", warning: "#87541d", error: "#a3334c", glow: "#273a5b",
    } : {}),
    ...(direction === "glasshouse" ? GARDEN_COLORS[mood] : {}),
  };
  const palette: Palette = Object.fromEntries(Object.entries(colors).map(([name, value]) => [name, parseColor(value)]));
  for (let i = 0; i <= 16; i++) palette[`shine${i}`] = mixColors(palette.line, palette.accent, i / 16);
  // Coverage colors, not a hue animation: fractional eye pixels blend only ink/lid with the original fur.
  // Cache outside the sprite render path. Endpoints still use the exact original ink/fur tokens.
  for (let i = 1; i < 64; i++) {
    palette[`eye${i}`] = mixColors(palette.fur, palette.ink, i / 64, "srgb");
    palette[`lid${i}`] = mixColors(palette.fur, palette.furShade, i / 64, "srgb");
  }
  if (direction === "glasshouse") {
    for (let i = 0; i < 6; i++) {
      palette[`spectrum${i}`] = parseColor(SPECTRA[mood][i]);
      palette[`mist${i}`] = mixColors(palette.inset, palette[`spectrum${i}`], mood === "kaleido" ? 0.09 : 0.055);
      palette[`trail${i}`] = mixColors(palette.inset, palette[`spectrum${i}`], 0.4);
      palette[`leaf${i}`] = mixColors(palette.leafShade, palette.leafLight, i / 5);
      palette[`forest${i}`] = mixColors(palette.inset, palette.leaf, 0.12 + i * 0.08);
      if (mood === "biolume") {
        for (let light = 0; light < 16; light++) {
          palette[`firefly${i}_${light}`] = mixColors(palette.inset, palette[`spectrum${i}`], 0.07 + 0.93 * light / 15, "oklch");
        }
      }
    }
    // Cached pastel gradients: use pi's own perceptual color mixing, not a second color dependency.
    for (let i = 0; i < 48; i++) {
      const band = Math.floor(i / 8);
      palette[`aura${i}`] = mixColors(palette[`spectrum${band}`], palette[`spectrum${(band + 1) % 6}`], (i % 8) / 8, "oklch");
      palette[`echo${i}`] = mixColors(palette.inset, palette[`aura${i}`], 0.42, "oklch");
    }
  }
  return palette;
}

interface Cell { text: string; span: number; fg: string; bg: string; bold: boolean }

/** Fixed-cell composition; returns ordinary pi Component lines, never writes to the terminal. */
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
  private erase(x: number, y: number) {
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
  /** Composite a sprite over existing half-block art without rectangular background cutouts. */
  halfBlocks(x: number, y: number, top?: string, bottom?: string): void {
    if ((!top && !bottom) || x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const cell = this.cells[y][x];
    const upper = top ?? (cell.text === "▀" || cell.text === "█" ? cell.fg : cell.bg);
    const lower = bottom ?? (cell.text === "▄" || cell.text === "█" ? cell.fg : cell.bg);
    this.text(x, y, upper === lower ? " " : "▀", upper, lower);
  }
  right(y: number, value: string, fg = "muted", margin = 2, bg?: string): void {
    this.text(Math.max(margin, this.width - margin - visibleWidth(cleanLabel(value))), y, value, fg, bg, false, this.width - 2 * margin);
  }
  rule(x: number, y: number, width: number, fg = "line", char = "─"): void {
    this.text(x, y, char.repeat(Math.max(0, width)), fg);
  }
  badge(x: number, y: number, label: string, fg = "accent", bg = "input"): number {
    const text = ` ${label} `;
    this.text(x, y, text, fg, bg, true);
    return visibleWidth(text);
  }
  panel(x: number, y: number, width: number, height: number, title: string, direction: Direction): void {
    this.fill(x, y, width, height, "panel");
    if (direction === "arcade") {
      this.rule(x, y, width, "line", "═");
      this.text(x, y, "╔", "accent");
      this.text(x + width - 1, y, "╗", "accent");
      this.badge(x + 2, y, title.toUpperCase(), "accent", "panel");
    } else {
      this.text(x + 2, y + 1, title, "muted", "panel", true, width - 4);
      this.text(x, y + 1, direction === "prism" || direction === "glasshouse" ? "▍" : "│", "accent");
    }
  }
  progress(x: number, y: number, width: number, value: number, segmented = false): void {
    const count = Math.round(Math.max(0, Math.min(1, value)) * width);
    for (let i = 0; i < width; i++) this.text(x + i, y, segmented ? (i % 3 === 2 ? " " : "▪") : "━", i < count ? "success" : "line");
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

export const PHASE_STARTS = [0, 4000, 8000, 11000, 14000, 16000];
export const LOOP_MS = 26000;
export type Phase = "thinking" | "tools" | "waiting" | "responding" | "complete" | "idle" | "error";
export interface DemoFrame {
  elapsed: number;
  visual: number;
  phase: Phase;
  done: number;
  status: string;
  timing: string;
  failed: boolean;
}
export function demoFrame(time: number, visual: number, error = false): DemoFrame {
  const elapsed = Math.max(0, time) % LOOP_MS;
  const phase: Phase = error ? "error" : elapsed < 4000 ? "thinking" : elapsed < 8000 ? "tools" : elapsed < 11000 ? "waiting"
    : elapsed < 14000 ? "responding" : elapsed < 16000 ? "complete" : "idle";
  const done = elapsed < 4000 ? 1 : elapsed < 8000 ? 2 : elapsed < 11000 ? 3 : elapsed < 14000 ? 4 : 5;
  const statuses = {
    thinking: "Finding the shape of an idea", tools: "Reading · editing · checking", waiting: "Your turn · a question is ready",
    responding: "Putting the pieces together", complete: "A little more like home", idle: "Ready when you are", error: "A check failed · nothing hidden",
  };
  const timing = error ? "demo error · R to replay" : elapsed < 14000 ? `working ${(elapsed / 1000).toFixed(1)}s`
    : `took 14.0s · idle ${Math.floor((elapsed - 14000) / 1000)}s`;
  return { elapsed, visual, phase, done, status: statuses[phase], timing, failed: error };
}
