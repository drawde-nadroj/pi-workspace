import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripVTControlCharacters } from "node:util";
import { mixColors, parseColor, sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { createFrameController, framePresentationDefaults, readFramePresentation, presentationRows,
  type FramePresentation, type FrameSample, type FrameState } from "../../lib/frame.ts";
import { cleanText, type DockSnapshot } from "../../lib/workspace-dock.ts";
import type { WorkspaceState } from "./state.ts";
import { selectionHighlight } from "./footer-selection.ts";

export interface TaskPanelPrefs { version: 1; rows: number; presentation: FramePresentation }
export type TaskElementId = "frame" | "title" | "summary" | "hint" | "body" | "active";
export interface TaskPreviewHit { id: TaskElementId; x: number; y: number; width: number }
export function taskPanelDefaults(): TaskPanelPrefs {
  // Accent stays reserved for current work; the progress count is muted by default.
  return { version: 1, rows: 3, presentation: { ...framePresentationDefaults(), metadataColor: "muted", motion: "changes", periodMs: 1200 } };
}
export function readTaskPanel(value: unknown): TaskPanelPrefs {
  const out = taskPanelDefaults(), raw = value as Partial<TaskPanelPrefs> | undefined;
  if (raw?.version !== 1) return out;
  // A stored `title` from an older build is ignored: the plan name is the one title authority.
  if (Number.isInteger(raw.rows)) out.rows = Math.max(1, Math.min(5, raw.rows!));
  out.presentation = raw.presentation ? readFramePresentation(raw.presentation) : out.presentation;
  return out;
}
function taskPanelLayout(theme: Theme, width: number, dock: DockSnapshot, prefs: TaskPanelPrefs,
  frame: FrameSample, budget = 7, withHits = false): { rows: string[]; hits: TaskPreviewHit[] } {
  const source = dock.rows;
  const bodyBudget = Math.max(1, budget - 2);
  const capacity = Math.max(1, Math.min(prefs.rows, bodyBudget));
  const hidden = Math.max(0, source.length - capacity) + (dock.more ?? 0);
  const inner = Math.max(1, width - 4);
  const content: Array<{ text: string; role: "text" | "active" | "muted" | "warning" | "error" }> = [];
  const chosen = source.slice(0, capacity);
  for (const [index, row] of chosen.entries()) {
    const role = row.tone === "accent" ? "active" : row.tone === "warning" || row.tone === "error" || row.tone === "muted" ? row.tone : "text";
    const lines = wrapTextWithAnsi(cleanText(row.text), inner);
    const count = index === 0 && bodyBudget > chosen.length ? Math.min(2, lines.length) : 1;
    for (let i = 0; i < count; i++) content.push({ role,
      text: i === count - 1 && lines.length > count ? truncateToWidth(lines[i], Math.max(0, inner - 1), "") + "…" : lines[i] });
  }
  if (!content.length) content.push({ text: dock.overview?.total ? "No open tasks" : "No tasks yet", role: "muted" });
  const title = cleanText(dock.title);
  const summary = cleanText(dock.summary ?? "");
  const hint = hidden > 0 ? `+ ${hidden} more · ${cleanText(dock.hint ?? "/tasks")}` : cleanText(dock.hint ?? "");
  if (width < 16) {
    if (hint && content.length < bodyBudget) content.push({ text: hint, role: "muted" });
    return { rows: content.map(row => truncateToWidth(row.text, width, "…")), hits: [] };
  }
  const changesOnly = prefs.presentation.motion === "changes" && prefs.presentation.states[frame.state]?.motion !== "repeat";
  const rows = presentationRows({ theme, width, rows: content, title, summary, hint, presentation: prefs.presentation,
    frame: changesOnly ? { ...frame, active: false } : frame });
  // A steady active-row surface, with one bounded lift on real task progress.
  // Paint inside the rail only, preserving semantic/custom foregrounds and geometry.
  const lift = changesOnly && frame.active ? Math.sin(Math.PI * frame.progress) * .18 * prefs.presentation.intensity : 0;
  const highlight = prefs.presentation.states[frame.state]?.highlightColor ?? prefs.presentation.highlightColor;
  const flash = highlight === "highlight" ? parseColor(theme.appearance === "light" ? "#29354a" : "#f5f6ff")
    : highlight.startsWith("#") ? parseColor(highlight) : theme.colors[highlight as "accent"];
  content.forEach((row, index) => {
    if (row.role !== "active" && !(lift && index === 0)) return;
    const y = index + 1;
    const base = mixColors(theme.colors.customMessageBg, theme.colors.accent, .10, "srgb");
    const bg = lift ? mixColors(base, flash, lift, "srgb") : base;
    rows[y] = sliceByColumn(rows[y], 0, 1) + selectionHighlight(theme, sliceByColumn(rows[y], 1, width - 2), { background: bg }) + sliceByColumn(rows[y], width - 1, 1);
  });
  if (!withHits) return { rows, hits: [] }; // No hit parsing on the live, possibly animated Tasks widget.
  const hits: TaskPreviewHit[] = [];
  // Hit regions are derived from the *rendered* rail, not assumed positions: a
  // truncated or omitted label is not clickable. This stays in the Workspace adapter;
  // Frame remains an input-agnostic drawing primitive.
  const rails = [0, rows.length - 1];
  for (const [id, value, position] of [
    ["title", title, prefs.presentation.positions.title],
    ["summary", summary, prefs.presentation.positions.summary],
    ["hint", hint, prefs.presentation.positions.hint],
  ] as const) {
    if (!value) continue;
    const y = position.startsWith("top") ? rails[0] : rails[1];
    const line = stripVTControlCharacters(rows[y]);
    const label = ` ${value} `;
    const first = line.indexOf(label);
    // Ambiguous repeated labels are left to the keyboard list instead of
    // assigning a misleading mouse target.
    if (first < 1 || line.indexOf(label, first + 1) !== -1) continue;
    const x = visibleWidth(line.slice(0, first));
    if (x + visibleWidth(label) < width) hits.push({ id, x, y, width: visibleWidth(label) });
  }
  content.forEach((row, index) => {
    const y = index + 1;
    if (y >= rows.length - 1) return;
    const text = stripVTControlCharacters(rows[y]).slice(1, -1).trim();
    if (text && row.text) hits.push({ id: row.role === "active" ? "active" : "body", x: 1, y, width: width - 2 });
  });
  return { rows, hits };
}
export function taskPanelRows(theme: Theme, width: number, dock: DockSnapshot, prefs: TaskPanelPrefs,
  frame: FrameSample, budget = 7): string[] { return taskPanelLayout(theme, width, dock, prefs, frame, budget).rows; }
/** Display-only hit metadata for the settings preview. Never changes Tasks state. */
export function taskPanelPreview(theme: Theme, width: number, dock: DockSnapshot, prefs: TaskPanelPrefs,
  frame: FrameSample, budget = 7): { rows: string[]; hits: TaskPreviewHit[] } {
  return taskPanelLayout(theme, width, dock, prefs, frame, budget, true);
}

/** Thin data adapter. The package owns effects, state rules and motion lifetime; Workspace supplies facts and a shared clock. */
export class TaskPanel {
  private controller = createFrameController();
  private dock?: DockSnapshot;
  private identity?: string;
  private visible = false;
  setVisible(value: boolean) { this.visible = value; if (!value) this.reset(); }
  reset() { this.controller.reset(); this.dock = undefined; this.identity = undefined; }
  private update(workspace: WorkspaceState, now: number, focused: boolean) {
    const dock = this.dock, info = dock?.overview;
    if (!dock || !this.visible) {
      this.controller.reset();
      return { active: false, elapsed: 0, progress: 0, state: "idle" as FrameState, once: false };
    }
    const busy = workspace.clock.active || workspace.compacting;
    const active = info ? !!info.activeId : dock?.rows.some(r => r.tone === "accent");
    const state: FrameState = workspace.promptDepth ? "waiting" : dock?.rows.some(r => r.tone === "error") ? "error"
      : info?.blocked ? "blocked" : busy && active ? "working" : info && info.done === info.total && info.total > 0 ? "done" : active ? "waiting" : "idle";
    // Notes/evidence edits are not progress. Only focus and completed/cancelled counts trigger feedback.
    const revision = info ? `${info.activeId ?? ""}:${info.done}:${info.cancelled}` : JSON.stringify([dock?.summary, dock?.rows]);
    return this.controller.update({ state, revision,
      visible: this.visible && !!dock, reducedMotion: workspace.prefs.motion === "off" || workspace.layout?.motion === "off",
      suspended: workspace.promptDepth > 0 || !!workspace.footerPickerOpen || !focused },
      workspace.layout?.tasks?.presentation ?? taskPanelDefaults().presentation, now);
  }
  tick(workspace: WorkspaceState, now: number, focused: boolean): boolean { return this.update(workspace, now, focused).active; }
  render(theme: Theme, width: number, dock: DockSnapshot, workspace: WorkspaceState, now: number, focused: boolean, budget: number) {
    const identity = `${dock.sessionId}:${dock.overview?.planId ?? "legacy"}`;
    if (this.identity !== undefined && this.identity !== identity) this.reset();
    this.identity = identity;
    this.dock = dock; this.visible = width >= 16 && budget >= 3;
    return taskPanelRows(theme, width, dock, workspace.layout?.tasks ?? taskPanelDefaults(), this.update(workspace, now, focused), budget);
  }
}

/** Explicitly synthetic settings preview; never published as task state. */
export function taskDemo(state: FrameState): DockSnapshot {
  const done = state === "done", paused = state === "waiting" || state === "blocked", active = state === "working" || paused;
  return { version: 1, sessionId: "demo", id: "pi-tasks", title: "Photos for Mom", hint: "/tasks",
    summary: done ? "6 of 6 done" : "3 of 6 done · 1 blocked", more: done ? 0 : 1,
    rows: done ? [] : [
      ...(state === "error" ? [{ text: "× Could not load task history", tone: "error" as const }] : []),
      active ? { text: `● ${paused ? "Paused" : "Working"} · Print 4×6 copies`, tone: "accent" as const }
        : { text: "○ Print 4×6 copies", tone: "text" as const },
      { text: "! Choose the cover photo · waiting for your pick", tone: "warning" as const },
      { text: "○ Mail the album", tone: "text" as const },
    ],
    overview: { revision: `demo-${state}`, planId: "p1", total: 6, done: done ? 6 : 3, cancelled: 0,
      blocked: done ? 0 : 1, activeId: active ? "t4" : undefined, activeTitle: active ? "Print 4×6 copies" : undefined } };
}
