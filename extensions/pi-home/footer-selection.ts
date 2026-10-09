import type { Theme } from "@earendil-works/pi-coding-agent";
import { backgroundAnsi, colorToRgb, indexedColor, mixColors, parseColor, truncateToWidth, visibleWidth, type Color, type TerminalColorMode } from "@earendil-works/pi-tui";

export const SELECTION_SHIMMER_MS = 480;
const FRAME_MS = 40;
export type PulseKind = "element" | "focus";

/** Interaction-owned, one pass only. Rendering never starts or extends a timer. */
export class SelectionPulse {
  private timer?: ReturnType<typeof setTimeout>;
  private started?: number;
  kind?: PulseKind;
  constructor(private repaint: () => void, private now = () => performance.now()) {}
  get phase(): number | undefined {
    if (this.started === undefined) return undefined;
    const elapsed = this.now() - this.started;
    return elapsed >= SELECTION_SHIMMER_MS ? undefined : Math.max(0, elapsed / SELECTION_SHIMMER_MS);
  }
  start(kind: PulseKind) {
    this.stop(); this.kind = kind; this.started = this.now(); this.schedule();
  }
  stop() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.started = undefined; this.kind = undefined;
  }
  private schedule() {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.phase === undefined) this.stop(); else this.schedule();
      this.repaint(); // Includes the final, completely static frame.
    }, FRAME_MS);
    this.timer.unref?.();
  }
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const sgr = /(\x1b\[[0-9;:]*m)/;
const luminance = (color: Color) => {
  const { r, g, b } = colorToRgb(color);
  const linear = (v: number) => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  return .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
};
const contrast = (a: Color, b: Color) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
/** Adjust the highlight, never the foreground chosen by the user. */
function readableBackground(color: Color, foreground: Color, mode: TerminalColorMode): Color {
  // Check the colors the terminal will actually receive, including quantization.
  const displayed = (c: Color) => mode === "truecolor" ? c : indexedColor(Number(backgroundAnsi(c, mode).match(/;(\d+)m$/)![1]));
  const fg = displayed(foreground);
  if (contrast(displayed(color), fg) >= 4.5) return color;
  const black = parseColor("#000000"), white = parseColor("#ffffff");
  const end = contrast(black, fg) >= contrast(white, fg) ? black : white;
  for (let amount = .1; amount < 1; amount += .1) {
    const adjusted = mixColors(color, end, amount, "srgb");
    if (contrast(displayed(adjusted), fg) >= 4.5) return adjusted;
  }
  return end;
}

/** Paint only backgrounds (and optional underline) on theme-styled labels.
 * SGR foreground/weight and all graphemes are retained verbatim. Not for draft rows.
 * Width, hit targets and text never change during a sweep.
 */
export function selectionHighlight(theme: Theme, text: string, options: {
  phase?: number; focused?: boolean; underline?: boolean; foreground?: Color;
} = {}): string {
  const width = visibleWidth(text);
  if (!width) return text;
  const foreground = options.foreground ?? theme.colors.text;
  // Composer deliberately uses transparent panel backgrounds. Mix in sRGB so
  // its black/white fallback still gets a visible tint, not near-black OKLCH.
  const surface = mixColors(theme.colors.selectedBg, theme.colors.toolPendingBg, .35, "srgb");
  const base = mixColors(surface, theme.colors.accent, options.focused ? .30 : .22, "srgb");
  const mode = theme.getColorMode();
  const colors = [0, .08, .16, .24].map(amount => backgroundAnsi(readableBackground(mixColors(base, theme.colors.accent, amount, "srgb"), foreground, mode), mode));
  const phase = options.phase;
  const radius = Math.max(2, Math.min(8, width * .16));
  const center = phase === undefined ? -Infinity : phase * (width + radius * 2) - radius;
  let result = "", column = 0, last = "";
  for (const token of text.split(sgr)) {
    if (token.startsWith("\x1b[")) { result += token; last = ""; continue; }
    for (const { segment } of segmenter.segment(token)) {
      const cells = visibleWidth(segment);
      const strength = Math.max(0, 1 - Math.abs(column + cells / 2 - center) / radius);
      const shade = colors[Math.min(3, Math.floor(strength * 4))];
      if (shade !== last) { result += shade; if (options.underline) result += "\x1b[4m"; last = shade; }
      result += segment; column += cells;
    }
  }
  return result + "\x1b[49m" + (options.underline ? "\x1b[24m" : "");
}

export function selectionRow(theme: Theme, text: string, width: number, options: {
  selected?: boolean; focused?: boolean; phase?: number;
} = {}): string {
  const marker = options.focused ? "› " : options.selected ? "• " : "  ";
  const content = truncateToWidth(theme.fg("accent", marker) + theme.style(text, { fg: theme.colors.text, bold: options.focused }), Math.max(0, width), "…");
  const padded = content + " ".repeat(Math.max(0, width - visibleWidth(content)));
  return options.selected || options.focused ? selectionHighlight(theme, padded, options) : padded;
}
