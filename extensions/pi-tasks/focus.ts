import type { Plan } from "./state.ts";
import { taskRow } from "./state.ts";
import type { DockSnapshot } from "../../lib/home-dock.ts";

/** View state only: never changes a task, revision, or execution state. */
export class FocusWindow {
  private planId?: string;
  private first = 0;
  private following = true;
  private lastActive?: string;
  reset() { this.planId = undefined; this.first = 0; this.following = true; this.lastActive = undefined; }
  private sync(id: string, plan: Plan) {
    if (id !== this.planId) { this.reset(); this.planId = id; }
    const active = plan.tasks.findIndex(t => t.status === "active");
    if (active >= 0) {
      this.lastActive = plan.tasks[active].id;
      if (this.following) this.first = Math.max(0, active - 1);
    }
    this.first = Math.min(this.first, Math.max(0, plan.tasks.length - 3));
    return active;
  }
  move(id: string, plan: Plan, direction: -1 | 1) {
    this.sync(id, plan); this.following = false;
    this.first = Math.max(0, Math.min(Math.max(0, plan.tasks.length - 3), this.first + direction));
  }
  follow(id: string, plan: Plan) { this.following = true; this.sync(id, plan); }
  apply(snapshot: DockSnapshot, id: string, plan: Plan, running: boolean) {
    const active = this.sync(id, plan);
    const end = Math.min(plan.tasks.length, this.first + 3);
    const position = active >= 0 ? active + 1 : plan.tasks.findIndex(t => t.id === this.lastActive) + 1;
    const status = active >= 0 ? `${running ? "Now working" : "Paused"}: ${position}`
      : position > 0 ? `Last worked on: ${position}` : plan.tasks.every(t => t.status === "pending") ? "Not started" : "No active task";
    snapshot.summary = `Tasks ${plan.tasks.length ? this.first + 1 : 0}–${end} of ${plan.tasks.length} · ${this.following && active >= 0 && running ? "Following" : status}`;
    snapshot.rows = plan.tasks.slice(this.first, end).map((task, i) => {
      const row = taskRow(task, running);
      return { ...row, text: row.text.replace(/^([^ ]+) /, `$1 ${this.first + i + 1}  `) };
    });
    snapshot.layout = "focus";
    snapshot.more = 0;
  }
}
