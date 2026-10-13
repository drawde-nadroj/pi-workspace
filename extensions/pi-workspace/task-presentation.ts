import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripVTControlCharacters } from "node:util";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { createFrameController, framePresentationDefaults, readFramePresentation, presentationRows,
  type FramePresentation, type FrameSample, type FrameState } from "../../lib/frame.ts";
import { cleanText, type DockSnapshot } from "../../lib/workspace-dock.ts";
import type { WorkspaceState } from "./state.ts";

export interface TaskPanelPrefs { version: 1; title: string; rows: number; presentation: FramePresentation }
export type TaskElementId = "frame" | "title" | "summary" | "hint" | "body" | "active";
export interface TaskPreviewHit { id: TaskElementId; x: number; y: number; width: number }
export function taskPanelDefaults(): TaskPanelPrefs {
  return { version: 1, title: "Tasks", rows: 3, presentation: { ...framePresentationDefaults(), metadataColor: "accent" } };
}
export function readTaskPanel(value: unknown): TaskPanelPrefs {
  const out = taskPanelDefaults(), raw = value as Partial<TaskPanelPrefs> | undefined;
  if (raw?.version !== 1) return out;
  if (typeof raw.title === "string") out.title = Array.from(cleanText(raw.title)).slice(0, 60).join("");
  if (Number.isInteger(raw.rows)) out.rows = Math.max(1, Math.min(5, raw.rows!));
  out.presentation = readFramePresentation(raw.presentation);
  return out;
}
function taskPanelLayout(theme: Theme, width: number, dock: DockSnapshot, prefs: TaskPanelPrefs,
  frame: FrameSample, budget = 7, withHits = false): { rows: string[]; hits: TaskPreviewHit[] } {
  const info = dock.overview;
  const source = info?.rows ?? [...dock.rows].sort((a, b) => {
    const rank = (tone?: string) => tone === "accent" ? 0 : tone === "warning" || tone === "error" ? 1 : tone === "muted" ? 3 : 2;
    return rank(a.tone) - rank(b.tone);
  });
  const bodyBudget = Math.max(1, budget - 2);
  const capacity = Math.max(1, Math.min(prefs.rows, bodyBudget));
  const hidden = Math.max(0, source.length - capacity) + (info?.more ?? dock.more ?? 0);
  const inner = Math.max(1, width - 4);
  const content: Array<{ text: string; role: "text" | "active" | "muted" | "warning" | "error" }> = [];
  const chosen = source.slice(0, capacity);
  for (const [index, row] of chosen.entries()) {
    const role = row.tone === "accent" ? "active" : row.tone === "warning" || row.tone === "error" || row.tone === "muted" ? row.tone : "text";
    let text = cleanText(row.text);
    if (info && !info.activeId && index === 0 && role === "text") text = `Next → ${text.replace(/^○\s*/, "")}`;
    const lines = wrapTextWithAnsi(text, inner);
    const count = index === 0 && bodyBudget > chosen.length ? Math.min(2, lines.length) : 1;
    for (let i = 0; i < count; i++) content.push({ role,
      text: i === count - 1 && lines.length > count ? truncateToWidth(lines[i], Math.max(0, inner - 1), "") + "…" : lines[i] });
  }
  if (!content.length) content.push({ text: info?.total ? info.done === info.total ? "✓ All tasks complete" : "No open tasks" : "No tasks", role: "muted" });
  const attention = (info?.questions?.blocking ?? 0) + (info?.questions?.deferred ?? 0);
  const hint = hidden > 0 ? `+ ${hidden} open · /tasks` : attention ? "/tasks questions" : "";
  let summary = info ? `${info.done}/${info.total} done${info.blocked ? ` · ${info.blocked} blocked` : ""}${info.cancelled ? ` · ${info.cancelled} cancelled` : ""}` : cleanText(dock.summary ?? "");
  if (info && width < 36) summary = `✓ ${info.done}/${info.total}${info.blocked ? ` · !${info.blocked}` : ""}${info.cancelled ? ` · –${info.cancelled}` : ""}`;
  if (attention) summary += width < 36 ? ` · ?${attention}` : ` · ${attention} question${attention === 1 ? "" : "s"}`;
  if (width < 16) {
    if (hint && content.length < bodyBudget) content.push({ text: hint, role: "muted" });
    return { rows: content.map(row => truncateToWidth(row.text, width, "…")), hits: [] };
  }
  const rows = presentationRows({ theme, width, rows: content, title: prefs.title, summary, hint, presentation: prefs.presentation, frame });
  if (!withHits) return { rows, hits: [] }; // No hit parsing on the live, possibly animated Tasks widget.
  const hits: TaskPreviewHit[] = [];
  // Hit regions are derived from the *rendered* rail, not assumed positions: a
  // truncated or omitted label is not clickable. This stays in the Workspace adapter;
  // Frame remains an input-agnostic drawing primitive.
  const rails = [0, rows.length - 1];
  for (const [id, value, position] of [
    ["title", prefs.title, prefs.presentation.positions.title],
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
    const busy = workspace.clock.active || workspace.compacting;
    const active = info ? !!info.activeId : dock?.rows.some(r => r.tone === "accent");
    const state: FrameState = workspace.promptDepth ? "waiting" : dock?.rows.some(r => r.tone === "error") ? "error"
      : info?.blocked ? "blocked" : busy && active ? "working" : info && info.done === info.total && info.total > 0 ? "done" : active ? "waiting" : "idle";
    return this.controller.update({ state, revision: info?.revision ?? JSON.stringify([dock?.summary, dock?.rows]),
      visible: this.visible && !!dock, reducedMotion: workspace.prefs.motion === "off" || workspace.layout?.motion === "off",
      suspended: workspace.promptDepth > 0 || !!workspace.footerPickerOpen || !focused || now - workspace.lastInputAt < 1200 },
      workspace.layout?.tasks?.presentation ?? framePresentationDefaults(), now);
  }
  tick(workspace: WorkspaceState, now: number, focused: boolean): boolean { return this.update(workspace, now, focused).active; }
  render(theme: Theme, width: number, dock: DockSnapshot, workspace: WorkspaceState, now: number, focused: boolean, budget: number) {
    const identity = `${dock.sessionId}:${dock.overview?.planId ?? "legacy"}`;
    if (this.identity !== undefined && this.identity !== identity) this.reset();
    this.identity = identity;
    this.dock = dock; this.visible = width >= 16 && budget >= 3;
    const open = dock.rows.filter(row => row.tone !== "muted");
    const display = !dock.overview && !workspace.prefs.details && open.length ? { ...dock, rows: open } : dock;
    return taskPanelRows(theme, width, display, workspace.layout?.tasks ?? taskPanelDefaults(), this.update(workspace, now, focused), budget);
  }
}

/** Explicitly synthetic settings preview; never published as task state. */
export function taskDemo(state: FrameState): DockSnapshot {
  const blocked = state === "blocked", done = state === "done";
  return { version: 1, sessionId: "demo", id: "pi-tasks", title: "Preview only", rows: [],
    overview: { revision: `demo-${state}`, total: 7, done: done ? 7 : 3, cancelled: 0, blocked: blocked ? 1 : 0,
      activeId: state === "working" || state === "waiting" ? "t4" : undefined, more: 0,
      rows: done ? [] : [
        { text: state === "error" ? "× Could not load task history" : blocked ? "! Review changes · waiting for approval" : state === "working" ? "▸ Refine task overview" : state === "waiting" ? "▸ Refine task overview · paused" : "○ Refine task overview", tone: state === "error" ? "error" : blocked ? "warning" : state === "working" || state === "waiting" ? "accent" : "text" },
        { text: "○ Validate narrow and wide layouts", tone: "text" }, { text: "○ Document presentation controls", tone: "text" },
        { text: "○ Review the finished result", tone: "text" },
      ] } };
}
