import { ToolExecutionComponent, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition, createGrepToolDefinition, createFindToolDefinition, createLsToolDefinition, getLanguageFromPath, renderDiff, type Theme } from "@earendil-works/pi-coding-agent";
import { Text, parseColor, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { statusPreset, type FrameStatus } from "../../lib/frame.ts";
import { homedir } from "node:os";
import { composerRail, composerSurface, quietFrameLabel } from "./composer-style.ts";
import { clean } from "./footer-state.ts";
import { codeRows, compactLines, lineCount, parseStructured, renderStructured, safeText, structuredSummary } from "./output-preview.ts";
import { isWebTool, renderWebToolFrame } from "./web-tool-frames.ts";
import { compactToolStatus } from "./tool-status.ts";
import { matchedToolStatus, toolIdentity, type TranscriptAppearance } from "./transcript-presentation.ts";
// Compare renderer identities, not just the tool name: custom self-rendering
// overrides named "edit" must still keep their own UI. Factory does not execute.
const nativeEdit = createEditToolDefinition("");
const nativeRenderers: Record<string, { renderCall?: unknown; renderResult?: unknown }> = {
  read: createReadToolDefinition(""), write: createWriteToolDefinition(""), edit: nativeEdit,
  // Shell renderer factories create closures per definition, so their function
  // identity is not stable. Self-rendering shell overrides always stay native.
  grep: createGrepToolDefinition(""), find: createFindToolDefinition(""), ls: createLsToolDefinition(""),
};
type VisualState = FrameStatus;
export function toolStateStyle(theme: Theme, state: VisualState, attention = false) {
  const { color, marker } = statusPreset({ state, appearance: theme.appearance, attention });
  // The preset's default palette is hex; Pi's theme.style expects a parsed Color.
  return { color: parseColor(color as string), marker };
}
const BUILTINS = new Set(["read", "edit", "write", "bash", "powershell", "grep", "find", "ls", "codemode"]);
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const str = (value: unknown): string => typeof value === "string" ? value : "";
const shortName = (name: string) => name.split(/[.:/]/).at(-1) ?? name;
const titleName = (name: string) => ({ read: "Read", edit: "Edit", write: "Write", bash: "Bash", powershell: "PowerShell", codemode: "Codemode", grep: "Grep", find: "Find", ls: "List" } as Record<string, string>)[name] ?? clean(name);
function shortPath(path: string, cwd: string): string {
  if (cwd && path.startsWith(cwd.replace(/\/$/, "") + "/")) return clean(path.slice(cwd.replace(/\/$/, "").length + 1));
  return clean(path === homedir() ? "~" : path.startsWith(homedir() + "/") ? "~" + path.slice(homedir().length) : path);
}
export function toolLocation(name: string, args: unknown, cwd = "", limit = 90): string {
  const a = record(args), path = str(a.path) || str(a.file_path);
  let target = path ? shortPath(path, cwd) : clean(str(a.command) || str(a.query) || str(a.url) || str(a.pattern));
  if (shortName(name) === "read" && (typeof a.offset === "number" || typeof a.limit === "number")) {
    const start = typeof a.offset === "number" ? a.offset : 1;
    target += `:${start}${typeof a.limit === "number" ? "–" + (start + a.limit - 1) : ""}`;
  }
  return truncateToWidth(titleName(name) + (target ? "  " + target : ""), limit, "…");
}

type Result = { content?: { type: string; text?: string }[]; details?: unknown; isError?: boolean };
type Meta = {
  toolName: string; toolCallId: string; args?: unknown; expanded?: boolean; executionStarted?: boolean;
  isPartial?: boolean; result?: Result; cwd?: string; hideComponent?: boolean;
  toolDefinition?: { renderShell?: string; renderCall?: unknown; renderResult?: unknown };
  callRendererComponent?: Component; resultRendererComponent?: Component;
};
// Pi 1.0 exports the component, but not metadata accessors. Keep all private reads
// here; unknown shapes and self-rendering tools retain their native UI.
function info(node: ToolExecutionComponent): Meta | undefined {
  const value = node as unknown as Meta;
  return typeof value.toolName === "string" && typeof value.toolCallId === "string" ? value : undefined;
}
type Child = { id?: string; label: string; error?: string; durationMs?: number; cost?: number; state: "running" | "returned" | "failed" | "cancelled" | "observed" };
type Children = { calls: Child[]; omitted: number; version: number };
type Entry = { dispose: () => void; setRaw: (raw: boolean) => void };
const hasGraphics = (rows: string[]) => rows.some(row => /\x1b(?:_G|\]1337;File=|P)/.test(row));
const sourceText = safeText;
const SCRIPT_HEADER = /^Script (?:completed|failed)\nWall time ([\d.]+) seconds\nOutput:\n$/;
function outputText(result?: Result): string {
  return (result?.content ?? []).filter(c => c.type === "text").map(c => str(c.text)).join("\n");
}
function json(value: unknown): string { try { return JSON.stringify(value, null, 2) ?? ""; } catch { return "[Arguments unavailable]"; } }
function phase(meta: Meta): VisualState {
  if (!meta.result || meta.isPartial) return meta.executionStarted ? "running" : "preparing";
  const details = record(meta.result.details);
  if (details.cancelled === true || details.aborted === true) return "cancelled";
  return meta.result.isError ? "failed" : "returned";
}

/** One card per native tool identity. Rendering never executes or re-registers a
 * tool, changes its arguments/results, or moves transcript children. */
export class ActivityBlocks {
  private entries = new Map<ToolExecutionComponent, Entry>();
  private nested = new Map<string, Children>();
  private rawMode = false;
  setOutputMode(raw: boolean): void {
    this.rawMode = raw;
    for (const entry of this.entries.values()) entry.setRaw(raw);
    this.repaint();
  }
  constructor(private theme: () => Theme, private repaint: () => void,
    private labels: () => "semantic" | "matched" = () => "semantic",
    private grouped: (node: ToolExecutionComponent) => boolean = () => false,
    private presentation: () => TranscriptAppearance | undefined = () => undefined,
    private density: () => "spaced" | "compact" = () => "spaced") {}
  record(name: string, args: unknown, parent?: string, id?: string): void {
    if (!parent) return;
    let children = this.nested.get(parent);
    if (!children) {
      if (this.nested.size >= 1024) this.nested.delete(this.nested.keys().next().value!);
      this.nested.set(parent, children = { calls: [], omitted: 0, version: 0 });
    }
    if (children.calls.length < 64) children.calls.push({ id, label: toolLocation(name, args, "", 240), state: "running" });
    else children.omitted++;
    children.version++;
  }
  finish(id: string, parent: string | undefined, error: boolean): void {
    const children = parent ? this.nested.get(parent) : undefined;
    const child = children?.calls.find(call => call.id === id);
    if (children && child) { child.state = error ? "failed" : "returned"; children.version++; }
  }
  clearHistory(): void { this.nested.clear(); }
  sync(root: Component): boolean {
    const found = new Set<ToolExecutionComponent>(), visited = new Set<Component>();
    const visit = (node: Component, depth: number) => {
      if (depth > 16 || visited.has(node)) return;
      visited.add(node);
      if (node instanceof ToolExecutionComponent) { if (info(node)) found.add(node); return; }
      const children = (node as Component & { children?: Component[] }).children;
      if (Array.isArray(children)) for (const child of children) visit(child, depth + 1);
    };
    visit(root, 0);
    let changed = false;
    for (const [node, entry] of this.entries) if (!found.has(node)) { entry.dispose(); this.entries.delete(node); changed = true; }
    for (const node of found) if (!this.entries.has(node)) { this.adopt(node); changed = true; }
    return changed;
  }
  private adopt(node: ToolExecutionComponent): void {
    const original = { render: node.render, handleMouse: node.handleMouse, invalidate: node.invalidate };
    const own = { render: Object.hasOwn(node, "render"), handleMouse: Object.hasOwn(node, "handleMouse"), invalidate: Object.hasOwn(node, "invalidate") };
    let active = true, framedWidth = -1, expandable = false, raw = this.rawMode, rawRow = -1, rawLabelWidth = 0, webRows = 0;
    let cache: { args: unknown; result: unknown; expanded: boolean; width: number; theme: Theme; version: number; state: string; labels: string; rows: string[]; expandable: boolean; rawRow: number } | undefined;
    const render = (width: number): string[] => {
      framedWidth = -1; rawRow = -1; webRows = 0;
      const meta = info(node), definition = meta?.toolDefinition;
      const fallback = () => original.render.call(node, width);
      if (this.grouped(node)) return fallback();
      const expected = meta ? nativeRenderers[meta.toolName] : undefined;
      const customBuiltIn = expected && ((definition?.renderCall && definition.renderCall !== expected.renderCall) || (definition?.renderResult && definition.renderResult !== expected.renderResult));
      const builtInRenderer = !!expected && definition?.renderCall === expected.renderCall && definition?.renderResult === expected.renderResult;
      if (active && meta && !customBuiltIn && isWebTool(meta.toolName)) {
        const native = fallback();
        const web = renderWebToolFrame(meta, this.theme(), width, native, this.labels(), this.presentation());
        if (web) { framedWidth = width; expandable = !!meta.result; webRows = web.length; return web; }
        return native;
      }
      if (!active || !meta || customBuiltIn || width < 24 || meta.hideComponent || (definition?.renderShell === "self" && !builtInRenderer) ||
        ["tasks", "ask_questions", "ask_user_question"].includes(meta.toolName) ||
        (!BUILTINS.has(meta.toolName) && (definition?.renderCall || definition?.renderResult)) ||
        meta.result?.content?.some(c => c.type !== "text")) return fallback();
      // Preserve non-text graphics supplied by another decorator too.
      const native = original.render.call(node, width);
      if (!native.length || hasGraphics(native)) return native;
      const theme = this.theme(), children = this.nested.get(meta.toolCallId), state = phase(meta), expanded = meta.expanded === true;
      const version = children?.version ?? -1;
      const appearance = this.presentation(), labels = appearance?.tools.status ?? this.labels();
      const styleKey = `${appearance?.tools.identity ?? "quiet"}:${labels}:${this.density()}`;
      if (cache && cache.args === meta.args && cache.result === meta.result && cache.expanded === expanded && cache.width === width && cache.theme === theme && cache.version === version && cache.state === state && cache.labels === styleKey) {
        framedWidth = width; expandable = cache.expandable; rawRow = cache.rawRow; return cache.rows;
      }
      const a = record(meta.args), details = record(meta.result?.details), inner = width - 4;
      const error = state === "failed" || state === "cancelled";
      // Persisted Codemode summaries survive reload. Event-only summaries are a
      // bounded fallback and never pretend to contain child result bodies.
      const storedCalls: Child[] | undefined = meta.toolName === "codemode" && Array.isArray(details.calls) ? details.calls.map(value => {
        const call = record(value);
        let args: unknown;
        try { args = JSON.parse(str(call.args)); } catch { /* truncated metadata */ }
        const label = args ? toolLocation(str(call.name), args, meta.cwd, 10000) : clean(str(call.name) + " " + str(call.args));
        const statuses: Record<string, Child["state"]> = { ok: "returned", error: "failed", cancelled: "cancelled", running: "running" };
        return { label, state: statuses[str(call.status)] ?? "observed", error: str(call.error), durationMs: typeof call.durationMs === "number" ? call.durationMs : undefined, cost: typeof call.cost === "number" ? call.cost : undefined };
      }) : undefined;
      const childCalls = storedCalls ?? children?.calls;
      const failures = childCalls?.filter(call => call.state === "failed").length ?? 0;
      const stopped = childCalls?.filter(call => call.state === "cancelled").length ?? 0;
      const unfinished = state === "returned" ? childCalls?.filter(call => call.state === "running").length ?? 0 : 0;
      const attention = failures > 0 || stopped > 0 || unfinished > 0;
      const statusLabel = expanded ? state === "returned" && attention
        ? `returned · ${failures ? `${failures} child errors` : stopped ? `${stopped} child stopped` : `${unfinished} child pending`}` : state
        : compactToolStatus(state, attention ? failures ? `${failures} child errors`
          : stopped ? `${stopped} child stopped` : `${unfinished} child pending` : "");
      const { color, marker: statusMarker } = toolStateStyle(theme, state, attention);
      const body: string[] = [];
      const textRows = (s: string, tone: "muted" | "toolOutput" | "warning" | "error" = "toolOutput") => new Text(theme.fg(tone, sourceText(s)), 0, 0).render(inner);
      const section = (label: string, rows: string[]) => {
        if (!rows.length) return;
        if (this.density() === "spaced" && body.length && body.at(-1) !== "") body.push("");
        if (label) body.push(theme.fg("dim", label));
        body.push(...rows);
      };
      const compact = (lines: string[], tone: "muted" | "toolOutput" | "warning" | "error" = "toolOutput") => {
        for (const line of lines.slice(0, Math.max(0, 2 - body.length))) body.push(theme.fg(tone, truncateToWidth(sourceText(line).replace(/\n/g, " ↵ "), inner, "…")));
      };
      // Only the exact separate native Codemode wrapper is presentation metadata.
      // Never delete a matching-looking line embedded in user/script output.
      let parts = (meta.result?.content ?? []).filter(c => c.type === "text").map(c => str(c.text));
      const wrapper = meta.toolName === "codemode" && parts.length ? SCRIPT_HEADER.exec(parts[0]) : null;
      if (wrapper) parts = parts.slice(1);
      const output = parts.join("\n"), path = str(a.path) || str(a.file_path);
      const language = getLanguageFromPath(path);
      const duration = wrapper && Number.isFinite(Number(wrapper[1])) ? `${Number(wrapper[1]).toFixed(1)}s` : "";
      const headerStatus = width >= 68 && duration ? statusLabel ? `${statusLabel} · ${duration}` : duration : statusLabel;
      const location = toolLocation(meta.toolName, meta.args, meta.cwd, 10000);
      const title = truncateToWidth(location, Math.max(8, width - headerStatus.length - 12), "…");
      const childSummary = childCalls?.length ? [
        `${childCalls.length + (!storedCalls ? children?.omitted ?? 0 : 0)} call${childCalls.length + (!storedCalls ? children?.omitted ?? 0 : 0) === 1 ? "" : "s"}`,
        failures ? `${failures} failed` : "", stopped ? `${stopped} cancelled` : "", unfinished ? `${unfinished} pending` : "",
      ].filter(Boolean).join(" · ") : "";
      if (expanded && raw) {
        section("Raw output", textRows(outputText(meta.result) || "(no text output)"));
        section("Raw arguments", textRows(json(a), "muted"));
        if (meta.result?.details !== undefined) section("Result details", textRows(json(meta.result.details), "muted"));
      } else {
        if (expanded && location !== title && !["bash", "powershell"].includes(meta.toolName)) section("", textRows(location, "muted"));
        if (childSummary) {
          if (!expanded) compact([childSummary], attention ? "warning" : "muted");
          else {
            const calls: string[] = [];
            for (const call of childCalls!) {
              const style = toolStateStyle(theme, call.state);
              const split = call.label.indexOf("  ");
              const name = split < 0 ? call.label : call.label.slice(0, split), target = split < 0 ? "" : call.label.slice(split + 2);
              const extra = [call.state === "returned" ? "" : call.state, call.durationMs === undefined ? "" : call.durationMs < 1000 ? `${Math.round(call.durationMs)}ms` : `${(call.durationMs / 1000).toFixed(1)}s`, call.cost === undefined ? "" : `$${call.cost.toPrecision(3)}`].filter(Boolean).join(" · ");
              const line = theme.style(style.marker, { fg: style.color }) + " " + theme.fg("toolTitle", name) + (target ? "  " + theme.fg("muted", target) : "") + (extra ? theme.fg("dim", " · " + extra) : "");
              calls.push(...new Text(line, 0, 0).render(inner));
              if (call.error) calls.push(...textRows("  " + call.error, "error"));
            }
            section(childSummary, calls);
          }
        }
        if (!expanded) {
          const activeChild = childCalls?.find(call => call.state === "running");
          if (activeChild && (!output || meta.isPartial)) compact([activeChild.label + " · running"], "muted");
          const structured = !meta.isPartial ? parseStructured(output) : undefined;
          if (error) compact(structured ? renderStructured(structured, theme, inner).map(clean).filter(line => line.trim()).slice(0, 2) : compactLines(output || "No error text returned"), state === "cancelled" ? "warning" : "error");
          else if (meta.toolName === "read" && meta.result) compact([`${lineCount(output)} returned lines`], "muted");
          else if (meta.toolName === "write" && typeof a.content === "string") {
            compact([`${lineCount(a.content)} input lines`], "muted");
            const diagnostic = compactLines(output).find(line => /^\s*(?:error|warning|warn|fatal)\b/i.test(line));
            if (diagnostic) compact([diagnostic], "warning");
          } else if (meta.toolName === "edit" && typeof details.diff === "string") {
            const diff = details.diff.split("\n");
            compact([`+${diff.filter(line => /^\+(?!\+\+)/.test(line)).length} −${diff.filter(line => /^-(?!--)/.test(line)).length} lines`], "muted");
          } else if (structured) {
            const summary = structuredSummary(structured);
            compact(summary, summary.length > 1 ? "warning" : "muted");
          }
          else if (meta.toolName === "codemode" && parts.length > 1) compact([`${parts.length} output blocks`], "muted");
          else compact(compactLines(output, 2, ["bash", "powershell", "codemode"].includes(meta.toolName)));
          if (!body.length && !meta.result) compact(["Waiting for output…"], "muted");
          else if (!body.length && meta.result) compact(["No text output"], "muted");
        } else {
          if (meta.toolName === "edit" && !error && typeof details.diff === "string") section("Diff", new Text(renderDiff(sourceText(details.diff), { filePath: path }), 0, 0).render(inner));
          for (let i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            const parsed = !meta.isPartial && (meta.toolName !== "read" || !language || language === "json") ? parseStructured(parts[i]) : undefined;
            const label = error ? state === "cancelled" ? "Stopped" : "Error" : parts.length > 1 ? `Result ${i + 1}` : "";
            section(label, parsed ? renderStructured(parsed, theme, inner) : meta.toolName === "read" && !error ? codeRows(parts[i], language, theme, inner) : textRows(parts[i], error ? "error" : "toolOutput"));
          }
          if (meta.result && !output && !childSummary) section("", textRows("No text output", "muted"));
          // Inputs are rendered by content kind, never as an escaped code string.
          const remaining = { ...a };
          if (["read", "write", "edit", "grep", "find", "ls"].includes(meta.toolName)) {
            delete remaining.path; delete remaining.file_path;
          }
          if (meta.toolName === "edit" && !error && typeof details.diff === "string") {
            delete remaining.edits; delete remaining.oldText; delete remaining.newText;
          }
          if (meta.toolName === "codemode" && typeof a.code === "string") {
            section("Script", codeRows(a.code, "javascript", theme, inner)); delete remaining.code;
          }
          if (["bash", "powershell"].includes(meta.toolName) && typeof a.command === "string") {
            section("Command", codeRows(a.command, meta.toolName === "bash" ? "bash" : "powershell", theme, inner)); delete remaining.command;
          }
          if (meta.toolName === "write" && typeof a.content === "string") {
            section("Input content", codeRows(a.content, language, theme, inner)); delete remaining.content;
          }
          if (Object.keys(remaining).length) {
            const parsed = parseStructured(json(remaining));
            section("Arguments", parsed ? renderStructured(parsed, theme, inner) : textRows(json(remaining), "muted"));
          }
        }
      }
      const notices: string[] = [];
      if (record(details.truncation).truncated === true) notices.push("Output truncated");
      if (details.linesTruncated === true) notices.push("Long result lines truncated");
      for (const [key, label] of [["matchLimitReached", "Match"], ["resultLimitReached", "Result"], ["entryLimitReached", "Entry"]] as const) {
        if (typeof details[key] === "number") notices.push(`${label} limit reached: ${details[key]}`);
      }
      if (typeof details.fullOutputPath === "string") notices.push("Full output: " + details.fullOutputPath);
      if (typeof details.resolvedPath === "string" && details.resolvedPath !== path) notices.push("Resolved path: " + details.resolvedPath);
      const exitCode = details.exitCode ?? details.exit_code;
      if (typeof exitCode === "number" && (expanded || exitCode !== 0)) notices.push("Exit " + exitCode);
      if (!storedCalls && children?.omitted) notices.push(`${children.omitted} child summaries not retained`);
      for (const notice of notices) body.push(...textRows(notice, "warning"));
      expandable = !!meta.result || Object.keys(a).length > 0 || !!childCalls?.length || expanded;
      if (expanded) {
        if (this.density() === "spaced" && body.length) body.push("");
        rawRow = body.length + 1;
        const label = raw ? "‹ Readable view" : "› Raw payload";
        rawLabelWidth = visibleWidth(label);
        body.push(theme.fg("accent", label));
      }
      const disclosure = expandable ? expanded ? "▾ " : "▸ " : "";
      // Status color belongs on the symbol/header, not every successful row/edge.
      const rail = error || attention ? color : parseColor(theme.appearance === "light" ? "#a6acb8" : "#46505a");
      const rows = [composerRail(theme, width, theme.style(` ${statusMarker} `, { fg: color, bold: true })
        + (appearance ? toolIdentity(theme, `${title} `, rail, appearance) : quietFrameLabel(theme, `${title} `, rail)),
        (appearance ? matchedToolStatus(appearance, error || attention) : labels === "matched" && !error && !attention)
          ? quietFrameLabel(theme, ` ${disclosure}${headerStatus} `, rail)
          : theme.style(` ${disclosure}${headerStatus} `, { fg: color, bold: true }), true, rail)];
      for (const line of body) rows.push(composerSurface(theme, theme.style("│", { fg: rail }) + composerSurface(theme, " " + truncateToWidth(line, inner, "…") + " ", width - 2) + theme.style("│", { fg: rail }), width));
      rows.push(composerRail(theme, width, "", "", false, rail));
      framedWidth = width;
      cache = { args: meta.args, result: meta.result, expanded, width, theme, version, state, labels: styleKey, rows, expandable, rawRow };
      return rows;
    };
    const handleMouse: ToolExecutionComponent["handleMouse"] = event => {
      if (!active || framedWidth !== event.width) return original.handleMouse.call(node, event);
      if (event.type === "click" && event.button === "left" && !event.shift && !event.alt && !event.ctrl &&
        info(node)?.expanded && event.y === rawRow && event.x >= 2 && event.x < 2 + rawLabelWidth) {
        raw = !raw; cache = undefined; this.repaint();
        return { handled: true, target: { component: node, originX: event.screenX - event.x, originY: event.screenY - event.y, width: event.width, height: event.height } };
      }
      if (expandable && event.type === "click" && event.button === "left" && !event.shift && !event.alt && !event.ctrl &&
        event.y >= 0 && event.y < (cache?.rows.length ?? webRows) && (event.y === 0 || !info(node)?.expanded)) {
        node.setExpanded(!info(node)?.expanded); cache = undefined; this.repaint();
        return { handled: true, target: { component: node, originX: event.screenX - event.x, originY: event.screenY - event.y, width: event.width, height: event.height } };
      }
      // Expanded text, modified clicks, drags and wheel events stay passive for selection/scrolling.
      return undefined;
    };
    const invalidate = () => { cache = undefined; original.invalidate.call(node); };
    node.render = render; node.handleMouse = handleMouse; node.invalidate = invalidate;
    this.entries.set(node, { setRaw: value => { raw = value; cache = undefined; node.invalidate(); }, dispose: () => {
      active = false; cache = undefined;
      const installed = { render, handleMouse, invalidate };
      const target = node as unknown as Record<string, unknown>;
      for (const key of ["render", "handleMouse", "invalidate"] as const) if (target[key] === installed[key]) {
        if (own[key]) target[key] = original[key]; else delete target[key];
      }
      node.invalidate();
    } });
  }
  dispose(): void { for (const entry of this.entries.values()) entry.dispose(); this.entries.clear(); this.nested.clear(); }
}
