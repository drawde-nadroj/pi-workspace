import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, parseColor, type Color } from "@earendil-works/pi-tui";
import type { FooterPrefs } from "./footer-state.ts";

export interface MotionFrame { now: number; running: boolean }
const STILL: MotionFrame = { now: 0, running: false };
export function moving(p: FooterPrefs, frame: MotionFrame = STILL): boolean {
  return p.motion !== "off" && p.effect !== "classic" && frame.running;
}
/** One thin rail, or a 2x4-dot cell raster. Occupancy never depends on animation time. */
export function meter(p: FooterPrefs, percent: number, length: number): string {
  const fraction = Math.max(0, Math.min(100, percent)) / 100;
  if (p.effect === "wave") {
    const columns = Math.round(fraction * length * 2);
    return Array.from({ length }, (_, i) => columns >= i * 2 + 2 ? "⣶" : columns === i * 2 + 1 ? "⡆" : "⠂").join("");
  }
  const filled = Math.round(fraction * length);
  return Array.from({ length }, (_, i) => i < filled - 1 ? "━" : i < filled ? "●" : "─").join("");
}
const paletteCache = new Map<string, Color[]>();
function palette(theme: Theme, p: FooterPrefs, warning?: "warning" | "error"): Color[] {
  const custom = theme.appearance === "light"
    ? { cyan: "#006879", violet: "#68409b", green: "#406522" }
    : { cyan: "#67d8e8", violet: "#c4a7ff", green: "#a0d080" };
  const accent = warning ? theme.colors[warning] : p.color === "semantic" ? parseColor(custom.cyan) : p.color === "theme" ? theme.colors.accent : p.color === "mono" ? theme.colors.text : parseColor(custom[p.color]);
  const key = JSON.stringify([accent, theme.colors.dim, theme.colors.text]);
  let colors = paletteCache.get(key);
  if (!colors) {
    colors = Array.from({ length: 24 }, (_, i) => mixColors(theme.colors.dim, accent, 0.35 + 0.65 * i / 23));
    colors.push(mixColors(accent, theme.colors.text, 0.45));
    if (paletteCache.size >= 32) paletteCache.clear();
    paletteCache.set(key, colors);
  }
  return colors;
}
/** Color changes supply motion; the context endpoint and percentage do not move falsely. */
export function paintMeter(text: string, theme: Theme, p: FooterPrefs, frame: MotionFrame = STILL, warning?: "warning" | "error"): string {
  if (p.effect === "classic") return text;
  const colors = palette(theme, p, warning), animate = moving(p, frame);
  return text.replace(/[━●─⣶⡆⠂]+/g, rail => {
    const filled = [...rail].filter(c => c !== "─" && c !== "⠂").length;
    const phase = animate ? frame.now / (p.effect === "firefly" ? 190 : p.effect === "wave" ? 130 : 260) : 0;
    const head = filled > 1 ? (Math.sin(phase / 3) + 1) / 2 * (filled - 1) : 0;
    return [...rail].map((c, i) => {
      if (i >= filled) return theme.fg("dim", c);
      const light = !animate ? 0.6 + 0.4 * i / Math.max(1, filled - 1)
        : p.effect === "firefly" ? Math.exp(-Math.pow(i - head, 2) / 1.6)
        : (Math.sin(i * 0.9 - phase) + 1) / 2;
      return theme.style(c, { fg: colors[Math.round(light * 23)], bold: p.effect === "firefly" && light > 0.85 });
    }).join("");
  });
}
export function workGlyph(p: FooterPrefs, frame: MotionFrame = STILL): string {
  if (p.effect === "classic") return "";
  if (!moving(p, frame)) return "◌";
  const step = Math.floor(frame.now / 100);
  if (p.effect === "firefly") return ["·•··", "··•·", "···•", "··•·", "·•··", "•···"][step % 6];
  if (p.effect === "wave") return ["⡀⣀⣠", "⣀⣠⣤", "⣠⣤⣆", "⣤⣆⡀", "⣆⡀⣀"][step % 5];
  return ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][step % 10];
}
export function decorateActivity(parts: string[], theme: Theme, p: FooterPrefs, frame: MotionFrame): string[] {
  return parts.map(part => {
    if (part.startsWith("working ")) {
      const glyph = workGlyph(p, frame);
      const teal = parseColor(theme.appearance === "dark" ? "#67d8e8" : "#006879");
      const pulse = moving(p, frame) ? 0.10 + 0.10 * (1 + Math.sin(frame.now / 550)) / 2 : 0;
      const color = mixColors(teal, theme.colors.text, pulse);
      const duration = part.slice("working ".length);
      return (glyph ? theme.style(glyph, { fg: color }) + " " : "") + "working " + theme.style(duration, { fg: color, bold: true });
    }
    if (p.effect !== "classic" && part.startsWith("last run ")) return theme.fg("success", "✓") + " " + part;
    return part;
  });
}
