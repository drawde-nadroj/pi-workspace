import { Theme, type ExtensionContext, type ThemeToken } from "@earendil-works/pi-coding-agent";
import { backgroundAnsi, colorToHex, foregroundAnsi, parseColor, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { GARDEN_COLORS } from "./lab/lighting.ts";
import { composerThemeColors } from "./composer-style.ts";

/** One palette for the workspace, transcript, tools, menus, syntax, and task host. */
export const PINE: Record<string, string> = { ...GARDEN_COLORS.biolume, input: "#1d3228" };
const BG = new Set(["selectedBg", "searchMatchBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]);
export const THEME_NAME = "pi-home-biolume";
export const THEME_COLORS = {
  accent: PINE.accent, border: PINE.line, borderAccent: PINE.accent, borderMuted: "#59715e",
  success: PINE.success, error: PINE.error, warning: PINE.warning, muted: PINE.muted, dim: PINE.faint, text: PINE.text,
  thinkingText: "#a5b7a5", selectedBg: "#304333", scrollbarTrack: "#304333", scrollbarThumb: "#839b84",
  searchMatchBg: "#454134", searchMatchText: PINE.glow,
  userMessageBg: "#20372b", userMessageText: PINE.text, customMessageBg: "#272e2c", customMessageText: PINE.text, customMessageLabel: PINE.accent,
  toolPendingBg: "#192820", toolSuccessBg: "#192820", toolErrorBg: "#34262a", toolTitle: PINE.secondary, toolOutput: PINE.muted,
  mdHeading: PINE.accent, mdLink: "#b6dcd0", mdLinkUrl: PINE.faint, mdCode: PINE.warning, mdCodeBlock: PINE.text,
  mdCodeBlockBorder: PINE.line, mdQuote: PINE.muted, mdQuoteBorder: PINE.line, mdHr: PINE.line, mdListBullet: PINE.secondary,
  toolDiffAdded: PINE.success, toolDiffRemoved: PINE.error, toolDiffContext: PINE.muted,
  syntaxComment: PINE.faint, syntaxKeyword: PINE.accent, syntaxFunction: PINE.warning, syntaxVariable: PINE.text,
  syntaxString: PINE.secondary, syntaxNumber: "#e4bdd1", syntaxType: "#b6dcd0", syntaxOperator: PINE.muted, syntaxPunctuation: PINE.muted,
  thinkingOff: PINE.faint, thinkingMinimal: "#91a690", thinkingLow: PINE.secondary, thinkingMedium: "#b6dcd0",
  thinkingHigh: PINE.accent, thinkingXhigh: "#e4bdd1", thinkingMax: PINE.warning, bashMode: PINE.secondary,
};
export const THEME_JSON = { name: THEME_NAME, appearance: "dark", colors: THEME_COLORS,
  export: { pageBg: PINE.base, cardBg: PINE.panel, infoBg: PINE.input } };
const colors = Object.fromEntries(Object.entries(PINE).map(([k, v]) => [k, parseColor(v)]));

function fromColors(values: Record<string, string>, mode: ReturnType<Theme["getColorMode"]>, name?: string, appearance: "dark" | "light" = "dark") {
  const fg = Object.fromEntries(Object.entries(values).filter(([k]) => !BG.has(k)));
  const bg = Object.fromEntries(Object.entries(values).filter(([k]) => BG.has(k)));
  return new Theme(fg as ConstructorParameters<typeof Theme>[0], bg as ConstructorParameters<typeof Theme>[1], mode, { name, appearance });
}

/** ctx.ui.theme is a LIVE proxy, not a snapshot: never save it for restoration. */
export class ThemeLease {
  private previous?: Theme;
  private applied?: Theme;
  private reloadReset = false;
  private look: "biolume" | "composer" = "biolume";
  expectReloadReset() { this.reloadReset = Boolean(this.applied); }
  get awaitingReload() { return this.reloadReset; }
  settleReload(ctx: ExtensionContext) {
    // pi 0.99.1 reapplies settings AFTER emitting session_start(reason=reload).
    // Repair that one known reset, not arbitrary later choices in /settings.
    if (!this.reloadReset || !this.applied || ctx.ui.theme.colors === this.applied.colors) return;
    this.reloadReset = false;
    this.applied = undefined;
    this.apply(ctx, this.look); // Capture the actual post-reload palette for restoration.
  }
  apply(ctx: ExtensionContext, look: "biolume" | "composer" = "biolume") {
    if (this.applied && look !== this.look) this.restore(ctx);
    this.look = look;
    if (this.applied) return; // A manual theme choice is never fought by the render clock.
    const current = ctx.ui.theme;
    const named = current.name ? ctx.ui.getTheme(current.name) : undefined;
    const identical = named && Object.keys(THEME_COLORS).every((k) => colorToHex(named.colors[k as ThemeToken]) === colorToHex(current.colors[k as ThemeToken]));
    this.previous = identical ? named : fromColors(Object.fromEntries(Object.entries(current.colors).map(([k, v]) => [k, colorToHex(v)])), current.getColorMode(), current.name, current.appearance);
    const next = look === "composer"
      ? fromColors(composerThemeColors(current.appearance === "light"), current.getColorMode(), "pi-home-composer", current.appearance)
      : fromColors(THEME_COLORS, current.getColorMode(), THEME_NAME);
    const result = ctx.ui.setTheme(next); // Theme object: changes the runtime, NOT settings.json.
    if (result.success) this.applied = next;
    else { this.previous = undefined; ctx.ui.notify(`Home theme: ${result.error}`, "warning"); }
  }
  restore(ctx: ExtensionContext) {
    // Another extension or /settings may have replaced it. Respect that newer choice.
    if (this.previous && this.applied && ctx.ui.theme.colors === this.applied.colors) ctx.ui.setTheme(this.previous);
    this.previous = undefined; this.applied = undefined; this.reloadReset = false;
  }
}

/** Re-establish inherited colors after inner SGR resets (not OSC links/cursor markers).
 * RGB/index payload bytes must never be mistaken for reset codes. */
export function inheritColors(text: string, fg: string, bg: string): string {
  return text.replace(/\x1b\[([0-9;:]*)m/g, (escape, params: string) => {
    const parts = params === "" ? ["0"] : params.split(";");
    let resetFg = false, resetBg = false;
    for (let i = 0; i < parts.length; i++) {
      const code = Number(parts[i].split(":")[0] || 0);
      if (code === 0) { resetFg = true; resetBg = true; }
      else if (code === 39) resetFg = true;
      else if (code === 49) resetBg = true;
      else if (code === 38 || code === 48 || code === 58) {
        if (code === 38) resetFg = false;
        if (code === 48) resetBg = false;
        if (!parts[i].includes(":")) i += parts[i + 1] === "2" ? 4 : parts[i + 1] === "5" ? 2 : 0;
      } else if (code >= 30 && code <= 37 || code >= 90 && code <= 97) resetFg = false;
      else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) resetBg = false;
    }
    return escape + (resetFg ? fg : "") + (resetBg ? bg : "");
  });
}
function paintSurface(theme: Theme, text: string, tone: string, background: string): string {
  const mode = theme.getColorMode();
  const fg = foregroundAnsi(colors[tone] ?? colors.text, mode), bg = backgroundAnsi(colors[background] ?? colors.panel, mode);
  return fg + bg + inheritColors(text, fg, bg) + "\x1b[49m\x1b[39m";
}

export function pineText(theme: Theme, text: string, tone = "text", bold = false): string {
  return theme.style(text, { fg: colors[tone] ?? colors.text, bold });
}
/** Preserve nested ANSI and the native CURSOR_MARKER; never slice a line that already fits. */
export function pineRow(theme: Theme, width: number, text = "", surface = "panel", pad = 2): string {
  if (width < 4) return truncateToWidth(text, Math.max(0, width), "");
  const inner = width - 2;
  pad = Math.min(pad, Math.floor(inner / 2));
  const available = Math.max(0, inner - 2 * pad);
  const safe = visibleWidth(text) > available ? truncateToWidth(text, available, "…") : text;
  const content = " ".repeat(pad) + safe + " ".repeat(Math.max(0, inner - pad - visibleWidth(safe)));
  const edge = theme.style("│", { fg: colors.line, bg: colors.panel });
  return edge + paintSurface(theme, content, "text", surface) + edge;
}
export function pineRule(theme: Theme, width: number, left = "", right = "", kind: "top" | "join" | "bottom" = "join"): string {
  if (width < 4) return truncateToWidth(left, Math.max(0, width), "");
  const inside = width - 2;
  right = truncateToWidth(right, Math.max(0, inside - 4), "");
  left = truncateToWidth(left, Math.max(0, inside - visibleWidth(right) - 2), "…");
  const fill = "─".repeat(Math.max(0, inside - visibleWidth(left) - visibleWidth(right)));
  const ends = kind === "top" ? ["╭", "╮"] : kind === "bottom" ? ["╰", "╯"] : ["├", "┤"];
  return paintSurface(theme, ends[0] + left + fill + right + ends[1], "line", "panel");
}
