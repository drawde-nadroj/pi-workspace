import { parseColor, type Color } from "@earendil-works/pi-tui";

/** Palette roles used by the live Composer theme. */
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
