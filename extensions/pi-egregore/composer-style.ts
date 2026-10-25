import type { Theme } from "@earendil-works/pi-coding-agent";
import { frameRail } from "../../lib/frame.ts";
import { foregroundAnsi, mixColors, parseColor, truncateToWidth, visibleWidth, type Color } from "@earendil-works/pi-tui";
import { inheritColors } from "./composer-theme.ts";
import { makeComposerPalette } from "./composer-palette.ts";
import { colorToHex } from "@earendil-works/pi-tui";
import { formatDuration, type WorkspaceState } from "./state.ts";
import { clean, homePath } from "./footer-state.ts";
import { calendarDay, sentTime, styledSentLabel } from "./sent-metadata.ts";
import { COMPOSER_ICONS } from "./composer-icons.ts";
import { appearanceBorder, appearanceRow, currentAppearanceState } from "./appearance-render.ts";
import { emberStatus, statusWithTools } from "./composer-ember.ts";
import { sessionBadge } from "./composer-title.ts";

/** Padding yields in short/narrow panes; no animation changes geometry. */
export function composerPadding(width: number, rows: number, density: "spaced" | "compact" = "spaced"): number { return density === "spaced" && width >= 44 && rows >= 34 ? 1 : 0; }
/** Composer, assistant transcript, and Tasks use the same active Pi accent. */
export function composerBorder(theme: Theme): Color { return theme.colors.accent; }
export function composerThinkingBorder(theme: Theme, _level?: string, workspace?: WorkspaceState): Color {
  return workspace ? appearanceBorder(theme, workspace) : composerBorder(theme);
}
/** User-send metadata uses the same red/pink identity as the user message frame. */
export function userFrameColor(theme: Theme): Color {
  return parseColor(theme.appearance === "light" ? "#a84760" : "#f0a3b1");
}
export function composerInset(width: number): number { return width >= 8 ? 2 : 0; }
/** Related metadata stays readable while borrowing the frame's hue. */
export function quietFrameLabel(theme: Theme, text: string, border: Color): string {
  return theme.style(text, { fg: mixColors(border, theme.colors.muted, .55) });
}

/** A bright traveling head with a soft trail, not icons or a filling progress track.
 * Motion follows real run state; errors of individual tools do not latch the frame. */
export function composerMessageRail(theme: Theme, width: number, workspace: WorkspaceState, now: number, title: string, hint = ""): string {
  if (workspace.layout?.appearance) return composerSurface(theme, appearanceRow(theme, width, workspace, "top", now, hint), width);
  const busy = workspace.clock.active || workspace.compacting;
  const border = appearanceBorder(theme, workspace);
  const status = workspace.railStatus?.() ?? { text: busy ? "Working" : "What’s next?", tone: busy ? "toolTitle" : "muted" };
  const runningTime = busy && workspace.promptDepth === 0 && workspace.clock.active && workspace.clock.timing
    ? ` ${formatDuration(workspace.railRunElapsed?.(now) ?? now - workspace.clock.timing.startedAt)}` : "";
  const label = statusWithTools(`${clean(status.text)}${runningTime}`, workspace);
  const left = workspace.chronomancerDay ? "" : ` ${emberStatus(theme, label, currentAppearanceState(workspace), workspace, now,
    Math.max(0, Math.min(visibleWidth(label) + 6, width < 42 ? width - 4 : Math.floor(width * .55))), theme.colors[status.tone], true, width >= 60)} `;
  const next = !busy && workspace.layout?.railHint !== "off" ? clean(workspace.nextHint?.() ?? "") : "";
  const sentAt = workspace.lastUserSentAt?.();
  const sent = sentTime(sentAt, workspace.layout, now, !!workspace.chronomancerDay && workspace.chronomancerDay !== calendarDay(now));
  // The native scroll indicator wins. A real user-send time takes priority over
  // the optional task hint; the hint can return before the first recorded send.
  const right = hint ? quietFrameLabel(theme, ` ${hint} `, border)
    : width >= 42 && sent ? styledSentLabel(theme, sent, userFrameColor(theme), "user", workspace.layout?.icons)
    : width >= 66 && next ? quietFrameLabel(theme, ` Next: ${next} `, border) : "";
  // Center stays cell-centered. Reserve the status and a modest right slot first;
  // frameRail can shorten a long time before hiding the session identity.
  const side = Math.max(visibleWidth(left), hint ? visibleWidth(right) : Math.min(visibleWidth(right), 17));
  const titleWidth = Math.max(0, width - 2 - 2 * (side + 1));
  const center = workspace.layout?.railTitle === "off" || width < 40 || titleWidth < 5 ? ""
    : sessionBadge(theme, truncateToWidth(` ${clean(title?.trim() || "Untitled session")} `, titleWidth, "…"), border);
  return composerRail(theme, width, left, right, true, border, center);
}

/** Motion belongs to the status marker, never the native input or the full perimeter. */
export function composerFrame(_theme: Theme, rows: string[], _width: number, _workspace: WorkspaceState, _now: number, _bottom = rows.length - 1): string[] {
  return rows;
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

export function composerBottomRail(theme: Theme, width: number, workspace: WorkspaceState,
  context: { cwd?: string; model?: { name?: string; id?: string } }, mode = "", nativeHint = ""): string {
  workspace.appearanceMode = mode;
  if (workspace.layout?.appearance) return composerSurface(theme, appearanceRow(theme, width, workspace, "bottom", Date.now(), nativeHint), width);
  const border = appearanceBorder(theme, workspace);
  // Only a viewport TUI dispatches pointer clicks, and the widest state must
  // survive a centered Vim label; narrower or clickless terminals use /dictate.
  const dictation = (workspace.mouseReporting?.() ?? true) && width >= 40 ? workspace.dictation : undefined;
  const icons = workspace.layout?.icons === "plain" ? "plain" : "nerd";
  const mic = dictation?.label(icons) ?? "";
  const phase = dictation?.phase();
  const micText = mic ? theme.style(mic, {
    fg: phase === "recording" ? theme.colors.warning : phase === "unavailable" ? theme.colors.error : border,
    bold: phase === "recording",
  }) : "";
  const meta = workspace.layout?.railDetails !== "off";
  const left = meta && workspace.layout?.directory !== "off"
    ? quietFrameLabel(theme, ` ${icons === "plain" ? "" : `${COMPOSER_ICONS.directory} `}${homePath(context.cwd || "")} `, border) : "";
  const model = meta && workspace.layout?.model !== "off" ? clean(context.model?.name || context.model?.id || "no model") : "";
  const thinking = workspace.layout?.thinking !== "off" ? clean(workspace.thinkingLevel?.() ?? "") : "";
  // Reserve the right half around a centered Vim label. Shorten the model first
  // so the level is not silently clipped when a provider has a long model name.
  const level = thinking;
  const available = Math.max(0, Math.floor(width / 2) - Math.ceil(visibleWidth(mode ? ` ${clean(mode)} ` : "") / 2) - 2 - visibleWidth(micText));
  const modelName = model ? truncateToWidth(model, Math.max(0, available - visibleWidth(level) - (level ? 5 : 2)), "…") : "";
  const detail = [modelName, level].filter(Boolean).join(" · ");
  // The mic leads the right slot, so tail truncation can never hide the control.
  const right = micText + (nativeHint || (detail ? modelName
    ? theme.style(` ${modelName} `, { fg: border }) + (level ? quietFrameLabel(theme, `· ${level} `, border) : "")
    : quietFrameLabel(theme, ` ${level} `, border) : ""));
  const center = mode ? theme.style(` ${clean(mode)} `, { fg: border, bold: true }) : "";
  return composerRail(theme, width, left, right, false, border, center);
}

export function composerRail(theme: Theme, width: number, left = "", right = "", top = true, color: Color = composerBorder(theme), center = ""): string {
  return frameRail({ theme, width, left, center, right, side: top ? "top" : "bottom", color,
    surface: (text, cells) => composerSurface(theme, text, cells) });
}
