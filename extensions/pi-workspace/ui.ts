import {
  CustomEditor, type ExtensionContext, type KeybindingsManager, type ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import {
  sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi,
  type Component, type EditorTheme, type TUI, type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import type { WorkspaceState } from "./state.ts";
import { composerBottomRail, composerFrame, composerThinkingBorder, composerMessageRail, composerPadding, composerSurface } from "./composer-style.ts";

const BOTTOM = "\0pi-workspace:bottom\0"; // Internal layout sentinel; replaced before render returns.
const NERD = { home: "\uf015", folder: "\uf07b", branch: "\ue725", clock: "\uf017" };
const PLAIN = { home: "⌂", folder: "dir", branch: "git", clock: "◷" };

export function cleanLabel(text: string): string {
  return text.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

export function shortPath(cwd: string): string {
  const home = homedir();
  return cleanLabel(cwd === home ? "~" : cwd.startsWith(home + "/") ? "~" + cwd.slice(home.length) : cwd);
}

/** ANSI-aware row layout. Right-hand metadata wins when space is tight. */
export function splitRow(left: string, right: string, width: number, fill = " "): string {
  if (width <= 0) return "";
  right = truncateToWidth(right, width, "");
  const available = Math.max(0, width - visibleWidth(right) - (right ? 2 : 0));
  left = truncateToWidth(left, available, "…");
  return left + fill.repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right))) + right;
}

/** Fallback only when Pi has no native editor component to decorate. */
export class ComposerEditor extends CustomEditor {
  private framed = false;
  private verticalPad = 0;
  private baseBottom = 0;
  private hiddenAbove = 0;
  private hiddenBelow = 0;
  private lastRenderWidth = 0;

  constructor(tui: TUI, theme: EditorTheme, kb: KeybindingsManager,
    private ctx: () => ExtensionContext,
    private homeState: WorkspaceState,
    private thinking: () => string,
    private now: () => number = Date.now,
  ) {
    super(tui, theme, kb, { paddingX: 2, embedWorkingStatus: false });
  }

  override setText(text: string): void {
    if (this.homeState?.promptDepth > 0 && text === this.getText()) return;
    super.setText(text);
  }
  override handleInput(data: string): void {
    this.homeState.lastInputAt = this.now();
    super.handleInput(data);
  }
  protected override renderTopBorder(width: number, hidden: number): string {
    if (!this.framed) return super.renderTopBorder(width, hidden);
    this.hiddenAbove = hidden;
    return "";
  }
  protected override renderBottomBorder(width: number, hidden: number): string {
    if (!this.framed) return super.renderBottomBorder(width, hidden);
    this.hiddenBelow = hidden;
    return BOTTOM;
  }
  private rail(width: number, top: boolean, hint: string): string {
    const theme = this.ctx().ui.theme;
    return top ? composerMessageRail(theme, width, this.homeState, this.now(),
      this.ctx().sessionManager.getSessionName?.() ?? "Untitled session", hint)
      : composerBottomRail(theme, width, this.homeState, this.ctx(), "", this.hiddenBelow ? hint : "");
  }
  override render(width: number): string[] {
    if (width <= 0) return [];
    this.lastRenderWidth = width;
    this.framed = width >= 8;
    if (!this.framed) {
      this.verticalPad = 0;
      super.setPaddingX(0);
      return super.render(Math.max(3, width)).map((line) => truncateToWidth(line, width, ""));
    }
    const theme = this.ctx().ui.theme, now = this.now();
    const inner = width - 2;
    this.verticalPad = composerPadding(width, this.tui.terminal.rows, this.homeState.layout?.density);
    // Preserve native wrapping, navigation, completion, cursor and IME marker.
    super.setPaddingX(Math.min(2, Math.max(0, Math.floor((inner - 4) / 2))));
    const lines = super.render(inner);
    this.baseBottom = lines.indexOf(BOTTOM);
    if (this.baseBottom < 0) throw new Error("pi-workspace: editor border contract changed");
    const topRight = this.hiddenAbove ? theme.fg("muted", ` ↑ ${this.hiddenAbove} more `) : "";
    const bottomRight = this.hiddenBelow ? theme.fg("muted", ` ↓ ${this.hiddenBelow} more `) : "";
    const edge = theme.style("│", { fg: composerThinkingBorder(theme, this.homeState.thinkingLevel?.()) });
    const blank = composerSurface(theme, edge + composerSurface(theme, "", inner, true) + edge, width);
    const result = [this.rail(width, true, topRight)];
    if (this.verticalPad) result.push(blank);
    for (let i = 1; i < this.baseBottom; i++) {
      const line = lines[i];
      const safe = visibleWidth(line) > inner ? sliceByColumn(line, 0, inner, true) : line;
      result.push(composerSurface(theme, edge + composerSurface(theme, safe, inner, true) + edge, width));
    }
    if (this.verticalPad) result.push(blank);
    result.push(this.rail(width, false, bottomRight));
    for (const line of lines.slice(this.baseBottom + 1)) result.push(composerSurface(theme, " " + line + " ", width, true));
    return composerFrame(theme, result, width, this.homeState, now, this.baseBottom + 2 * this.verticalPad);
  }
  override handleMouse(event: TuiMouseEvent) {
    if (!this.framed || this.lastRenderWidth < 8) return super.handleMouse(event);
    const bottom = this.baseBottom + 2 * this.verticalPad;
    const paddingRow = this.verticalPad && (event.y === 1 || event.y === bottom - 1);
    if (paddingRow && event.type === "click") return { handled: true, focus: true };
    return super.handleMouse({
      ...event,
      x: Math.max(0, event.x - 1),
      y: event.y > bottom ? event.y - 2 * this.verticalPad : event.y - this.verticalPad,
      width: Math.max(1, event.width - 2),
      height: Math.max(1, event.height - 2 * this.verticalPad),
    });
  }
}

export function createFooter(tui: TUI, ctx: () => ExtensionContext, state: WorkspaceState,
  data: ReadonlyFooterDataProvider, now: () => number = Date.now): Component & { dispose(): void } {
  const unsubscribe = data.onBranchChange(() => tui.requestRender());
  return {
    dispose: unsubscribe,
    invalidate() {},
    render(width) {
      if (width <= 0) return [];
      const theme = ctx().ui.theme;
      const icons = state.prefs.icons === "nerd" ? NERD : PLAIN;
      const branch = data.getGitBranch();
      const path = `${icons.folder} ${shortPath(ctx().cwd)}${branch ? `  ${icons.branch} ${cleanLabel(branch)}` : ""}`;
      const timing = `${icons.clock} ${state.clock.label(now())}`;
      const right = theme.fg("muted", timing);
      const lines = width < visibleWidth(timing) + 18
        ? wrapTextWithAnsi(right, width)
        : [splitRow(theme.fg("dim", path), right, width)];
      const statuses = [...data.getExtensionStatuses().values()];
      if (statuses.length) lines.push(...wrapTextWithAnsi(statuses.join("  ").replace(/[\r\n]/g, " "), width));
      return lines;
    },
  };
}

export function createIdentity(ctx: () => ExtensionContext, state: WorkspaceState): Component {
  return {
    invalidate() {},
    render(width) {
      if (width <= 0) return [];
      const context = ctx(), theme = context.ui.theme;
      const name = cleanLabel(context.sessionManager.getSessionName()?.trim() || "Untitled session");
      const icon = state.prefs.icons === "nerd" ? "\uf075" : "◆";
      return [truncateToWidth(` ${theme.style(icon, { fg: theme.colors.accent })} ${theme.bold(name)}`, width, "…")];
    },
  };
}

export function createHeader(ctx: () => ExtensionContext, state: WorkspaceState): Component {
  return {
    invalidate() {},
    render(width) {
      if (width <= 0) return [];
      const theme = ctx().ui.theme;
      const icon = (state.prefs.icons === "nerd" ? NERD : PLAIN).home;
      return [truncateToWidth(` ${theme.style(icon + " pi / composer", { fg: theme.colors.accent })}  ${theme.fg("muted", "a calmer workspace")}`, width), ""];
    },
  };
}
