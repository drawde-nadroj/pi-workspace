/** Tasks-owned visual vocabulary shared by every surface. Nothing else defines glyphs or status words. */
import { cleanText, type DockRow, type Tone } from "pi-agent-contracts/dock";
import type { Plan, Status, Task } from "./state.ts";
import { unresolved, type QuestionProjection } from "pi-agent-contracts/posted";

export type StatusMark = { glyph: string; tone: Tone; label: string };
export const WORK_STATUS: Readonly<Record<Status, StatusMark>> = {
  active: { glyph: "●", tone: "accent", label: "In progress" },
  blocked: { glyph: "!", tone: "warning", label: "Blocked" },
  pending: { glyph: "○", tone: "muted", label: "Not started" },
  done: { glyph: "✓", tone: "success", label: "Done" },
  cancelled: { glyph: "–", tone: "muted", label: "Cancelled" },
};
export const REQUEST_STATUS: Readonly<Record<string, StatusMark>> = {
  uncovered: { glyph: "!", tone: "warning", label: "No work linked" },
  open: { glyph: "○", tone: "muted", label: "Open" },
  "needs disposition": { glyph: "!", tone: "warning", label: "Needs review" },
  "reported done": { glyph: "✓", tone: "success", label: "Reported done" },
  superseded: { glyph: "–", tone: "muted", label: "Superseded" },
};
/** A running agent distinguishes active work from a paused plan without inventing a new status. */
export function workWord(status: Status, running: boolean): string {
  return status === "active" ? running ? "Working" : "Paused" : WORK_STATUS[status].label;
}
export function planWord(state: string, current: boolean): string {
  return state === "archived" ? "Archived" : state === "completed" || state === "closed" ? "Finished" : current ? "Current" : "Open";
}
export function questionAttention(q: QuestionProjection): string {
  if (q.state === "submitted") return "Response saved · delivery pending";
  if (q.state === "delivered") return q.responseStatus === "answered" ? "Agent to apply answer" : "Agent to follow up";
  return q.urgency === "blocking" ? "Needs your input" : "Your perspective · can wait";
}
export function waitingText(task: Task, plan: Plan): string {
  if (["done", "cancelled"].includes(task.status)) return "";
  const dependencies = task.dependsOn.map(id=>plan.tasks.find(t=>t.id===id)).filter(t=>t && t.status !== "done");
  const dependency = dependencies.length ? `Waiting on work: ${dependencies.map(t=>t!.title).join(", ")}` : "";
  if (task.status !== "blocked") return dependency;
  const who = task.blockerOwner === "user" ? "Needs your input" : task.blockerOwner === "agent" ? "Agent to resolve" : task.blockerOwner === "external" ? "Waiting externally" : "Waiting";
  return [`${who} · ${task.reason}`, task.unblockWhen ? `To continue: ${task.unblockWhen}` : "", dependency].filter(Boolean).join(" · ");
}
export function questionAttentionSummary(records: QuestionProjection[]): string {
  const open = records.filter(unresolved);
  const input = open.filter(q=>q.state === "awaiting" && q.urgency === "blocking").length;
  const later = open.filter(q=>q.state === "awaiting" && q.urgency === "deferred").length;
  const agent = open.filter(q=>q.state === "delivered").length;
  const delivery = open.filter(q=>q.state === "submitted").length;
  return [input ? `${input} needs you` : "", later ? `${later} can wait` : "", agent ? `${agent} agent follow-up` : "", delivery ? `${delivery} delivery pending` : ""].filter(Boolean).join(" · ");
}
const OPEN_RANK: Record<string, number> = { active: 0, blocked: 1, pending: 2 };
/** Every open task, in the one order every host shows: working, blocked, not started. */
export function dockRows(plan: Plan, running: boolean): DockRow[] {
  return plan.tasks.filter((t) => OPEN_RANK[t.status] !== undefined)
    .slice()
    .sort((a, b) => OPEN_RANK[a.status] - OPEN_RANK[b.status])
    .map((t) => t.status === "active"
      ? { text: `${WORK_STATUS.active.glyph} ${workWord("active", running)} · ${cleanText(t.title)}`, tone: "accent" as Tone }
      : t.status === "blocked"
        ? { text: `${WORK_STATUS.blocked.glyph} ${cleanText(t.title)} · ${cleanText(waitingText(t,plan)).slice(0, 240)}`, tone: "warning" as Tone }
        : { text: `${WORK_STATUS.pending.glyph} ${cleanText(t.title)}${waitingText(t,plan) ? ` · ${cleanText(waitingText(t,plan)).slice(0,180)}` : ""}`, tone: "text" as Tone });
}
