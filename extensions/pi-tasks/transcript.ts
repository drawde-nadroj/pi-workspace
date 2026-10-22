import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { cleanText, type Tone } from "pi-agent-contracts/dock";
import { taskFrame } from "../../lib/task-frame.ts";
import type { Plan, Status, Task } from "./state.ts";
import type { Requirement } from "./requirements.ts";
import type { planInfo } from "./book.ts";
import { WORK_STATUS as STATES, REQUEST_STATUS as COVERAGE, planWord } from "./typography.ts";

type Row = { text: string; tone?: Tone; bold?: boolean; indent?: number; prose?: boolean; glyph?: string; glyphTone?: Tone };
export type TaskCardDetails = { plan?: Plan; title?: string; requirements?: (Requirement & { state: string })[]; plans?: ReturnType<typeof planInfo>[] };
type Args = { op?: string; id?: string; items?: unknown[]; changes?: { status?: string } };

function field(rows: Row[], label: string, value: string) {
  rows.push({ text: "" }, { text: label, tone: "muted", indent: 2 }, { text: value, indent: 2, prose: true });
}
function workRows(rows: Row[], tasks: Task[], expanded: boolean) {
  tasks.forEach((t, i) => {
    if (expanded && i) rows.push({ text: "" }, { text: "" });
    const s = STATES[t.status] ?? { glyph: "?", tone: "warning" as const, label: t.status };
    rows.push({ text: `${t.title}${t.status === "cancelled" ? " · cancelled" : ""}`, glyph: s.glyph, glyphTone: s.tone });
    if (t.status === "blocked") rows.push({ text: `Blocked: ${t.reason || "reason not recorded"}`, indent: 2, prose: true });
    if (expanded) {
      rows.push({ text: `Status  ${s.label}`, tone: "muted", indent: 2 });
      if (t.note) field(rows, t.noteBy === "user" ? "Outcome · user note" : "Outcome · agent report", t.note);
      if (t.evidence) field(rows, "Evidence", t.evidence);
      rows.push({ text: `Reference  ${t.id}`, tone: "muted", indent: 2 });
    }
  });
}
function summary(tasks: Task[], theme: Theme, updated: boolean): string {
  const prefix = updated ? "Updated · " : "";
  if (tasks.length === 1) {
    const state = STATES[tasks[0].status];
    const label = state?.label ?? tasks[0].status;
    return theme.fg(state?.tone ?? "muted", prefix + (updated ? label.toLowerCase() : label));
  }
  const count = (status: string) => tasks.filter(t => t.status === status).length;
  const done = count("done");
  // One count format on every surface: done out of total, then only the states that exist.
  return theme.fg("muted", prefix) + theme.fg(done === tasks.length ? "success" : "muted", `${done} of ${tasks.length} done`) +
    ["active", "blocked", "cancelled"].filter(s => count(s)).map(s => theme.fg(STATES[s as Status].tone, ` · ${count(s)} ${s === "active" ? "working" : s}`)).join("");
}

/** Display-only Tasks adapter. No state writes, input ownership, or new appearance authority. */
export function taskResultCard(details: TaskCardDetails, args: Args, expanded: boolean, theme: Theme, width: number): string[] {
  if (width <= 0) return [];
  const p = details.plan!, rows: Row[] = [];
  let detail = "";
  if (details.requirements) {
    const reqs = details.requirements;
    const common = reqs.length && reqs.every(r => r.state === reqs[0].state) ? COVERAGE[reqs[0].state]?.label : undefined;
    detail = reqs.length ? `${reqs.length} request${reqs.length === 1 ? "" : "s"}` : "Requests";
    if (common) rows.push({ text: common, tone: COVERAGE[reqs[0].state].tone === "warning" ? "warning" : "muted" }, { text: "" });
    reqs.forEach((r, i) => {
      if (i) rows.push({ text: "" }, ...(expanded ? [{ text: "" }] : []));
      const s = COVERAGE[r.state] ?? { glyph: "?", tone: "warning" as const, label: r.state };
      rows.push({ text: r.title, bold: true, glyph: s.glyph, glyphTone: s.tone });
      const links = r.taskIds.length ? `${r.taskIds.length} linked` : "No linked work";
      if (!common || !expanded) rows.push({ text: [!common ? s.label : "", !expanded ? links : ""].filter(Boolean).join(" · "), tone: s.tone === "warning" ? "warning" : "muted", indent: 2 });
      if (expanded) {
        field(rows, "Done when", r.acceptance);
        field(rows, "Original request", r.source);
        rows.push({ text: "" }, { text: `Linked work  ${r.taskIds.join(", ") || "not linked"}`, tone: "muted", indent: 2, prose: true },
          { text: `Reference  ${r.id}`, tone: "muted", indent: 2 });
        if (r.reason) field(rows, "Disposition", r.reason);
      }
    });
  } else if (details.plans) {
    rows.push(...details.plans.map(p => ({ text: `${p.title} · ${planWord(p.state, p.current)} · ${p.counts}`, tone: "muted" as const })));
  } else {
    const actions: Record<string, string> = { archive: "Archived plan", select: "Selected plan", rename: "Renamed plan" };
    if (args.op && actions[args.op]) rows.push({ text: `${actions[args.op]}: ${details.title ?? "Plan"}` });
    else {
      const changed = args.op === "update" ? p.tasks.filter(t => t.id === args.id)
        : args.op === "add" && args.items?.length ? p.tasks.slice(-args.items.length) : p.tasks;
      if (args.op === "create" && details.title) rows.push({ text: details.title, bold: true }, { text: "" });
      if ((args.op === "add" || args.op === "create") && changed.length) {
        rows.push({ text: `+ Added ${changed.length} task${changed.length === 1 ? "" : "s"} · not started`, tone: "accent" }, { text: "" });
      } else if (changed.length) {
        detail = summary(changed, theme, args.op === "update" && !args.changes?.status);
      }
      workRows(rows, changed, expanded);
    }
  }
  if (!rows.length) rows.push({ text: args.op === "requirements" ? "No requests recorded · coverage not established" : args.op === "plans" ? "No saved plans" : args.op === "list" && !details.title ? "No current plan" : "No tasks", tone: "muted" });
  // Tiny unframed cards keep the textual summary rather than relying on color or a clipped rail.
  if (width < 12 && detail) rows.unshift({ text: detail, tone: "muted" }, { text: "" });
  const available = Math.max(1, width - (width >= 12 ? 2 : 0));
  const inset = width >= 12 ? 1 : 0;
  const usable = Math.max(1, available - inset);
  const content = rows.flatMap(row => {
    if (!row.text && !row.glyph) return [""];
    const indent = Math.min(row.indent ?? 0, Math.max(0, usable - 3));
    const prefix = row.glyph ? `${row.glyph} ` : " ".repeat(indent);
    const prefixWidth = Math.min(visibleWidth(prefix), Math.max(0, usable - 2));
    const room = Math.max(1, usable - prefixWidth);
    const measure = row.prose ? Math.min(80, room) : room;
    // Split paragraphs first: wrapTextWithAnsi is a line wrapper, not a document parser.
    return row.text.split(/\r?\n/).flatMap(line => wrapTextWithAnsi(cleanText(line), measure)).map((line, i) => {
      const lead = row.glyph && i === 0 ? theme.fg(row.glyphTone ?? "muted", truncateToWidth(prefix, prefixWidth, "")) : " ".repeat(prefixWidth);
      return truncateToWidth(" ".repeat(inset) + lead + theme.style(line, { fg: row.tone ?? "text", bold: !!row.bold }), available, "");
    });
  });
  return taskFrame(theme, width, content, "Tasks", detail);
}
