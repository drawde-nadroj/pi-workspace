import type { Theme } from "@earendil-works/pi-coding-agent";
import { frameRail, paintFramePerimeter } from "../../lib/frame.ts";
import { foregroundAnsi, mixColors, parseColor, truncateToWidth, visibleWidth, type Color } from "@earendil-works/pi-tui";
import { inheritColors } from "./composer-theme.ts";
import { makeComposerPalette } from "./composer-palette.ts";
import { colorToHex } from "@earendil-works/pi-tui";
import { formatDuration, shouldAnimate, type HomeState } from "./state.ts";
import { clean, homePath, stamp } from "./footer-state.ts";
import { appearanceBorder, appearanceRow } from "./appearance-render.ts";

/** Padding yields in short/narrow panes; no animation changes geometry. */
export function composerPadding(width: number, rows: number): number { return width >= 44 && rows >= 34 ? 1 : 0; }
/** Composer, assistant transcript, and Tasks use the same active Pi accent. */
export function composerBorder(theme: Theme): Color { return theme.colors.accent; }
export function composerThinkingBorder(theme: Theme, _level?: string): Color { return composerBorder(theme); }
/** User-send metadata uses the same red/pink identity as the user message frame. */
export function userFrameColor(theme: Theme): Color {
  return parseColor(theme.appearance === "light" ? "#a84760" : "#f0a3b1");
}
const glints = new Map<string, Color[]>();
function glintColors(theme: Theme, base: Color): Color[] {
  const key = `${colorToHex(base)}:${colorToHex(theme.colors.text)}`;
  let ramp = glints.get(key);
  if (!ramp) {
    ramp = Array.from({ length: 32 }, (_, i) => mixColors(base, theme.colors.text, i / 31 * .35));
    if (glints.size >= 8) glints.clear();
    glints.set(key, ramp);
  }
  return ramp;
}

export function composerInset(width: number): number { return width >= 8 ? 2 : 0; }
/** Related metadata stays readable while borrowing the frame's hue. */
export function quietFrameLabel(theme: Theme, text: string, border: Color): string {
  return theme.style(text, { fg: mixColors(border, theme.colors.muted, .55) });
}

/** A bright traveling head with a soft trail, not icons or a filling progress track.
 * Motion follows real run state; errors of individual tools do not latch the frame. */
export function composerMessageRail(theme: Theme, width: number, home: HomeState, now: number, title: string, hint = ""): string {
  if (home.layout?.appearance) return composerSurface(theme, appearanceRow(theme, width, home, "top", now, hint), width);
  const busy = home.clock.active || home.compacting;
  const age = Math.max(0, now - home.clock.transitionAt);
  const arriving = !busy && home.clock.timing?.outcome === "done" && home.clock.transitionAt > 0 && age < 800;
  const resting = composerBorder(theme);
  const border = arriving && shouldAnimate(home, now, home.editorFocused?.() ?? true)
    ? mixColors(mixColors(resting, theme.colors.text, .25), resting, 1 - Math.pow(1 - Math.min(1, age / 800), 3)) : resting;
  const status = home.railStatus?.() ?? { text: busy ? "Working" : "What’s next?", tone: busy ? "toolTitle" : "muted" };
  const runningTime = busy && home.promptDepth === 0 && home.clock.active && home.clock.timing
    ? ` ${formatDuration(home.railRunElapsed?.(now) ?? now - home.clock.timing.startedAt)}` : "";
  const left = theme.style(` ${clean(status.text)}${runningTime} `, { fg: theme.colors[status.tone], bold: busy });
  const next = !busy && home.layout?.railHint !== "off" ? clean(home.nextHint?.() ?? "") : "";
  const sentAt = home.lastUserSentAt?.();
  const sent = Number.isFinite(sentAt) && sentAt! >= 0
    ? stamp(sentAt, home.layout?.timestamps === "12h" ? "12h" : "24h", now) : "";
  // The native scroll indicator wins. A real user-send time takes priority over
  // the optional task hint; the hint can return before the first recorded send.
  const right = hint ? quietFrameLabel(theme, ` ${hint} `, border)
    : width >= 42 && sent ? theme.style(` Sent ${sent} `, { fg: userFrameColor(theme) })
    : width >= 66 && next ? quietFrameLabel(theme, ` Next: ${next} `, border) : "";
  // Center stays cell-centered. Reserve the status and a modest right slot first;
  // frameRail can shorten a long time before hiding the session identity.
  const side = Math.max(visibleWidth(left), hint ? visibleWidth(right) : Math.min(visibleWidth(right), 17));
  const titleWidth = Math.max(0, width - 2 - 2 * (side + 1));
  const center = home.layout?.railTitle === "off" || width < 40 || titleWidth < 5 ? ""
    : theme.style(truncateToWidth(` ${clean(title?.trim() || "Untitled session")} `, titleWidth, "…"), { fg: border, bold: true });
  return composerRail(theme, width, left, right, true, border, center);
}

/** Paint only the frame perimeter; never touch input text, IME markers or menus.
 * Clockwise distance includes the sides and bottom, rather than restarting on each rail.
 */
export function composerFrame(theme: Theme, rows: string[], width: number, home: HomeState, now: number, bottom = rows.length - 1): string[] {
  if (width < 8 || bottom < 1) return rows;
  const busy = home.clock.active || home.compacting;
  const age = Math.max(0, now - home.clock.transitionAt);
  const animated = shouldAnimate(home, now, home.editorFocused?.() ?? true);
  const arriving = !busy && home.clock.timing?.outcome === "done" && home.clock.transitionAt > 0 && age < 800;
  const base = appearanceBorder(theme, home);
  if (animated && busy) return paintFramePerimeter(rows, { theme, width, bottom, color: base, accent: mixColors(base, theme.colors.text, .35),
    active: true, now, startAt: home.clock.transitionAt, quiet: now - home.lastInputAt < 1200,
    surface: (text, cells) => composerSurface(theme, text, cells) });
  const perimeter = 2 * (width - 1 + bottom), head = (age % 3000) / 3000 * perimeter;
  const ramp = glintColors(theme, base), quiet = now - home.lastInputAt < 1200;
  const paint = (glyph: string, x: number, y: number) => {
    let color = base, bold = false;
    if (animated && busy) {
      const position = y === 0 ? x : x === width - 1 ? width - 1 + y : y === bottom ? 2 * (width - 1) + bottom - x : perimeter - y;
      const behind = (head - position + perimeter) % perimeter;
      const ahead = (position - head + perimeter) % perimeter;
      const brightness = Math.max(Math.exp(-behind / 12), Math.exp(-ahead * ahead / 5)) * (quiet ? 0.4 : 1);
      color = ramp[Math.round(brightness * 31)]; bold = !quiet && brightness > 0.7;
    } else if (animated && arriving) color = mixColors(mixColors(base, theme.colors.text, .25), base, 1 - Math.pow(1 - age / 800, 3));
    return theme.style(glyph, { fg: color, bold });
  };
  return rows.map((row, y) => {
    if (y > bottom) return row;
    if (y === 0 || y === bottom) {
      return composerSurface(theme, row.replace(/[╭╮╰╯─]/g, (glyph, offset: number) => paint(glyph, visibleWidth(row.slice(0, offset)), y)), width);
    }
    const first = row.indexOf("│"), last = row.lastIndexOf("│");
    if (first < 0 || last <= first) return row;
    return composerSurface(theme, row.slice(0, first) + paint("│", 0, y) + row.slice(first + 1, last) + paint("│", width - 1, y) + row.slice(last + 1), width);
  });
}

/** Public theme roles are also the contract used by pi-ask's standalone shell. */
export function composerThemeColors(light: boolean): Record<string, string> {
  const p = makeComposerPalette(light), hex = (key: string) => colorToHex(p[key]);
  return {
    accent: hex("accent"), border: hex("line"), borderAccent: hex("secondary"), borderMuted: hex("line"),
    text: hex("text"), muted: hex("muted"), dim: hex("muted"), success: hex("success"), warning: hex("warning"), error: hex("error"),
    selectedBg: "", scrollbarTrack: hex("panel"), scrollbarThumb: hex("muted"),
    searchMatchBg: hex("input"), searchMatchText: hex("text"), thinkingText: hex("muted"),
    userMessageBg: "", userMessageText: hex("text"), customMessageBg: "", customMessageText: hex("text"), customMessageLabel: hex("accent"),
    toolPendingBg: "", toolSuccessBg: "", toolErrorBg: "", toolTitle: hex("secondary"), toolOutput: hex("muted"),
    mdHeading: hex("accent"), mdLink: hex("secondary"), mdLinkUrl: hex("muted"), mdCode: hex("warning"), mdCodeBlock: hex("text"),
    mdCodeBlockBorder: hex("line"), mdQuote: hex("muted"), mdQuoteBorder: hex("line"), mdHr: hex("line"), mdListBullet: hex("secondary"),
    toolDiffAdded: hex("success"), toolDiffRemoved: hex("error"), toolDiffContext: hex("muted"),
    syntaxComment: hex("muted"), syntaxKeyword: hex("accent"), syntaxFunction: hex("warning"), syntaxVariable: hex("text"),
    syntaxString: hex("secondary"), syntaxNumber: hex("accent"), syntaxType: hex("secondary"), syntaxOperator: hex("muted"), syntaxPunctuation: hex("muted"),
    thinkingOff: hex("muted"), thinkingMinimal: colorToHex(mixColors(p.muted, p.secondary, 0.25)),
    thinkingLow: hex("secondary"), thinkingMedium: colorToHex(mixColors(p.secondary, p.accent, 0.55)),
    thinkingHigh: hex("accent"), thinkingXhigh: colorToHex(mixColors(p.accent, p.warning, 0.45)),
    thinkingMax: hex("warning"), bashMode: hex("secondary"),
  };
}

export function composerSurface(theme: Theme, text: string, width: number, _input = false): string {
  const fg = foregroundAnsi(theme.colors.text, theme.getColorMode());
  // SGR 49 uses the actual terminal background, not a guessed RGB equivalent.
  // Explicit native selection/cursor styling inside text remains intact.
  const bg = "\x1b[49m";
  const safe = visibleWidth(text) <= width ? text : truncateToWidth(text, Math.max(0, width), "");
  return fg + bg + inheritColors(safe, fg, bg) + " ".repeat(Math.max(0, width - visibleWidth(safe))) + "\x1b[49m\x1b[39m";
}

export function composerBottomRail(theme: Theme, width: number, home: HomeState,
  context: { cwd?: string; model?: { name?: string; id?: string } }, mode = "", nativeHint = ""): string {
  home.appearanceMode = mode;
  if (home.layout?.appearance) return composerSurface(theme, appearanceRow(theme, width, home, "bottom", Date.now(), nativeHint), width);
  const border = composerBorder(theme);
  const meta = home.layout?.railDetails !== "off";
  const left = meta && home.layout?.directory !== "off"
    ? quietFrameLabel(theme, ` ${homePath(context.cwd || "")} `, border) : "";
  const model = meta && home.layout?.model !== "off" ? clean(context.model?.name || context.model?.id || "no model") : "";
  const thinking = home.layout?.thinking !== "off" ? clean(home.thinkingLevel?.() ?? "") : "";
  // Reserve the right half around a centered Vim label. Shorten the model first
  // so the level is not silently clipped when a provider has a long model name.
  const level = thinking;
  const available = Math.max(0, Math.floor(width / 2) - Math.ceil(visibleWidth(mode ? ` ${clean(mode)} ` : "") / 2) - 2);
  const modelName = model ? truncateToWidth(model, Math.max(0, available - visibleWidth(level) - (level ? 5 : 2)), "…") : "";
  const detail = [modelName, level].filter(Boolean).join(" · ");
  const right = nativeHint || (detail ? quietFrameLabel(theme, ` ${detail} `, border) : "");
  const center = mode ? theme.style(` ${clean(mode)} `, { fg: border, bold: true }) : "";
  return composerRail(theme, width, left, right, false, border, center);
}

export function composerRail(theme: Theme, width: number, left = "", right = "", top = true, color: Color = composerBorder(theme), center = ""): string {
  return frameRail({ theme, width, left, center, right, side: top ? "top" : "bottom", color,
    surface: (text, cells) => composerSurface(theme, text, cells) });
}

const ramps = new Map<string, Color[]>();
export function composerGlow(theme: Theme, now: number, quiet = false, base: Color = composerBorder(theme)): Color {
  const key = `${colorToHex(base)}:${colorToHex(theme.colors.text)}`;
  let colors = ramps.get(key);
  if (!colors) {
    colors = Array.from({ length: 24 }, (_, i) => mixColors(base, theme.colors.text, 0.15 + 0.2 * i / 23));
    if (ramps.size > 8) ramps.clear();
    ramps.set(key, colors);
  }
  const wave = (Math.sin(now / 700) + 1) / 2;
  return colors[Math.round(quiet ? 12 + wave * 6 : wave * 23)];
}
