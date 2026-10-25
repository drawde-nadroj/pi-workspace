import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, type Color } from "@earendil-works/pi-tui";
import { selectionHighlight } from "./footer-selection.ts";

/** Static conversation identity. Retain explicit foreground/weight and terminal-cell geometry. */
export function sessionBadge(theme: Theme, text: string, color: Color, bold = true): string {
  const background = mixColors(theme.colors.customMessageBg, theme.colors.accent, .14, "srgb");
  return selectionHighlight(theme, theme.style(text, { fg: color, bold }), { background, foreground: color });
}
