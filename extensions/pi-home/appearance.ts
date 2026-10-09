import { stripVTControlCharacters } from "node:util";
import type { FooterPrefs } from "./footer-state.ts";

export const ELEMENTS = {
  status: "Assistant status", session: "Chat title", sentTime: "Last-send time", directory: "Directory",
  vim: "Vim mode", model: "Model name", thinking: "Thinking level", context: "Context usage", git: "Git status", hint: "Next-step hint",
} as const;
export type ElementId = keyof typeof ELEMENTS;
export const POSITIONS = {
  topLeft: "Input box · top left", topCenter: "Input box · top center", topRight: "Input box · top right",
  bottomLeft: "Input box · bottom left", bottomCenter: "Input box · bottom center", bottomRight: "Input box · bottom right",
  footer1Left: "Footer row 1 · left", footer1Center: "Footer row 1 · center", footer1Right: "Footer row 1 · right",
  footer2Left: "Footer row 2 · left", footer2Center: "Footer row 2 · center", footer2Right: "Footer row 2 · right",
} as const;
export type Position = keyof typeof POSITIONS;
export const STATES = {
  idle: "Before the first run", thinking: "While thinking", responding: "While writing a reply", working: "While working",
  tools: "While tools run", waiting: "While waiting for your answer", done: "When the assistant finishes",
  error: "When a run fails", stopped: "When a run is stopped", interrupted: "After an interrupted run", compacting: "While compacting context",
} as const;
export type AppearanceState = keyof typeof STATES;
export const STATE_TEXT: Record<AppearanceState, string> = {
  idle: "What’s next?", thinking: "Thinking", responding: "Writing reply", working: "Working", tools: "Tools running",
  waiting: "Waiting for you", done: "your turn", error: "Run failed", stopped: "What happened?",
  interrupted: "Previous run incomplete", compacting: "Compacting context",
};
export const COLORS = {
  auto: "Follow the theme", frame: "Match the frame", quiet: "Quieter frame color", accent: "Theme accent",
  text: "Normal text", muted: "Muted text", red: "Red", purple: "Purple", blue: "Blue", cyan: "Cyan", green: "Green", warning: "Amber",
} as const;
export type AppearanceColor = keyof typeof COLORS | `#${string}`;
export interface ElementStyle {
  visible: boolean; position: Position; order: number; text: string; color: AppearanceColor; bold: boolean;
  priority: "low" | "normal" | "high";
}
export interface StateStyle { text?: string; color?: AppearanceColor; frameColor?: AppearanceColor; bold?: boolean }
export interface Appearance {
  version: 1;
  elements: Record<ElementId, ElementStyle>;
  frameColor: AppearanceColor;
  separator: string;
  states: Partial<Record<AppearanceState, StateStyle>>;
}
// Shimmer is a transient render phase, never part of the saved Appearance schema.
export interface AppearancePreview { selected?: ElementId | "frame"; state?: AppearanceState; shimmer?: number }
export interface AppearanceHit { id: ElementId | "frame"; x: number; width: number; position: Position }
const DEFAULT_POSITIONS: Record<ElementId, Position> = {
  status: "topLeft", session: "topCenter", sentTime: "topRight", directory: "bottomLeft", vim: "bottomCenter",
  model: "bottomRight", thinking: "bottomRight", context: "footer2Left", git: "footer1Center", hint: "topRight",
};
export function safeText(value: string, max = 120): string {
  return Array.from(stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")).slice(0, max).join("");
}
export function validColor(value: unknown): value is AppearanceColor {
  return typeof value === "string" && (Object.hasOwn(COLORS, value) || /^#[0-9a-f]{6}$/i.test(value));
}
/** Snapshot legacy switches into the visual layout once; old installations keep their rendering until saved. */
export function appearanceDefaults(p: FooterPrefs): Appearance {
  const elements = {} as Record<ElementId, ElementStyle>;
  for (const [order, id] of (Object.keys(ELEMENTS) as ElementId[]).entries()) {
    const visible = id === "session" ? p.railTitle !== "off" : id === "directory" ? p.railDetails !== "off" && p.directory !== "off"
      : id === "model" ? p.railDetails !== "off" && p.model !== "off" : id === "thinking" ? p.thinking !== "off"
      : id === "context" ? p.composerContext === "on" && p.context !== "off" : id === "git" ? p.git !== "off"
      : id === "hint" ? p.railHint !== "off" : true;
    elements[id] = { visible, position: DEFAULT_POSITIONS[id], order,
      text: id === "sentTime" ? "Sent {value}" : id === "hint" ? "Next: {value}" : "{value}",
      color: id === "sentTime" ? "red" : ["session", "vim"].includes(id) ? "frame" : id === "status" || id === "context" || id === "git" ? "auto" : "quiet",
      bold: id === "session" || id === "vim", priority: ["status", "vim", "thinking"].includes(id) ? "high" : id === "hint" || id === "model" ? "low" : "normal" };
  }
  // Preserve fields deliberately kept in the legacy footer rather than the input border.
  if (p.railTitle === "off" && p.session === "on") Object.assign(elements.session, { visible: true, position: "footer1Left" });
  if (p.railDetails === "off") {
    Object.assign(elements.directory, { visible: p.directory !== "off", position: "footer1Right" });
    Object.assign(elements.model, { visible: p.model !== "off", position: "footer2Right" });
  }
  return { version: 1, elements, frameColor: "accent", separator: " · ", states: {} };
}
export function readAppearance(value: unknown, p: FooterPrefs): Appearance | undefined {
  if (!value || typeof value !== "object" || (value as Appearance).version !== 1) return undefined;
  const raw = value as Appearance, result = appearanceDefaults(p);
  if (validColor(raw.frameColor)) result.frameColor = raw.frameColor;
  if (typeof raw.separator === "string") result.separator = safeText(raw.separator, 8);
  for (const id of Object.keys(ELEMENTS) as ElementId[]) {
    const field = raw.elements?.[id]; if (!field || typeof field !== "object") continue;
    const out = result.elements[id];
    if (typeof field.visible === "boolean") out.visible = field.visible;
    if (Object.hasOwn(POSITIONS, field.position)) out.position = field.position;
    if (Number.isInteger(field.order)) out.order = Math.max(0, Math.min(100, field.order));
    if (typeof field.text === "string") out.text = safeText(field.text);
    if (validColor(field.color)) out.color = field.color;
    if (typeof field.bold === "boolean") out.bold = field.bold;
    if (["low", "normal", "high"].includes(field.priority)) out.priority = field.priority;
  }
  for (const id of Object.keys(STATES) as AppearanceState[]) {
    const field = raw.states?.[id]; if (!field || typeof field !== "object") continue;
    const out: StateStyle = {};
    if (typeof field.text === "string") out.text = safeText(field.text);
    if (validColor(field.color)) out.color = field.color;
    if (validColor(field.frameColor)) out.frameColor = field.frameColor;
    if (typeof field.bold === "boolean") out.bold = field.bold;
    result.states[id] = out;
  }
  return result;
}
export function clonePrefs(p: FooterPrefs): FooterPrefs { return structuredClone(p); }
