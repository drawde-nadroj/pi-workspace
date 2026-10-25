import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { parseColor, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { frameRows } from "../../lib/frame.ts";
import { QUEST_PALETTES } from "./surface.ts";
import type { Quest } from "./store.ts";

export type Invitation = { kind: Quest["kind"]; title: string; why: string; firstMove: string; source: string; questId?: string; state?: string };
export type PathInput = { id?: string; kind?: Quest["kind"]; title?: string; why?: string; firstMove?: string; source?: string };
export type Handoff = { presentation: "pi-quests:where-next-v1"; paths: Invitation[] };
export const directionLabel = (kind: string) => kind === "depth" ? "Deepen" : kind === "breadth" ? "Connect" : "Explore";

/** Resolve snapshots, never write records, send messages or schedule another turn. */
export function handoffPaths(inputs: PathInput[] | undefined, get: (id: string) => Quest): Handoff {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 4) throw new Error("Present needs one to four paths; use an existing id or title/why/firstMove/source.");
  const ids = new Set<string>();
  const required = (value: unknown, name: string, max = 4000) => {
    if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Path needs ${name} (1–${max} characters).`);
    return value.trim();
  };
  return { presentation: "pi-quests:where-next-v1", paths: inputs.map(input => {
    if (!input || typeof input !== "object") throw new Error("Path must be an object.");
    if (input.id !== undefined) {
      const id = required(input.id, "id", 100);
      if (Object.keys(input).some(k => k !== "id")) throw new Error("Use an existing id alone; refine its journal record separately.");
      if (ids.has(id)) throw new Error("Present each existing path once.");
      ids.add(id);
      const q = get(id);
      return {questId:q.id,state:q.state,kind:q.kind,title:q.title,why:q.why,firstMove:q.nextMove ?? (["offered","saved"].includes(q.state) ? q.firstMove : "Develop the next step together from recorded progress."),source:q.origin.source};
    }
    const kind = input.kind ?? "exploration";
    if (!["depth","breadth","exploration"].includes(kind)) throw new Error("Unknown path kind.");
    return {kind,title:required(input.title,"title",200),why:required(input.why,"why"),firstMove:required(input.firstMove,"firstMove"),source:required(input.source,"source")};
  }) };
}

// Renderer validation also handles historical/foreign tool details without throwing.
export function isHandoff(value: unknown): value is Handoff {
  if (!value || typeof value !== "object") return false;
  const h = value as Handoff;
  return h.presentation === "pi-quests:where-next-v1" && Array.isArray(h.paths) && h.paths.length > 0 && h.paths.length <= 4 && h.paths.every(p => p && ["depth","breadth","exploration"].includes(p.kind) && [p.title,p.why,p.firstMove,p.source].every(s => typeof s === "string" && s.length > 0 && s.length <= 4000));
}
const clean = (s: string) => stripVTControlCharacters(s).replace(/[\x00-\x1f\x7f-\x9f]/g," ").replace(/\s+/g," ").trim();
export function handoffText(h: Handoff): string {
  return "Where next?\n\n" + h.paths.map(p => `${directionLabel(p.kind)} · ${clean(p.title)}\n${clean(p.why)}\nFirst move: ${clean(p.firstMove)}\nFrom: ${clean(p.source)}${p.questId ? `\nJournal: ${p.questId} · ${p.state}` : "\nConversation only · not saved"}`).join("\n\n");
}

/** Static transcript surface: native expansion, scrolling and selection stay with Pi. */
export function handoffRows(theme: Theme, width: number, h: Handoff, expanded = false): string[] {
  if (width <= 0) return [];
  const framed = width >= 24, inner = Math.max(1, width - (framed ? 4 : 0));
  const palette = QUEST_PALETTES[theme.appearance === "light" ? "light" : "dark"];
  const paint = (s: string, tone: "jade" | "gold", bold = false) => theme.style(s, {fg:parseColor(palette[tone]),bold});
  const rows: string[] = [];
  let shortened = false;
  function prose(value: string, limit: number, style: (s: string) => string) {
    const wrapped = wrapTextWithAnsi(clean(value), inner);
    if (!expanded && wrapped.length > limit) {
      shortened = true;
      wrapped.length = limit;
      wrapped[limit - 1] = truncateToWidth(wrapped[limit - 1], Math.max(0, inner - 1), "") + "…";
    }
    rows.push(...wrapped.map(style));
  }
  if (!framed) rows.push(...wrapTextWithAnsi(paint("Where next?", "jade", true), inner));
  h.paths.forEach((p, i) => {
    if (i) rows.push("");
    prose(directionLabel(p.kind), 1, s => paint(s, p.kind === "breadth" ? "gold" : "jade", true));
    prose(p.title, 2, s => theme.bold(theme.fg("text",s)));
    prose(p.why, 2, s => theme.fg("text",s));
    prose(`First move: ${p.firstMove}`, 2, s => theme.fg("text",s));
    prose(`From: ${p.source}`, 2, s => theme.fg("muted",s));
    prose(p.questId ? `In journal · ${p.state ?? "recorded"}${expanded ? ` · ${p.questId}` : ""}` : "Conversation only · not saved", 1, s => theme.fg("muted",s));
  });
  if (shortened) rows.push(...wrapTextWithAnsi(theme.fg("muted","Expand tool output for full details"),inner));
  if (!framed) return rows.map(s => truncateToWidth(s,width));
  return frameRows({theme,width,inset:1,rows,color:parseColor(palette.jade),corners:{topLeft:paint(" Where next? ","jade",true),topRight:width >= 56 ? paint(" Quests ","jade") : "",bottomLeft:width >= 40 ? theme.fg("muted"," Follow a path in conversation ") : ""}}).map(s => truncateToWidth(s,width));
}
