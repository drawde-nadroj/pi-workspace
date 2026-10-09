import { FRAME_POSITIONS, FRAME_STATES, type FramePaint, type FrameState } from "../../lib/frame.ts";
import { cleanText } from "../../lib/home-dock.ts";
import type { TaskElementId, TaskPanelPrefs } from "./task-presentation.ts";
export interface TaskControl { label: string; value: string; help: string; element?: TaskElementId; activate(): void }
export const TASK_ELEMENTS: ReadonlyArray<{ id: TaskElementId; name: string; help: string; control: string }> = [
  { id: "frame", name: "Border and motion", help: "The Tasks frame and its display-only motion example.", control: "Border color" },
  { id: "title", name: "Title", help: "A display label; editing it does not rename the plan.", control: "Title position" },
  { id: "summary", name: "Progress count", help: "Sourced done, total and blocker counts, not a simulated plan edit.", control: "Count position" },
  { id: "hint", name: "More-work hint", help: "The overflow count and route to /tasks when work does not fit.", control: "More-work hint position" },
  { id: "body", name: "Task rows", help: "The overview shows sourced active work and blockers first.", control: "Visible tasks" },
  { id: "active", name: "Active task", help: "An active row is identified by Tasks, not by its display color.", control: "Bold active task" },
];
export const taskControlElement = (control: TaskControl): TaskElementId => control.element ?? "frame";
interface Editors {
  get(): TaskPanelPrefs; change(fn: () => void): void;
  choose(title: string, items: Array<{ label: string; value: string }>, value: string, accept: (value: string) => void): void;
  text(title: string, value: string, help: string, accept: (value: string) => boolean): void;
  state: FrameState; preview(state: FrameState): void; replay(): void;
}
export function taskControls(e: Editors): TaskControl[] {
  const p = e.get(), s = p.presentation;
  const choice = (label: string, value: string, values: string[], help: string, accept: (value: string) => void, element?: TaskElementId): TaskControl => ({
    label, value, help, element, activate: () => e.choose(label, values.map(value => ({ value, label: value })), value, next => e.change(() => accept(next))),
  });
  const color = (label: string, value: FramePaint, accept: (value: FramePaint) => void, element?: TaskElementId): TaskControl => ({ label, value, element,
    help: "Theme colors adapt to light/dark. Highlight is soft white on dark themes and dark ink on light themes. Custom colors use #RRGGBB.",
    activate: () => e.choose(label, ["accent", "text", "muted", "warning", "error", "success", "highlight", "custom"].map(value => ({ label: value, value })), value, next => {
      if (next !== "custom") { e.change(() => accept(next as FramePaint)); return; }
      e.text(label, value.startsWith("#") ? value : "#", "Six hexadecimal digits, for example #eeeaff. Enter keeps the preview; Save is separate.", next => {
        if (!/^#[0-9a-f]{6}$/i.test(next)) return false;
        e.change(() => accept(next as FramePaint)); return true;
      });
    }),
  });
  const state = () => s.states[e.state] ??= {};
  return [
    { label: "Demo state", value: e.state, help: "Display-only example. Does not start work, edit tasks, or alter a run clock.", activate: () => e.choose("Demo state", FRAME_STATES.map(value => ({ label: value, value })), e.state, value => e.preview(value as FrameState)) },
    { label: "Replay progress sweep", value: "▶", help: "Simulate a progress change in this example only. Motion-off and state rules still apply.", activate: e.replay },
    choice("Motion", s.motion, ["work", "changes", "off"], "Work repeats while actively working; changes sweeps on progress updates. Off overrides all state motion rules.", value => { s.motion = value as typeof s.motion; }),
    choice("Border effect", s.effect, ["shimmer", "pulse"], "Shimmer travels around the border. Pulse blends the whole border gently. Neither moves text.", value => { s.effect = value as typeof s.effect; }),
    choice("Cycle duration", String(s.periodMs), ["2000", "4000", "6000", "8000"], "Milliseconds per circuit or pulse. A progress sweep completes one cycle.", value => { s.periodMs = Number(value); }),
    choice("Highlight intensity", String(s.intensity), ["0.25", "0.45", "0.65", "0.85", "1"], "How far the border blends toward the highlight. Text stays readable at rest.", value => { s.intensity = Number(value); }),
    choice("Direction", s.direction, ["clockwise", "counterclockwise"], "Direction of the travelling shimmer.", value => { s.direction = value as typeof s.direction; }),
    choice("Progress sweep", s.progressSweep ? "on" : "off", ["on", "off"], "Restart a single sweep when sourced task progress changes; never replay branch history.", value => { s.progressSweep = value === "on"; }),
    color("Border color", s.borderColor, value => { s.borderColor = value; }),
    color("Highlight color", s.highlightColor, value => { s.highlightColor = value; }),
    color("Title color", s.labelColor, value => { s.labelColor = value; }, "title"),
    color("Count color", s.metadataColor, value => { s.metadataColor = value; }, "summary"),
    color("Body text color", s.textColor, value => { s.textColor = value; }, "body"),
    color("Active task color", s.activeColor, value => { s.activeColor = value; }, "active"),
    choice("Text effect", s.textEffect, ["none", "labels", "active", "both"], "Optional gentle color pulse on labels, active text, or both, using the same permitted motion clock. No flashing, replacement, or moving letters.", value => { s.textEffect = value as typeof s.textEffect; }, "body"),
    choice("Bold title", s.labelBold ? "on" : "off", ["on", "off"], "Static title emphasis.", value => { s.labelBold = value === "on"; }, "title"),
    choice("Bold active task", s.activeBold ? "on" : "off", ["on", "off"], "Static emphasis for the sourced active task, not a pending suggestion.", value => { s.activeBold = value === "on"; }, "active"),
    choice("Title position", s.positions.title, [...FRAME_POSITIONS], "Place the title on any of the six rails. Counts and title share a group if placed together.", value => { s.positions.title = value as typeof s.positions.title; }, "title"),
    choice("Count position", s.positions.summary, [...FRAME_POSITIONS], "Place sourced progress on any rail. Long labels shorten at narrow widths.", value => { s.positions.summary = value as typeof s.positions.summary; }, "summary"),
    choice("More-work hint position", s.positions.hint, [...FRAME_POSITIONS], "Keep the overflow count and /tasks route in a rail rather than spending a body row.", value => { s.positions.hint = value as typeof s.positions.hint; }, "hint"),
    { label: "Panel title", value: p.title, element: "title", help: "Display label only. Does not rename the plan.", activate: () => e.text("Panel title", p.title, "Maximum 60 characters. Task titles remain unchanged.", value => { e.change(() => { p.title = Array.from(cleanText(value)).slice(0, 60).join(""); }); return true; }) },
    choice("Visible tasks", String(p.rows), ["1", "2", "3", "4", "5"], "Active work first, then blockers and pending work. The overview never reorders the stored plan.", value => { p.rows = Number(value); }, "body"),
    choice(`Motion when ${e.state}`, s.states[e.state]?.motion ?? "inherit", ["inherit", "repeat", "change", "off"], "Package state rule. Safety gates still stop motion while typing, during blocking dialogs, or with global motion off.", value => { if (value === "inherit") delete state().motion; else state().motion = value as "repeat" | "change" | "off"; }),
    color(`Border when ${e.state}`, s.states[e.state]?.borderColor ?? s.borderColor, value => { state().borderColor = value; }),
    color(`Text when ${e.state}`, s.states[e.state]?.textColor ?? s.textColor, value => { state().textColor = value; }, "body"),
    color(`Active text when ${e.state}`, s.states[e.state]?.activeColor ?? s.activeColor, value => { state().activeColor = value; }, "active"),
    color(`Title when ${e.state}`, s.states[e.state]?.labelColor ?? s.labelColor, value => { state().labelColor = value; }, "title"),
    color(`Counts when ${e.state}`, s.states[e.state]?.metadataColor ?? s.metadataColor, value => { state().metadataColor = value; }, "summary"),
    color(`Highlight when ${e.state}`, s.states[e.state]?.highlightColor ?? s.highlightColor, value => { state().highlightColor = value; }),
    { label: `Reset ${e.state} overrides`, value: "Reset", help: "Return this state's border, text and motion overrides to package defaults. Undo restores them.", activate: () => e.change(() => {
      delete s.states[e.state]; if (e.state === "blocked") s.states.blocked = { borderColor: "warning" }; if (e.state === "error") s.states.error = { borderColor: "error" };
    }) },
  ];
}
