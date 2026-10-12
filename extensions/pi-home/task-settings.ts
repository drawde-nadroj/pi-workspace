import { FRAME_POSITIONS, FRAME_STATES, type FramePaint, type FrameState } from "../../lib/frame.ts";
import { cleanText } from "../../lib/home-dock.ts";
import type { TaskElementId, TaskPanelPrefs } from "./task-presentation.ts";
import type { ChoiceAudition } from "./workspace-room-types.ts";
export interface TaskControl { label: string; value: string; help: string; element?: TaskElementId; activate(): void }
export const TASK_ELEMENTS: ReadonlyArray<{ id: TaskElementId; name: string; help: string; control: string }> = [
  { id: "frame", name: "Border and motion", help: "Border styling and a display-only work example.", control: "Border color" },
  { id: "title", name: "Title", help: "The overview label. The stored plan name stays unchanged.", control: "Title position" },
  { id: "summary", name: "Progress count", help: "Recorded done, total and blocker counts.", control: "Count position" },
  { id: "hint", name: "More-work hint", help: "The overflow count and route to /tasks.", control: "More-work hint position" },
  { id: "body", name: "Task rows", help: "Active work, blockers and pending work, in sourced order.", control: "Visible tasks" },
  { id: "active", name: "Active task", help: "Tasks identifies the active row; color does not start work.", control: "Bold active task" },
];
export const taskControlElement = (control: TaskControl): TaskElementId => control.element ?? "frame";
interface Editors {
  get(): TaskPanelPrefs; change(fn: () => void): void;
  choose(title: string, items: Array<{ label: string; value: string }>, value: string, accept: (value: string) => void, audition?: ChoiceAudition): void;
  visual?(patch: (candidate: TaskPanelPrefs, value: string) => void): ChoiceAudition;
  text(title: string, value: string, help: string, accept: (value: string) => boolean): void;
  state: FrameState; preview(state: FrameState): void; replay(): void;
}
/** Pure candidate patches are shared by audition and acceptance. Only acceptance
 * enters the controller's one Undo/Save transaction; builders own no timers/state.
 */
export function taskControls(e: Editors): TaskControl[] {
  const p = e.get(), s = p.presentation;
  const choice = (label: string, value: string, values: string[], help: string, patch: (p: TaskPanelPrefs, value: string) => void, element?: TaskElementId): TaskControl => ({
    label, value, help, element, activate: () => e.choose(label, values.map(value => ({ value, label: value })), value,
      next => e.change(() => patch(e.get(), next)), e.visual?.(patch)),
  });
  const color = (label: string, value: FramePaint, patch: (p: TaskPanelPrefs, color: FramePaint) => void, element?: TaskElementId): TaskControl => ({
    label, value, element, help: "Theme colors adapt to light/dark. Custom colors use #RRGGBB; check their contrast.",
    activate: () => e.choose(label, ["accent", "text", "muted", "warning", "error", "success", "highlight", "custom"].map(value => ({ label: value, value })), value, next => {
      if (next !== "custom") { e.change(() => patch(e.get(), next as FramePaint)); return; }
      e.text(label, value.startsWith("#") ? value : "#", "Six hexadecimal digits, for example #eeeaff. Enter edits; Save keeps the change.", next => {
        if (!/^#[0-9a-f]{6}$/i.test(next)) return false;
        e.change(() => patch(e.get(), next as FramePaint)); return true;
      });
    }, e.visual?.((candidate, next) => { if (next !== "custom") patch(candidate, next as FramePaint); })),
  });
  const state = (candidate: TaskPanelPrefs) => candidate.presentation.states[e.state] ??= {};
  return [
    { label: "Demo state", value: e.state, help: "Hover or browse a state to preview it. No task, run or clock changes.", activate: () => e.choose("Demo state", FRAME_STATES.map(value => ({ label: value, value })), e.state, value => e.preview(value as FrameState)) },
    { label: "Replay progress sweep", value: "▶", help: "Replay a progress change in this example only. Motion-off still applies.", activate: e.replay },
    choice("Motion", s.motion, ["work", "changes", "off"], "Animate during work, once on progress changes, or not at all.", (p, v) => { p.presentation.motion = v as typeof s.motion; }),
    choice("Border effect", s.effect, ["shimmer", "pulse"], "Shimmer travels around the border; pulse blends it in place. Text does not move.", (p, v) => { p.presentation.effect = v as typeof s.effect; }),
    choice("Cycle duration", String(s.periodMs), ["2000", "4000", "6000", "8000"], "Time for one circuit or pulse. A progress sweep uses one cycle.", (p, v) => { p.presentation.periodMs = Number(v); }),
    choice("Highlight intensity", String(s.intensity), ["0.25", "0.45", "0.65", "0.85", "1"], "How strongly the border blends toward the highlight color.", (p, v) => { p.presentation.intensity = Number(v); }),
    choice("Direction", s.direction, ["clockwise", "counterclockwise"], "Travel direction for shimmer. Pulse stays in place.", (p, v) => { p.presentation.direction = v as typeof s.direction; }),
    choice("Progress sweep", s.progressSweep ? "on" : "off", ["on", "off"], "Sweep on a new recorded progress change, not on restored history.", (p, v) => { p.presentation.progressSweep = v === "on"; }),
    color("Border color", s.borderColor, (p, v) => { p.presentation.borderColor = v; }),
    color("Highlight color", s.highlightColor, (p, v) => { p.presentation.highlightColor = v; }),
    color("Title color", s.labelColor, (p, v) => { p.presentation.labelColor = v; }, "title"),
    color("Count color", s.metadataColor, (p, v) => { p.presentation.metadataColor = v; }, "summary"),
    color("Body text color", s.textColor, (p, v) => { p.presentation.textColor = v; }, "body"),
    color("Active task color", s.activeColor, (p, v) => { p.presentation.activeColor = v; }, "active"),
    choice("Text effect", s.textEffect, ["none", "labels", "active", "both"], "Optional gentle color pulse on labels or active text. Motion-off wins; letters never move.", (p, v) => { p.presentation.textEffect = v as typeof s.textEffect; }, "body"),
    choice("Bold title", s.labelBold ? "on" : "off", ["on", "off"], "Static emphasis for the overview title.", (p, v) => { p.presentation.labelBold = v === "on"; }, "title"),
    choice("Bold active task", s.activeBold ? "on" : "off", ["on", "off"], "Static emphasis for the recorded active task.", (p, v) => { p.presentation.activeBold = v === "on"; }, "active"),
    choice("Title position", s.positions.title, [...FRAME_POSITIONS], "Place the title on a rail. Shared positions form a group.", (p, v) => { p.presentation.positions.title = v as typeof s.positions.title; }, "title"),
    choice("Count position", s.positions.summary, [...FRAME_POSITIONS], "Place recorded progress on a rail. Long labels shorten to fit.", (p, v) => { p.presentation.positions.summary = v as typeof s.positions.summary; }, "summary"),
    choice("More-work hint position", s.positions.hint, [...FRAME_POSITIONS], "Place the overflow count and /tasks route on a rail.", (p, v) => { p.presentation.positions.hint = v as typeof s.positions.hint; }, "hint"),
    { label: "Panel title", value: p.title, element: "title", help: "Overview label only; does not rename your plan.", activate: () => e.text("Panel title", p.title, "Maximum 60 characters. Task titles stay unchanged.", value => { e.change(() => { e.get().title = Array.from(cleanText(value)).slice(0, 60).join(""); }); return true; }) },
    choice("Visible tasks", String(p.rows), ["1", "2", "3", "4", "5"], "Active work first, then blockers and pending work. Stored order stays unchanged.", (p, v) => { p.rows = Number(v); }, "body"),
    choice(`Motion when ${e.state}`, s.states[e.state]?.motion ?? "inherit", ["inherit", "repeat", "change", "off"], "Override motion for this state. Global off and real safety gates still win.", (p, v) => { if (v === "inherit") delete state(p).motion; else state(p).motion = v as "repeat" | "change" | "off"; }),
    color(`Border when ${e.state}`, s.states[e.state]?.borderColor ?? s.borderColor, (p, v) => { state(p).borderColor = v; }),
    color(`Text when ${e.state}`, s.states[e.state]?.textColor ?? s.textColor, (p, v) => { state(p).textColor = v; }, "body"),
    color(`Active text when ${e.state}`, s.states[e.state]?.activeColor ?? s.activeColor, (p, v) => { state(p).activeColor = v; }, "active"),
    color(`Title when ${e.state}`, s.states[e.state]?.labelColor ?? s.labelColor, (p, v) => { state(p).labelColor = v; }, "title"),
    color(`Counts when ${e.state}`, s.states[e.state]?.metadataColor ?? s.metadataColor, (p, v) => { state(p).metadataColor = v; }, "summary"),
    color(`Highlight when ${e.state}`, s.states[e.state]?.highlightColor ?? s.highlightColor, (p, v) => { state(p).highlightColor = v; }),
    { label: `Reset ${e.state} overrides`, value: "Reset", help: "Restore this state's defaults. Undo restores the overrides.", activate: () => e.change(() => {
      delete e.get().presentation.states[e.state];
      if (e.state === "blocked") e.get().presentation.states.blocked = { borderColor: "warning" };
      if (e.state === "error") e.get().presentation.states.error = { borderColor: "error" };
    }) },
  ];
}
