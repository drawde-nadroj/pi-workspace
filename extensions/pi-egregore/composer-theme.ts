import { Theme, type ExtensionContext, type ThemeToken } from "@earendil-works/pi-coding-agent";
import { colorToHex } from "@earendil-works/pi-tui";
import { composerThemeColors } from "./composer-style.ts";

const BACKGROUNDS = new Set(["selectedBg", "searchMatchBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]);
function fromColors(values: Record<string, string>, mode: ReturnType<Theme["getColorMode"]>, name?: string, appearance: "dark" | "light" = "dark") {
  const fg = Object.fromEntries(Object.entries(values).filter(([key]) => !BACKGROUNDS.has(key)));
  const bg = Object.fromEntries(Object.entries(values).filter(([key]) => BACKGROUNDS.has(key)));
  return new Theme(fg as ConstructorParameters<typeof Theme>[0], bg as ConstructorParameters<typeof Theme>[1], mode, { name, appearance });
}

/** A reversible Composer palette lease. Never persist a Theme or fight a later manual choice. */
export class ThemeLease {
  private previous?: Theme;
  private applied?: Theme;
  private reloadReset = false;
  expectReloadReset() { this.reloadReset = Boolean(this.applied); }
  get awaitingReload() { return this.reloadReset; }
  settleReload(ctx: ExtensionContext) {
    if (!this.reloadReset || !this.applied || ctx.ui.theme.colors === this.applied.colors) return;
    this.reloadReset = false;
    this.applied = undefined;
    this.apply(ctx);
  }
  apply(ctx: ExtensionContext) {
    if (this.applied) return;
    const current = ctx.ui.theme;
    const named = current.name ? ctx.ui.getTheme(current.name) : undefined;
    const identical = named && Object.keys(current.colors).every((key) =>
      colorToHex(named.colors[key as ThemeToken]) === colorToHex(current.colors[key as ThemeToken]));
    this.previous = identical ? named : fromColors(Object.fromEntries(Object.entries(current.colors).map(([key, value]) => [key, colorToHex(value)])),
      current.getColorMode(), current.name, current.appearance);
    const next = fromColors(composerThemeColors(current.appearance === "light"), current.getColorMode(), "pi-workspace-composer", current.appearance);
    const result = ctx.ui.setTheme(next);
    if (result.success) this.applied = next;
    else { this.previous = undefined; ctx.ui.notify(`Egregore theme: ${result.error}`, "warning"); }
  }
  restore(ctx: ExtensionContext) {
    if (this.previous && this.applied && ctx.ui.theme.colors === this.applied.colors) ctx.ui.setTheme(this.previous);
    this.previous = undefined; this.applied = undefined; this.reloadReset = false;
  }
}

/** Re-establish inherited colors after inner SGR resets, not OSC links or cursor markers. */
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
