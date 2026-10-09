import {
  CustomEditor,
  type ExtensionContext,
  type KeybindingsManager,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER, isKeyRelease, mixColors, parseColor, sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi,
  type Component, type EditorTheme, type TUI, type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { activity, shouldAnimate, type HomeState } from "./state.ts";
import { pineRow, pineRule, pineText } from "./biolume.ts";
import { composerBottomRail, composerFrame, composerThinkingBorder, composerMessageRail, composerPadding, composerSurface } from "./composer-style.ts";

const BOTTOM = "\0pi-home:bottom\0"; // Internal layout sentinel; always replaced before render returns.
const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const STARS = ["·", "✧", "✦", "✧"];
const NERD = { home: "\uf015", folder: "\uf07b", branch: "\ue725", clock: "\uf017" };
const PLAIN = { home: "⌂", folder: "dir", branch: "git", clock: "◷" };

export function cleanLabel(text: string): string {
  // Paths/model names/tool names are data, not terminal instructions.
  return text.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

export function shortPath(cwd: string): string {
  const home = homedir();
  return cleanLabel(cwd === home ? "~" : cwd.startsWith(home + "/") ? "~" + cwd.slice(home.length) : cwd);
}

/** ANSI-aware row layout. The right-hand data wins when space is tight. */
export function splitRow(left: string, right: string, width: number, fill = " "): string {
  if (width <= 0) return "";
  right = truncateToWidth(right, width, "");
  const available = Math.max(0, width - visibleWidth(right) - (right ? 2 : 0));
  left = truncateToWidth(left, available, "…");
  return left + fill.repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right))) + right;
}

class Palette {
  private key?: unknown;
  private look?: string;
  private appearance?: string;
  private steps: ((s: string) => string)[] = [];
  accent = (s: string) => s;
  border = (s: string) => s;
  glow = (s: string) => s;

  update(theme: Theme, look: string): void {
    if (this.key === theme.colors && this.look === look && this.appearance === theme.appearance) return;
    this.key = theme.colors;
    this.look = look;
    this.appearance = theme.appearance;
    const dark = theme.appearance === "dark";
    const accent = look === "studio" || look === "composer" ? theme.colors.accent : parseColor(
      look === "hearth" ? (dark ? "#e5b582" : "#875526") : look === "biolume" ? (dark ? "#c7bde7" : "#675277") : (dark ? "#b5baff" : "#5559a5"),
    );
    const border = look === "biolume" ? parseColor(dark ? "#668969" : "#4c6b50") : mixColors(theme.colors.border, accent, 0.24);
    const glow = mixColors(accent, theme.colors.text, 0.55);
    this.accent = (s) => theme.style(s, { fg: accent });
    this.border = (s) => theme.style(s, { fg: border });
    this.glow = (s) => theme.style(s, { fg: glow });
    this.steps = Array.from({ length: 17 }, (_, i) => {
      const fg = mixColors(border, accent, i / 16);
      return (s: string) => theme.style(s, { fg });
    });
  }

  strength(text: string, amount: number): string {
    return this.steps[Math.round(Math.max(0, Math.min(1, amount)) * 16)](text);
  }
}

export class HomeEditor extends CustomEditor {
  private palette = new Palette();
  private framed = false;
  private verticalPad = 0;
  private baseBottom = 0;
  private hiddenAbove = 0;
  private hiddenBelow = 0;
  private lastRenderWidth = 0;
  private animationNow = 0;

  constructor(tui: TUI, theme: EditorTheme, kb: KeybindingsManager,
    private ctx: () => ExtensionContext,
    private homeState: HomeState,
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
    if (!isKeyRelease(data) && this.homeState.prefs.gaze !== "off" && this.homeState.prefs.motion !== "off") this.homeState.gaze?.typed(Boolean(this.getText()));
  }

  private reportCaret(lines: string[]): string[] {
    let point: { x: number; y: number } | undefined;
    if (this.focused) for (let y = 0; y < lines.length; y++) {
      const at = lines[y].indexOf(CURSOR_MARKER);
      if (at >= 0) { point = { x: visibleWidth(lines[y].slice(0, at)), y }; break; }
    }
    this.homeState.gaze?.setCaret(point, lines.length);
    return lines;
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

  private rail(left: string, right: string, width: number, top: boolean, animate: boolean): string {
    if (!this.homeState.footerPickerOpen && this.homeState.prefs.look === "biolume") return pineRule(this.ctx().ui.theme, width, left, right);
    if (this.homeState.footerPickerOpen || this.homeState.prefs.look === "composer") {
      const theme = this.ctx().ui.theme;
      return top ? composerMessageRail(theme, width, this.homeState, this.now(),
        this.ctx().sessionManager.getSessionName?.() ?? "Untitled session", right)
        : composerBottomRail(theme, width, this.homeState, this.ctx(), "", this.hiddenBelow ? right : "");
    }
    const square = this.homeState.prefs.look === "studio";
    const corners = top ? (square ? ["┌", "┐"] : ["╭", "╮"]) : (square ? ["└", "┘"] : ["╰", "╯"]);
    const inside = width - 2;
    right = truncateToWidth(right, Math.max(0, inside - 4), "");
    left = truncateToWidth(left, Math.max(0, inside - visibleWidth(right) - 2), "…");
    const count = Math.max(0, inside - visibleWidth(left) - visibleWidth(right));
    let fill = this.palette.border("─".repeat(count));
    if (top && animate && this.homeState.clock.active && this.homeState.prefs.look === "orbit" && count > 4) {
      // A short travelling highlight, not a fake progress bar. Never touches input text.
      const railLength = Math.min(count, 24);
      const at = Math.floor(this.animationNow / 110) % (railLength + 8) - 4;
      fill = Array.from({ length: count }, (_, i) => {
        const distance = Math.abs(i - at);
        return distance < 2 ? this.palette.glow("─") : distance < 4 ? this.palette.accent("─") : this.palette.border("─");
      }).join("");
    }
    return this.palette.border(corners[0]) + left + fill + right + this.palette.border(corners[1]);
  }

  override render(width: number): string[] {
    if (width <= 0) return [];
    this.lastRenderWidth = width;
    this.framed = width >= 8;
    if (!this.framed) {
      this.verticalPad = 0;
      super.setPaddingX(0);
      // The native word wrapper needs room for a two-column grapheme plus its cursor.
      return this.reportCaret(super.render(Math.max(3, width)).map((line) => truncateToWidth(line, width, "")));
    }
    const ctx = this.ctx();
    const theme = ctx.ui.theme;
    const { clock } = this.homeState;
    const prefs = this.homeState.footerPickerOpen ? { ...this.homeState.prefs, enabled: true, look: "composer" as const } : this.homeState.prefs;
    this.palette.update(theme, prefs.look);
    const now = this.now();
    const animate = shouldAnimate(this.homeState, now, this.focused);
    if (animate || !this.animationNow) this.animationNow = now;
    const inner = width - 2;
    const spacious = prefs.look !== "studio" && prefs.look !== "composer" && this.tui.terminal.rows >= (prefs.look === "biolume" ? 34 : 24) && width >= 44;
    this.verticalPad = prefs.look === "composer" ? composerPadding(width, this.tui.terminal.rows) : spacious ? 1 : 0;
    // Use the real editor's layout width for wrapping, navigation, completion, and the IME marker.
    super.setPaddingX(Math.min(prefs.look === "studio" ? 1 : 2, Math.max(0, Math.floor((inner - 4) / 2))));
    const lines = super.render(inner);
    this.baseBottom = lines.indexOf(BOTTOM);
    if (this.baseBottom < 0) throw new Error("pi-home: editor border contract changed");

    const busy = clock.active || this.homeState.compacting;
    let strength = busy ? 1 : 0.38;
    if (animate) {
      const age = now - clock.transitionAt;
      if (clock.transitionAt && age < 450) {
        const t = Math.max(0, age / 450);
        const eased = t * t * (3 - 2 * t);
        strength = busy ? 0.38 + 0.62 * eased : 1 - 0.62 * eased;
      } else if (prefs.look === "hearth" || (!busy && prefs.motion === "ambient")) {
        strength = 0.55 + 0.35 * Math.sin(this.animationNow / (busy ? 600 : 1600));
      }
    }
    const glyph = !busy || !animate ? "●" : prefs.look === "studio" ? BRAILLE[Math.floor(this.animationNow / 100) % BRAILLE.length]
      : prefs.look === "orbit" ? STARS[Math.floor(this.animationNow / 180) % STARS.length] : "●";
    const status = cleanLabel(activity(this.homeState));
    const bashMode = this.getText().startsWith("!");
    const label = bashMode ? theme.fg("bashMode", " ! shell ")
      : prefs.look === "biolume" ? "" : prefs.look === "composer" ? theme.fg("muted", " DRAFT ")
      : this.palette.strength(` ${glyph} `, strength) + this.palette.accent("pi") + theme.fg("muted", ` · ${status} `);
    const topRight = this.hiddenAbove ? theme.fg("muted", ` ↑ ${this.hiddenAbove} more `)
      : prefs.look === "biolume" || prefs.look === "composer" ? "" : theme.fg("dim", ` ${prefs.look} `);
    const usage = ctx.getContextUsage();
    const percent = usage?.percent;
    const context = percent == null ? (prefs.look === "biolume" ? "" : "ctx ?") : `ctx ${Math.round(percent)}%`;
    const contextTone = percent != null && percent >= 90 ? "error" : percent != null && percent >= 75 ? "warning" : "muted";
    const model = cleanLabel(ctx.model?.id ?? "no model");
    const inset = prefs.look === "biolume" ? "  " : " ";
    const bottomLeft = this.homeState.footerManaged ? "" : theme.fg("muted", `${inset}${model} · ${this.thinking()} `);
    const bottomRight = this.hiddenBelow ? theme.fg("muted", ` ↓ ${this.hiddenBelow} more${inset}`)
      : this.homeState.footerManaged ? "" : theme.fg(contextTone, ` ${context}${inset}`);
    const edge = prefs.look === "composer" ? theme.style("│", { fg: composerThinkingBorder(theme, this.homeState.thinkingLevel?.()) }) : this.palette.border("│");
    const blank = prefs.look === "composer" ? composerSurface(theme, edge + composerSurface(theme, "", inner, true) + edge, width)
      : prefs.look === "biolume" ? pineRow(theme, width, "", "input", 0) : edge + " ".repeat(inner) + edge;
    const result = [this.rail(label, topRight, width, true, animate)];
    if (this.verticalPad) result.push(blank);
    for (let i = 1; i < this.baseBottom; i++) {
      const line = lines[i];
      // Do not slice native content unless it actually overflows: slicing can remove the IME marker.
      const safe = visibleWidth(line) > inner ? sliceByColumn(line, 0, inner, true) : line;
      result.push(prefs.look === "composer" ? composerSurface(theme,
        edge + composerSurface(theme, safe, inner, true) + edge, width)
        : prefs.look === "biolume" ? pineRow(theme, width, safe, "input", 0)
        : edge + safe + " ".repeat(Math.max(0, inner - visibleWidth(safe))) + edge);
    }
    if (this.verticalPad) result.push(blank);
    result.push(this.rail(bottomLeft, bottomRight, width, false, false));
    // Preserve native completion row coordinates. Biolume's shared frame continues through the menu.
    for (const line of lines.slice(this.baseBottom + 1)) result.push(prefs.look === "composer" ? composerSurface(theme, " " + line + " ", width, true)
      : prefs.look === "biolume" ? pineRow(theme, width, line, "input", 0) : " " + line + " ");
    return this.reportCaret(prefs.look === "composer" ? composerFrame(theme, result, width, this.homeState, now, this.baseBottom + 2 * this.verticalPad) : result);
  }

  override handleMouse(event: TuiMouseEvent) {
    if (event.type === "click" && event.button === "left") this.homeState.gaze?.typed(Boolean(this.getText()));
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

export function createFooter(tui: TUI, ctx: () => ExtensionContext, state: HomeState,
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
      if (state.prefs.look === "biolume" && width >= 8) {
        const inner = Math.max(1, width - 6);
        const time = state.clock.timing ? state.clock.label(now()) : "";
        const rows = inner < visibleWidth(time) + 16
          ? wrapTextWithAnsi(pineText(theme, time || path, "muted"), inner).map((line) => pineRow(theme, width, line))
          : [pineRow(theme, width, splitRow(pineText(theme, path, "faint"), pineText(theme, time, "muted"), inner))];
        const statuses = [...data.getExtensionStatuses().values()].map(cleanLabel);
        for (const line of wrapTextWithAnsi(statuses.join("  "), inner)) {
          if (line) rows.push(pineRow(theme, width, pineText(theme, line, "faint")));
        }
        rows.push(pineRule(theme, width, "", "", "bottom"));
        state.gaze?.setFooterRows(rows.length);
        return rows;
      }
      const right = theme.fg("muted", timing);
      // Timings never lose their idle suffix to a long path. On narrow panes they get their own row(s).
      const lines = width < visibleWidth(timing) + 18
        ? wrapTextWithAnsi(right, width)
        : [splitRow(theme.fg("dim", path), right, width)];
      const statuses = [...data.getExtensionStatuses().values()];
      if (statuses.length) lines.push(...wrapTextWithAnsi(statuses.join("  ").replace(/[\r\n]/g, " "), width));
      return lines;
    },
  };
}

/** Session identity belongs in the persistent dock, not only in the scroll-away startup header. */
export function createIdentity(ctx: () => ExtensionContext, state: HomeState): Component {
  const palette = new Palette();
  return {
    invalidate() {},
    render(width) {
      if (width <= 0) return [];
      const context = ctx();
      const theme = context.ui.theme;
      palette.update(theme, state.prefs.look);
      const name = cleanLabel(context.sessionManager.getSessionName()?.trim() || "Untitled session");
      const icon = state.prefs.icons === "nerd" ? "\uf075" : "◆";
      return [truncateToWidth(` ${palette.accent(icon)} ${theme.bold(name)}`, width, "…")];
    },
  };
}

export function createHeader(ctx: () => ExtensionContext, state: HomeState): Component {
  const palette = new Palette();
  return {
    invalidate() {},
    render(width) {
      if (width <= 0) return [];
      const theme = ctx().ui.theme;
      palette.update(theme, state.prefs.look);
      const icon = (state.prefs.icons === "nerd" ? NERD : PLAIN).home;
      const tagline = { hearth: "make yourself at home", studio: "a little room to think", orbit: "follow your curiosity", biolume: "a clearing for your thoughts", composer: "a calmer workspace" }[state.prefs.look];
      return [truncateToWidth(` ${palette.accent(icon + " pi / " + state.prefs.look)}  ${theme.fg("muted", tagline)}`, width), ""];
    },
  };
}
