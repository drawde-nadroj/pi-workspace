import { highlightCode, type Theme } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { clean } from "./footer-state.ts";

const MAX_CHARS = 256 * 1024, MAX_NODES = 20000, MAX_DEPTH = 48, MAX_ROWS = 2000;
type Value = { kind: "object"; entries: [string, Value][] } | { kind: "array"; items: Value[] } |
  { kind: "string"; value: string } | { kind: "literal"; source: string };
export type Structured = { documents: Value[] };
export const safeText = (text: string) => text.replace(/\r\n?/g, "\n").split("\n").map(line => clean(line.replace(/\t/g, "  "))).join("\n");
export const lineCount = (text: string) => text ? text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").length : 0;

/** Small bounded JSON reader: preserves numeric lexemes AND duplicate keys.
 * No eval, object assignment, coercion of numeric IDs, or recursive string parsing.
 */
function document(source: string, budget: { nodes: number }): Value {
  let pos = 0;
  const space = () => { while (pos < source.length && /[ \t\r\n]/.test(source[pos])) pos++; };
  const fail = (): never => { throw new Error("Not a bounded JSON document"); };
  const string = (): string => {
    if (source[pos] !== '"') return fail();
    const start = pos++;
    while (pos < source.length) {
      if (source[pos] === "\\") { pos += 2; continue; }
      if (source[pos++] === '"') return JSON.parse(source.slice(start, pos)) as string;
    }
    return fail();
  };
  const value = (depth: number): Value => {
    if (depth > MAX_DEPTH || ++budget.nodes > MAX_NODES) return fail();
    space();
    const char = source[pos];
    if (char === '"') return { kind: "string", value: string() };
    if (char === "{" || char === "[") {
      const object = char === "{", end = object ? "}" : "]";
      const entries: [string, Value][] = [], items: Value[] = [];
      pos++; space();
      if (source[pos] !== end) while (true) {
        space();
        if (object) {
          const key = string(); space();
          if (source[pos++] !== ":") return fail();
          entries.push([key, value(depth + 1)]);
        } else items.push(value(depth + 1));
        space();
        if (source[pos] !== ",") break;
        pos++;
      }
      if (source[pos++] !== end) return fail();
      return object ? { kind: "object", entries } : { kind: "array", items };
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(pos));
    if (!match) return fail();
    pos += match[0].length;
    return { kind: "literal", source: match[0] };
  };
  const parsed = value(0); space();
  if (pos !== source.length || !["object", "array"].includes(parsed.kind)) return fail();
  return parsed;
}

/** Only whole object/array documents or complete JSONL are eligible. Mixed logs,
 * partial streams, primitive text, oversized/deep content retain their text view. */
export function parseStructured(text: string): Structured | undefined {
  if (!text.trim() || text.length > MAX_CHARS || !/^\s*[\[{]/.test(text)) return;
  try { return { documents: [document(text, { nodes: 0 })] }; } catch { /* maybe JSONL */ }
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2 || lines.length > 256) return;
  const budget = { nodes: 0 };
  try { return { documents: lines.map(line => document(line, budget)) }; } catch { return; }
}
const entriesOf = (node: Value): [string, Value][] => node.kind === "object" ? node.entries : node.kind === "array" ? node.items.map((item, i) => [`[${i}]`, item]) : [];
const noun = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;
function describe(node: Value): string {
  if (node.kind === "object") return noun(node.entries.length, "field");
  if (node.kind === "array") return noun(node.items.length, "item");
  return node.kind === "literal" ? node.source : safeText(node.value).replace(/\n/g, " ↵ ");
}
function diagnostics(parsed: Structured): [string, Value][] {
  const found: [string, Value][] = [];
  const visit = (node: Value) => {
    for (const [key, child] of entriesOf(node)) {
      const nonempty = child.kind === "literal" ? !["null", "false", "0"].includes(child.source) : child.kind === "string" ? !!child.value : entriesOf(child).length > 0;
      if (/^(?:errors?|warnings?)$/i.test(key) && nonempty) found.push([key, child]);
      visit(child);
    }
  };
  for (const node of parsed.documents) visit(node);
  return found;
}
function diagnosticText(node: Value): string {
  if (node.kind === "string" || node.kind === "literal") return describe(node);
  const entries = entriesOf(node);
  const primary = entries.find(([key]) => /^(?:message|reason|detail)$/i.test(key)) ?? entries[0];
  return primary ? diagnosticText(primary[1]) : describe(node);
}
export function structuredSummary(parsed: Structured): string[] {
  const notes = diagnostics(parsed);
  const summary = parsed.documents.length > 1 ? noun(parsed.documents.length, "JSON record") : `JSON · ${describe(parsed.documents[0])}`;
  // The total makes diagnostics outside the single compact excerpt visible.
  return notes.length ? [`${noun(notes.length, "diagnostic field")} · ${summary}`, `${notes[0][0]}: ${diagnosticText(notes[0][1])}`] : [summary];
}

/** Expanded data is a readable tree, not a serialized transport envelope.
 * Strings are decoded once. A literal backslash-n stays a backslash-n. */
export function renderStructured(parsed: Structured, theme: Theme, width: number): string[] {
  const rows: string[] = [];
  let capped = false;
  const emit = (line: string) => {
    if (rows.length >= MAX_ROWS) { capped = true; return; }
    const wrapped = new Text(line, 0, 0).render(width);
    const room = MAX_ROWS - rows.length;
    rows.push(...wrapped.slice(0, room));
    if (wrapped.length > room) capped = true;
  };
  const render = (node: Value, depth: number, label?: string) => {
    if (rows.length >= MAX_ROWS) { capped = true; return; }
    const indent = " ".repeat(Math.min(depth * 2, Math.max(0, width - 12)));
    const key = label === undefined ? "" : theme.fg("accent", clean(label)) + "  ";
    if (node.kind === "object" || node.kind === "array") {
      const entries = entriesOf(node);
      if (label !== undefined || !entries.length) emit(indent + key + theme.fg("dim", entries.length ? describe(node) : node.kind === "array" ? "[]" : "{}"));
      for (const [name, child] of entries) {
        if (rows.length >= MAX_ROWS) { capped = true; break; }
        const shown = /^[\w$.[\]-]+$/.test(name) ? name : JSON.stringify(name);
        render(child, depth + (label === undefined ? 0 : 1), shown);
      }
    } else if (node.kind === "string" && /[\r\n]/.test(node.value)) {
      if (label !== undefined) emit(indent + key.trimEnd());
      for (const line of safeText(node.value).split("\n")) {
        if (rows.length >= MAX_ROWS) { capped = true; break; }
        emit(indent + "  " + theme.fg("toolOutput", line));
      }
    } else {
      const scalar = node.kind === "string" ? theme.fg("syntaxString", '"' + safeText(node.value) + '"') : theme.fg(/^-?\d/.test(node.source) ? "syntaxNumber" : "syntaxKeyword", node.source);
      emit(indent + key + scalar);
    }
  };
  parsed.documents.forEach((node, index) => {
    if (parsed.documents.length > 1) emit(theme.fg("dim", `Record ${index + 1}`));
    render(node, 0);
    if (index < parsed.documents.length - 1) emit("");
  });
  if (capped) rows.push(...new Text(theme.fg("warning", "Readable view capped · use Raw payload for the full returned text"), 0, 0).render(width));
  return rows;
}
export function codeRows(text: string, language: string | undefined, theme: Theme, width: number): string[] {
  const safe = safeText(text);
  // Avoid expensive syntax work for oversized payloads. Text remains available.
  return new Text(language && safe.length <= MAX_CHARS ? highlightCode(safe, language).join("\n") : theme.fg("toolOutput", safe), 0, 0).render(width);
}
export function compactLines(text: string, limit = 2, tail = false): string[] {
  const lines = safeText(text).split("\n").filter(line => line.trim());
  const diagnostic = lines.find(line => /^(?:\s*)(?:error\b|warning\b|warn\b|fatal\b|panic\b|exception\b|traceback\b|script error\b|npm ERR!)/i.test(line));
  const chosen = tail ? lines.slice(-limit) : lines.slice(0, limit);
  if (diagnostic && !chosen.includes(diagnostic)) chosen[0] = diagnostic;
  return chosen;
}

// Kept as a small public helper for compact view tests and external adapters.
export function jsonPreview(text: string, theme: Theme, width: number): string[] | undefined {
  const parsed = parseStructured(text);
  return parsed && structuredSummary(parsed).map((line, index) => theme.fg(index ? "warning" : "muted", truncateToWidth(line, width, "…")));
}
