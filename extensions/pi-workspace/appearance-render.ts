import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, parseColor, sliceByColumn, truncateToWidth, visibleWidth, type Color } from "@earendil-works/pi-tui";
import { frameRail } from "../../lib/frame.ts";
import { basename } from "node:path";
import { ELEMENTS, STATE_TEXT, type ElementId, type Position, type AppearanceState, type AppearanceColor, type AppearanceHit } from "./appearance.ts";
import { clean, duration, gitLabel, homePath, FOOTER_DEFAULTS } from "./footer-state.ts";
import { calendarDay, sentTime } from "./sent-metadata.ts";
import { contextText, decorateFooterPart } from "./footer-view.ts";
import { COMPOSER_ICONS } from "./composer-icons.ts";
import type { WorkspaceState } from "./state.ts";
import { selectionHighlight } from "./footer-selection.ts";

export function currentAppearanceState(workspace: WorkspaceState): AppearanceState {
  if (workspace.footerPickerOpen && workspace.appearancePreview?.state) return workspace.appearancePreview.state;
  return workspace.railStatus?.().state ?? (workspace.compacting ? "compacting" : workspace.clock.active ? (workspace.blockingPromptDepth ?? workspace.promptDepth) && !workspace.footerPickerOpen ? "waiting" : workspace.tools.size ? "tools" : workspace.phase
    : workspace.clock.interrupted ? "interrupted" : workspace.clock.timing?.outcome === "error" ? "error" : workspace.clock.timing?.outcome === "stopped" ? "stopped" : workspace.clock.timing?.outcome === "done" ? "done" : "idle");
}
export function appearanceColor(theme: Theme, value: AppearanceColor | undefined, frame: Color = theme.colors.accent, automatic = frame): Color {
  if (!value || value === "auto") return automatic;
  if (value === "frame") return frame;
  if (value === "quiet") return mixColors(frame, theme.colors.muted, .45);
  if (value.startsWith("#")) return parseColor(value);
  const palette = theme.appearance === "light"
    ? { red: "#a84760", purple: "#68409b", blue: "#375e86", cyan: "#006879", green: "#406522" }
    : { red: "#f0a3b1", purple: "#c4a7ff", blue: "#8caed2", cyan: "#67d8e8", green: "#a0d080" };
  if (Object.hasOwn(palette, value)) return parseColor(palette[value as keyof typeof palette]);
  return theme.colors[value as "accent" | "text" | "muted" | "warning"] ?? frame;
}
export function appearanceBorder(theme: Theme, workspace: WorkspaceState): Color {
  const design = workspace.layout?.appearance;
  const override = design?.states[currentAppearanceState(workspace)]?.frameColor;
  // Chronomancer borrows the user-message red for the native composer only.
  // Explicit /workspace frame and state colors, and its live preview, win.
  const modeRed = workspace.chronomancerDay && !workspace.footerPickerOpen &&
    (!design?.frameColor || design.frameColor === "accent") && !override;
  const base = appearanceColor(theme, modeRed ? "red" : design?.frameColor);
  return override ? appearanceColor(theme, override, base, base) : base;
}
interface Piece { id: ElementId; text: string; priority: number; color: Color; bold: boolean }
export function appearanceValues(workspace: WorkspaceState, width: number, now: number): Record<ElementId, string> {
  const p = workspace.layout ?? FOOTER_DEFAULTS, data = workspace.appearanceData?.();
  const state = currentAppearanceState(workspace), simulated = workspace.footerPickerOpen && !!workspace.appearancePreview?.state;
  let status = simulated ? STATE_TEXT[state] : workspace.railStatus?.().text ?? STATE_TEXT[state];
  status = p.appearance?.states[state]?.text ?? status;
  if (!simulated && workspace.clock.active && !workspace.promptDepth && state !== "waiting" && p.run !== "off" && p.timing !== "hidden") {
    status += ` ${duration(workspace.railRunElapsed?.(now) ?? workspace.clock.elapsed(now))}`;
  }
  const sent = workspace.lastUserSentAt?.();
  const lastSendTime = sentTime(sent, p, now, !!workspace.chronomancerDay && workspace.chronomancerDay !== calendarDay(now));
  return {
    status: !simulated && workspace.chronomancerDay ? "" : status, session: data?.session || "Untitled session", sentTime: lastSendTime,
    directory: p.directory === "folder" ? basename(data?.cwd ?? "") : homePath(data?.cwd ?? ""),
    vim: workspace.appearanceMode ?? "", model: data?.model ?? "", thinking: workspace.thinkingLevel?.() ?? data?.thinking ?? "",
    context: contextText(p, data?.usage, width), git: data?.git ? gitLabel(data.git, p, width < 75) : data?.gitUnavailable ? "—" : "",
    hint: !workspace.clock.active && !lastSendTime ? clean(workspace.nextHint?.() ?? "") : "",
  };
}
/** Same layout and hit rectangles serve normal rendering and the editing workspace. */
export function appearanceRow(theme: Theme, width: number, workspace: WorkspaceState, row: "top" | "bottom" | "footer1" | "footer2", now: number,
  nativeHint = ""): string {
  const design = workspace.layout?.appearance;
  if (!design || width <= 0) return "";
  const border = appearanceBorder(theme, workspace), framed = row === "top" || row === "bottom";
  const inner = Math.max(0, width - (framed ? 2 : 0));
  const values = appearanceValues(workspace, width, now), state = currentAppearanceState(workspace);
  const data = workspace.appearanceData?.(), stateStyle = design.states[state];
  const positions = ["Left", "Center", "Right"].map(side => `${row}${side}` as Position);
  workspace.appearanceHits = (workspace.appearanceHits ?? []).filter(hit => !positions.includes(hit.position));
  const pieces = (position: Position): Piece[] => (Object.keys(ELEMENTS) as ElementId[])
    .filter(id => design.elements[id].visible && design.elements[id].position === position && values[id])
    .sort((a, b) => design.elements[a].order - design.elements[b].order)
    .map((id, index) => {
      const e = design.elements[id];
      const automatic = id === "status" ? theme.colors[state === "error" ? "error" : ["waiting", "stopped", "interrupted"].includes(state) ? "warning" : state === "done" ? "success" : "accent"]
        : id === "context" && (data?.usage?.percent ?? 0) >= 75 ? theme.colors[(data?.usage?.percent ?? 0) >= 90 ? "error" : "warning"]
        : id === "git" ? theme.colors[data?.git?.conflicts ? "error" : data?.git && data.git.staged + data.git.changed + data.git.untracked ? "warning" : "success"] : border;
      const color = appearanceColor(theme, id === "status" ? stateStyle?.color ?? e.color : e.color, border, automatic);
      const p = workspace.layout!;
      // Existing saved defaults still say "Sent {value}". Hide only that stock
      // word in Nerd mode; leave deliberate custom templates intact.
      const template = id === "sentTime" && p.icons === "nerd" && e.text === "Sent {value}" ? "{value}" : e.text;
      let text = template.replaceAll("{value}", clean(values[id]));
      const icon = p.icons === "nerd" ? (COMPOSER_ICONS as Record<string, string>)[id === "sentTime" ? "sent" : id]
        : !framed ? ({ directory: "dir", git: "git", session: "session", context: "ctx" } as Record<string, string>)[id] : "";
      if (icon && (id === "sentTime" || id === "directory" || !framed)) text = `${icon} ${text}`;
      if (!framed) {
        const tone = id === "git" && data?.git?.conflicts || id === "context" && (data?.usage?.percent ?? 0) >= 90 ? "error"
          : id === "context" && (data?.usage?.percent ?? 0) >= 75 ? "warning" : undefined;
        text = decorateFooterPart(theme, p, { id, text, tone }, index, data?.frame, e.color === "auto" ? undefined : color);
      }
      return { id, text, priority: e.priority === "high" ? 3 : e.priority === "low" ? 1 : 2, color,
        bold: id === "status" ? stateStyle?.bold ?? e.bold : e.bold };
    });
  const groups = positions.map(pieces);
  if (nativeHint) groups[2] = []; // Native scroll hints always win, regardless of user placement.
  const separator = design.separator;
  const natural = (parts: Piece[]) => parts.length ? parts.reduce((n, part) => n + visibleWidth(part.text), 2) + (parts.length - 1) * visibleWidth(separator) : 0;
  const size = groups.map(natural);
  if (nativeHint) size[2] = visibleWidth(nativeHint) + 2;
  const reserve = Math.max(Math.min(size[0], 22), Math.min(size[2], nativeHint ? size[2] : 16));
  const centerBudget = Math.max(0, Math.min(size[1], inner - 2 * (reserve + 1)));
  const c = centerBudget >= 5 ? centerBudget : 0;
  const side = Math.max(0, Math.floor((inner - c) / 2) - (c ? 1 : 0));
  const rightBudget = c ? side : Math.min(size[2], Math.max(0, inner - Math.min(size[0], 18)));
  const budgets = [c ? side : Math.max(0, inner - rightBudget), c, rightBudget];
  const renderGroup = (parts: Piece[], budget: number) => {
    const sizes = parts.map(part => visibleWidth(part.text));
    const overhead = () => 2 + Math.max(0, sizes.filter(Boolean).length - 1) * visibleWidth(separator);
    let total = sizes.reduce((a, b) => a + b, 0) + overhead();
    while (total > budget && sizes.some(Boolean)) {
      const candidates = sizes.map((size, i) => ({ size, i, priority: parts[i].priority })).filter(x => x.size > 0)
        .sort((a, b) => a.priority - b.priority || b.size - a.size);
      sizes[candidates[0].i]--; total = sizes.reduce((a, b) => a + b, 0) + overhead();
    }
    const hits: Array<{ id: ElementId; x: number; width: number }> = [];
    let content = "", x = 1;
    for (let i = 0; i < parts.length; i++) {
      if (!sizes[i]) continue;
      if (content) { content += theme.style(separator, { fg: border }); x += visibleWidth(separator); }
      const part = parts[i], text = truncateToWidth(part.text, sizes[i], "…");
      const selected = workspace.footerPickerOpen && workspace.appearancePreview?.selected === part.id;
      const styled = theme.style(text, { fg: part.color, bold: framed || part.bold });
      content += selected ? selectionHighlight(theme, styled, { underline: true, foreground: part.color, phase: workspace.appearancePreview?.shimmer }) : styled;
      hits.push({ id: part.id, x, width: visibleWidth(text) }); x += visibleWidth(text);
    }
    return { text: content && budget >= 3 ? ` ${content} ` : "", hits };
  };
  const rendered = groups.map((parts, i) => renderGroup(parts, budgets[i]));
  if (nativeHint) rendered[2] = { text: truncateToWidth(` ${nativeHint} `, rightBudget, "…"), hits: [] };
  const [left, center, right] = rendered.map(group => group.text);
  const starts = [0, Math.floor((inner - visibleWidth(center)) / 2), inner - visibleWidth(right)];
  for (let i = 0; i < rendered.length; i++) if (rendered[i].text) {
    workspace.appearanceHits.push(...rendered[i].hits.map(hit => ({ ...hit, x: hit.x + starts[i] + (framed ? 1 : 0), position: positions[i] } as AppearanceHit)));
  }
  if (framed) {
    const rail = frameRail({ theme, width, left, center, right, color: border, side: row });
    if (!workspace.footerPickerOpen || workspace.appearancePreview?.selected !== "frame") return rail;
    // Highlight the border, not unrelated labels whose custom colors may differ.
    let painted = "", x = 0;
    const gaps = (start: number, size: number) => selectionHighlight(theme, sliceByColumn(rail, start, size), { foreground: border, phase: workspace.appearancePreview?.shimmer });
    for (const hit of workspace.appearanceHits.filter(hit => hit.position.startsWith(row)).sort((a, b) => a.x - b.x)) {
      painted += gaps(x, Math.max(0, hit.x - x)) + sliceByColumn(rail, hit.x, hit.width);
      x = hit.x + hit.width;
    }
    return painted + gaps(x, Math.max(0, visibleWidth(rail) - x));
  }
  if (!left && !center && !right) return "";
  let line = "";
  for (const [i, text] of [left, center, right].entries()) if (text) {
    line += " ".repeat(Math.max(0, starts[i] - visibleWidth(line))) + text;
  }
  return truncateToWidth(line, width, "");
}
