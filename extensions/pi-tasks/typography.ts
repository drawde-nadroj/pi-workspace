/** Tasks-owned visual vocabulary shared by every surface. Nothing else defines glyphs or status words. */
import { cleanText, type DockRow, type Tone } from "../../lib/workspace-dock.ts";
import type { Plan, Status } from "./state.ts";

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
const OPEN_RANK: Record<string, number> = { active: 0, blocked: 1, pending: 2 };
/** Every open task, in the one order every host shows: working, blocked, not started. */
export function dockRows(plan: Plan, running: boolean): DockRow[] {
  return plan.tasks.filter((t) => OPEN_RANK[t.status] !== undefined)
    .slice()
    .sort((a, b) => OPEN_RANK[a.status] - OPEN_RANK[b.status])
    .map((t) => t.status === "active"
      ? { text: `${WORK_STATUS.active.glyph} ${workWord("active", running)} · ${cleanText(t.title)}`, tone: "accent" as Tone }
      : t.status === "blocked"
        ? { text: `${WORK_STATUS.blocked.glyph} ${cleanText(t.title)} · ${cleanText(t.reason).slice(0, 180)}`, tone: "warning" as Tone }
        : { text: `${WORK_STATUS.pending.glyph} ${cleanText(t.title)}`, tone: "text" as Tone });
}
