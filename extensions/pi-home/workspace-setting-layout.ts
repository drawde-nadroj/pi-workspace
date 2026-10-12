import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { STATES } from "./appearance.ts";
import { selectionRow } from "./footer-selection.ts";
import type { Control } from "./workspace-room-types.ts";

// Display vocabulary only: persisted values and internal control identities stay unchanged.
const settingNames: Record<string, string> = {
  "Show this element": "Visible", "Preview appearance": "Preview state", "Label before status": "Prefix",
  "Label before value": "Prefix", "Text for this state": "Status text", "Frame color for this state": "State border color",
  "More options": "Advanced settings", "Move earlier in this position": "Earlier in group", "Move later in this position": "Later in group",
  "Keep space when narrow": "Narrow-screen priority", "Separator between elements": "Group separator",
  "Show sourced Sent time": "Show Sent time", "Assistant name color": "Assistant name color", "Question emphasis": "Text weight",
  "Progress color": "Progress color", "Successful status tone": "Success label color", "Demo state": "Preview state",
  "Cycle duration": "Cycle time", "Highlight intensity": "Highlight strength", "More-work hint position": "Overflow hint position",
  "Your display name": "Your name", "Workspace density": "Spacing", "Question frame is fixed": "Frame color", "Frame colors are fixed": "Frame colors",
};
const values: Record<string, string> = {
  matched: "Match the frame", quiet: "Quieter", semantic: "Status colors", hierarchy: "Quieter progress", inherit: "Use default",
  topLeft: "Top left", topCenter: "Top center", topRight: "Top right", bottomLeft: "Bottom left", bottomCenter: "Bottom center", bottomRight: "Bottom right",
  rail: "Along the border", adaptive: "Automatic", work: "While working", changes: "On progress changes", on: "On", off: "Off",
  clockwise: "Clockwise", counterclockwise: "Counterclockwise", spaced: "Spaced", compact: "Compact", nerd: "Nerd Font", plain: "Plain text",
  muted: "Muted", dim: "Dim", bold: "Bold", normal: "Normal", symbols: "Symbols", labels: "Words", auto: "Automatic",
  "2000": "2 s", "4000": "4 s", "6000": "6 s", "8000": "8 s", "0.25": "25%", "0.45": "45%", "0.65": "65%", "0.85": "85%",
  "Current state (normal settings)": "Live state", "Use normal appearance": "Use default", "Follow the theme": "Theme color",
};
const stateNames: Record<string, string> = { idle: "Idle", thinking: "Thinking", responding: "Writing", working: "Working", tools: "Tools running", waiting: "Waiting for you", done: "Finished", error: "Failed", stopped: "Stopped", interrupted: "Interrupted", compacting: "Compacting" };
for (const [id, label] of Object.entries(STATES)) values[label] = stateNames[id] ?? label;
export const settingName = (label: string) => settingNames[label] ?? label;
export const settingValue = (value: string) => values[value] ?? value;
export const partName = (name: string) => name.startsWith("Sent time · latest user") ? "Sent time" : name;
const labelCells = (width: number) => Math.min(28, Math.max(16, Math.floor(width * .44)));
const clipped = (value: string, width: number) => truncateToWidth(value, Math.max(0, width), "…");
export function settingColumns(width: number): { label: number; gap: number } {
  return { label: labelCells(width), gap: 3 };
}
export function settingHeading(theme: Theme, width: number): string {
  if (width < 42) return theme.fg("muted", "Setting / value");
  const { label, gap } = settingColumns(width - 2);
  return theme.fg("muted", "  Setting" + " ".repeat(Math.max(0, label - 7 + gap)) + "Value");
}
export function settingRow(theme: Theme, control: Control, width: number, options: Parameters<typeof selectionRow>[3]): string {
  const name = settingName(control.label), value = settingValue(control.value) || "None";
  const { label, gap } = settingColumns(width - 2);
  const text = width < 42 ? `${name}: ${value}` : (() => {
    const left = clipped(name, label);
    return left + " ".repeat(Math.max(0, label - visibleWidth(left) + gap)) + theme.fg("muted", value);
  })();
  return selectionRow(theme, (control.readonly ? theme.fg("muted", text + " · fixed") : text), width, options);
}
