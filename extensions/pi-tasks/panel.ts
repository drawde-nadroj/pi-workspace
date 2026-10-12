import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, mixColors, parseColor, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type TUI } from "@earendil-works/pi-tui";
import { cleanText, type DockColors, type Tone } from "../../lib/home-dock.ts";
import { counts, SYMBOLS } from "./state.ts";
import { isPlanClosed, planInfo, selectedPlan, type PlanBook, type SavedPlan } from "./book.ts";

import { coverageGaps, requirementCoverage } from "./requirements.ts";

export type PanelResult = { op: "new"; revision: string } | { op: "add" | "clear" | "rename" | "archive" | "restore" | "select" | "edit"; planId: string; revision: string; id?: string } | "off" | undefined;
export interface PanelNavigation { viewId?: string; history?: boolean; selected?: number; planIndex?: number }
/** Looking at history never changes the current plan. Selection/restoration is an explicit action. */
export class TaskPanel implements Component {
  private details = false;
  private coverage = false;
  private scroll = 0;
  private renderedRevision?: string;
  private listTop = 0;
  constructor(private tui: TUI, private theme: Theme, private book: () => PlanBook,
    private colors: () => DockColors | undefined, private done: (value: PanelResult) => void,
    private nav: PanelNavigation = {}, private running: () => boolean = () => false) {}
  invalidate() {}
  private plans() { return [...this.book().plans].reverse(); }
  private viewed(): SavedPlan | undefined {
    const b = this.book();
    return b.plans.find((p) => p.id === this.nav.viewId) ?? selectedPlan(b) ?? b.plans.at(-1);
  }
  handleInput(data: string) {
    const b = this.book(), p = this.viewed();
    if (matchesKey(data, "ctrl+c")) return this.done(undefined);
    if (matchesKey(data, "escape")) {
      if (this.coverage) { this.coverage = false; this.scroll = 0; }
      else if (this.details) { this.details = false; this.scroll = 0; }
      else if (this.nav.history && p) this.nav.history = false;
      else return this.done(undefined);
      this.tui.requestRender(); return;
    }
    if (matchesKey(data, "n")) return this.done({ op: "new", revision: b.revision });
    if (matchesKey(data, "o")) return this.done("off");
    if (matchesKey(data, "h") || matchesKey(data, "tab")) {
      this.nav.history = !this.nav.history; this.coverage = false; this.details = false; this.scroll = 0; this.tui.requestRender(); return;
    }
    if (this.nav.history) {
      const plans = this.plans();
      const delta = matchesKey(data, "up") ? -1 : matchesKey(data, "down") ? 1 : 0;
      this.nav.planIndex = Math.max(0, Math.min(plans.length - 1, (this.nav.planIndex ?? 0) + delta));
      if (matchesKey(data, "return") && plans[this.nav.planIndex]) {
        this.nav.viewId = plans[this.nav.planIndex].id; this.nav.history = false; this.nav.selected = 0; this.details = false;
      }
      this.tui.requestRender(); return;
    }
    if (!p) { this.tui.requestRender(); return; }
    if (matchesKey(data, "q")) { this.coverage = !this.coverage; this.details = false; this.scroll = 0; this.tui.requestRender(); return; }
    if (this.coverage) {
      if (matchesKey(data, "up") || matchesKey(data, "down")) this.scroll = Math.max(0, this.scroll + (matchesKey(data, "up") ? -1 : 1));
      this.tui.requestRender(); return; // Read-only coverage view cannot dispatch task edits.
    }
    const action = (op: Exclude<PanelResult, string | undefined>["op"], id?: string) => {
      if (this.renderedRevision !== b.revision) { this.tui.requestRender(); return; }
      this.done({ op, planId: p.id, revision: b.revision, id } as PanelResult);
    };
    if (matchesKey(data, "s") && p.archivedAt === null) return action("select");
    if (matchesKey(data, "r") && p.archivedAt !== null) return action("restore");
    if (matchesKey(data, "x") && p.archivedAt === null) return action("archive");
    if (matchesKey(data, "t")) return action("rename");
    if (matchesKey(data, "d")) { this.details = !this.details; this.scroll = 0; this.tui.requestRender(); return; }
    if (this.details && (matchesKey(data, "up") || matchesKey(data, "down"))) {
      this.scroll = Math.max(0, this.scroll + (matchesKey(data, "up") ? -1 : 1)); this.tui.requestRender(); return;
    }
    const editable = p.id === b.selectedId && p.archivedAt === null;
    if (editable && matchesKey(data, "a")) return action("add");
    if (editable && matchesKey(data, "c")) return action("clear");
    const delta = matchesKey(data, "up") ? -1 : matchesKey(data, "down") ? 1 : 0;
    this.nav.selected = Math.max(0, Math.min(p.state.tasks.length - 1, (this.nav.selected ?? 0) + delta));
    const task = p.state.tasks[this.nav.selected];
    if (editable && task && matchesKey(data, "return")) return action("edit", task.id);
    this.tui.requestRender();
  }
  render(width: number): string[] {
    if (width <= 0) return [];
    const b = this.book(), p = this.viewed(), colors = this.colors();
    this.renderedRevision = b.revision;
    if (p) this.nav.viewId = p.id;
    const available = Math.max(4, Math.min(30, Math.floor(this.tui.terminal.rows * .85)));
    const previewTask = p?.state.tasks[Math.max(0, Math.min(p.state.tasks.length - 1, this.nav.selected ?? 0))];
    const previewText = previewTask?.reason || (previewTask?.doneWhen ? `Done when: ${previewTask.doneWhen}` : previewTask?.note ? `${previewTask.noteBy}-reported: ${previewTask.note}` : "");
    const preview = previewText ? wrapTextWithAnsi(cleanText(previewText), Math.max(1, width - 6)) : [];
    const preferred = this.nav.history || !p ? Math.max(14, b.plans.length * 2 + 9)
      : this.details || this.coverage ? 24 : Math.max(16, p.state.tasks.length + 12 + Math.max(0, preview.length - 1));
    const height = Math.min(available, preferred);
    const color = (tone: Tone) => colors ? parseColor(colors[tone]) : this.theme.colors[tone];
    // Raised relative to Composer and the native transcript; never transparent terminal-default rows.
    const surface = mixColors(colors ? parseColor(colors.panel) : this.theme.colors.customMessageBg, color("text"), .08, "srgb");
    const selected = mixColors(surface, color("accent"), .17, "srgb");
    const inner = Math.max(0, width - 2), contentWidth = Math.max(0, inner - 4);
    const edge = (s: string) => this.theme.style(s, { fg: color("accent"), bg: surface });
    const line = (text = "", tone: Tone = "text", highlight = false, bold = false) => {
      const textWidth = Math.max(0, inner - 4);
      const value = truncateToWidth(cleanText(text), textWidth, "…");
      const padded = truncateToWidth("  " + value + " ".repeat(Math.max(0, inner - 2 - visibleWidth(value))), inner, "");
      if (width < 6) return this.theme.style(truncateToWidth(cleanText(text), width, ""), { fg: color(tone), bg: surface });
      return edge("│") + this.theme.style(padded, { fg: color(tone), bg: highlight ? selected : surface, bold }) + edge("│");
    };
    const border = (top: boolean, label = "") => {
      if (width < 6) return line(label, "accent");
      const text = truncateToWidth(label ? `─ ${label} ` : "", inner, "");
      return edge((top ? "╭" : "╰") + text + "─".repeat(Math.max(0, inner - visibleWidth(text))) + (top ? "╮" : "╯"));
    };
    const finish = (rows: string[], foot: string[]) => {
      const room = Math.max(0, height - 2 - foot.length);
      const body = rows.slice(0, room);
      while (body.length < room) body.push(line());
      return [border(true, this.nav.history ? "Plans" : "Tasks"), ...body, ...foot, border(false)].slice(0, height);
    };
    if (this.nav.history || !p) {
      const plans = this.plans();
      this.nav.planIndex = Math.max(0, Math.min(plans.length - 1, this.nav.planIndex ?? 0));
      const room = Math.max(1, Math.floor((height - 9) / 2));
      const first = Math.max(0, Math.min(this.nav.planIndex - Math.floor(room / 2), plans.length - room));
      const rows = [line("Your plans", "accent", false, true), line(`${plans.length} saved · opening history does not start work`, "muted"), line()];
      if (!plans.length) rows.push(line("A fresh page for your next substantial request.", "muted"), line("Press N to create a named plan.", "muted"));
      for (const [i, item] of plans.slice(first, first + room).entries()) {
        const chosen = first + i === this.nav.planIndex;
        const saved = planInfo(item, b).state;
        const status = saved !== "open" ? saved : item.id === b.selectedId ? "current" : "paused";
        rows.push(line(`${chosen ? "›" : " "} ${item.title}`, "text", chosen, chosen),
          line(`  ${item.id} · ${status} · ${counts(item.state)}`, "muted", chosen));
      }
      if (plans.length > room) rows.push(line(`${first + 1}–${Math.min(plans.length, first + room)} of ${plans.length} plans · ↑↓`, "muted"));
      return finish(rows, [line("↑↓ choose · Enter open · N new · Esc back", "muted")]);
    }
    const current = p.id === b.selectedId && p.archivedAt === null;
    const status = p.archivedAt !== null ? "Archived · R to restore" : current ? "Current plan" : "History · S to make current";
    const completion = isPlanClosed(p) ? " · closed, saved in history" : "";
    const gaps = coverageGaps(p.requirements, p.state);
    const rows = [line(p.title, "accent", false, true), line(`${status} · ${counts(p.state)}${completion}`, "muted"),
      gaps.length ? line(`${gaps.length} requirement(s) need review · Q coverage`, "warning") : line()];
    if (this.coverage) {
      const records = requirementCoverage(p.requirements, p.state);
      const detail = (records.length ? records.flatMap(r => [`${r.id} · ${r.state}: ${r.title}`, `Source: ${r.source}`,
        `Accept when: ${r.acceptance}`, `Tasks: ${r.taskIds.join(", ") || "not linked"}`, ...(r.reason ? [`Reason: ${r.reason}`] : []), ""])
        : ["No requirements recorded. Coverage is not established; compare the accepted requests in the conversation."])
        .flatMap(s => wrapTextWithAnsi(cleanText(s), Math.max(1, contentWidth)));
      const room = Math.max(1, height - 6);
      this.scroll = Math.min(this.scroll, Math.max(0, detail.length - room));
      rows.push(...detail.slice(this.scroll, this.scroll + room).map(s => line(s)));
      return finish(rows, [line(`↑↓ scroll · ${this.scroll + 1}–${Math.min(detail.length, this.scroll + room)}/${detail.length} · Q/Esc back`, "muted")]);
    }
    this.nav.selected = Math.max(0, Math.min(p.state.tasks.length - 1, this.nav.selected ?? 0));
    const task = p.state.tasks[this.nav.selected];
    if (this.details && task) {
      const detail = [`${task.id} · ${task.status} · ${task.title}`, `Phase: ${task.phase || "none"}`, `Done when: ${task.doneWhen || "not specified"}`,
        `Depends on: ${task.dependsOn.join(", ") || "none"}`, ...(task.reason ? [`Blocked: ${task.reason}`] : []),
        `Outcome (${task.noteBy}-reported): ${task.note || "none"}`, `Evidence (not independently verified): ${task.evidence || "none"}`]
        .flatMap((s) => wrapTextWithAnsi(cleanText(s), Math.max(1, contentWidth)));
      const room = Math.max(1, height - 8);
      this.scroll = Math.min(this.scroll, Math.max(0, detail.length - room));
      rows.push(...detail.slice(this.scroll, this.scroll + room).map((s) => line(s)));
      return finish(rows, [line(`↑↓ scroll · ${current ? "Enter edit · " : ""}Esc back`, "muted")]);
    }
    const previewBudget = Math.min(preview.length, Math.max(1, height - 13));
    const room = Math.max(1, height - 11 - Math.max(1, previewBudget));
    if (!p.state.tasks.length) rows.push(line(p.state.userCleared ? "Tasks cleared. A adds a task; N starts a new plan." : "No tasks yet. A adds a task to this plan.", "muted"));
    const starts: number[] = [];
    const wrapped: string[] = [];
    for (const [i, t] of p.state.tasks.entries()) {
      starts.push(wrapped.length);
      const chosen = i === this.nav.selected;
      const paused = t.status === "active" && (!current || !this.running());
      const title = `${chosen ? "›" : " "} ${SYMBOLS[t.status]} ${i + 1}  ${t.title}${paused ? " · paused" : ""}${t.status === "blocked" ? " · blocked" : ""}${t.status === "cancelled" ? " · cancelled" : ""}`;
      const tone = t.status === "blocked" ? "warning" : t.status === "active" ? "accent" : t.status === "done" ? "success" : t.status === "cancelled" ? "muted" : "text";
      wrapped.push(...wrapTextWithAnsi(title, Math.max(1, contentWidth)).map(s => line(s, tone, chosen)));
    }
    const selectedStart = starts[this.nav.selected] ?? 0;
    const selectedEnd = starts[this.nav.selected + 1] ?? wrapped.length;
    if (selectedStart < this.listTop) this.listTop = selectedStart;
    if (selectedEnd > this.listTop + room) this.listTop = Math.max(selectedStart, selectedEnd - room);
    this.listTop = Math.max(0, Math.min(this.listTop, Math.max(0, wrapped.length - room)));
    rows.push(...wrapped.slice(this.listTop, this.listTop + room));
    if (wrapped.length > room) rows.push(line(`↑↓ choose · ${this.nav.selected + 1} of ${p.state.tasks.length} · D full text`, "muted"));
    if (task) {
      rows.push(line(), line(`${task.id} · ${task.status} · ${task.phase || "no phase"}`, "muted"));
      const clipped = preview.length > previewBudget;
      const visiblePreview = preview.slice(0, clipped ? Math.max(0, previewBudget - 1) : previewBudget);
      rows.push(...visiblePreview.map(text => line(text, task.reason ? "warning" : "muted")));
      if (clipped) rows.push(line("… D for full details", "muted"));
    }
    const controls = current ? "Enter edit · D details · A add · T rename" : `D details · ${p.archivedAt !== null ? "R restore" : "S make current"} · T rename`;
    return finish(rows, [line(controls, "muted"), line(`Q coverage · H plans · N new · ${p.archivedAt === null ? "X archive · " : ""}Esc close`, "muted")]);
  }
}
