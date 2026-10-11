import { AssistantMessageComponent, ToolExecutionComponent, createReadToolDefinition, createWriteToolDefinition, createGrepToolDefinition, createFindToolDefinition, createLsToolDefinition, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, parseColor, truncateToWidth, visibleWidth, type Component, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { frameRows, statusPreset } from "../../lib/frame.ts";
import { toolLocation } from "./activity-blocks.ts";
import { compactToolStatus } from "./tool-status.ts";
import { composerSurface } from "./composer-style.ts";
import type { FooterPrefs } from "./footer-state.ts";
import { sentTime, styledSentLabel } from "./sent-metadata.ts";
import { taskFrameColor } from "../../lib/task-frame.ts";
import { terminalBackground } from "./sent-messages.ts";
import { activeTranscript, toolIdentity } from "./transcript-presentation.ts";

// An explicit, conservative Pi 1.0 allowlist. Self-renderers and overrides of
// these names are not ordinary calls; they keep their own terminal surface.
const ORDINARY = new Map(Object.entries({ read: createReadToolDefinition(""), write: createWriteToolDefinition(""),
  grep: createGrepToolDefinition(""), find: createFindToolDefinition(""), ls: createLsToolDefinition("") }));
type ToolMeta = { toolName?: string; toolCallId?: string; args?: unknown; cwd?: string; expanded?: boolean; toolDefinition?: { renderShell?: string; renderCall?: unknown; renderResult?: unknown }; result?: { isError?: boolean; details?: unknown; content?: { type: string }[] } };
const graphics = (rows: string[]) => rows.some(row => /\x1b(?:_G|\]1337;File=|P)/.test(row));
function ordinary(node: Component | undefined, id: string): node is ToolExecutionComponent {
  if (!(node instanceof ToolExecutionComponent)) return false;
  const meta = node as unknown as ToolMeta;
  // Shell renderers close over each definition and cannot be identity-checked;
  // leave bash/powershell native rather than absorb an unknown override.
  const expected = ORDINARY.get(meta.toolName ?? "");
  return meta.toolCallId === id && !!expected && meta.toolDefinition?.renderShell !== "self" &&
    !meta.result?.content?.some(c => c.type !== "text") &&
    meta.toolDefinition?.renderCall === expected.renderCall && meta.toolDefinition?.renderResult === expected.renderResult;
}

class ToolGroup extends Container {
  private framedWidth = -1;
  private rows: string[] = [];
  private offsets: { child: ToolExecutionComponent; start: number; height: number }[] = [];
  constructor(readonly owner: AssistantMessageComponent, readonly ids: string[],
    private theme: () => Theme, private prefs: () => FooterPrefs | undefined, private fullDate: () => boolean) { super(); }
  // Pi 1.0's Ctrl+O scans direct chat children for setExpanded. Forward it to
  // the original tools so keyboard expansion still works after reparenting.
  setExpanded(expanded: boolean): void {
    for (const child of this.children) (child as ToolExecutionComponent).setExpanded(expanded);
  }
  override render(width: number): string[] {
    this.framedWidth = -1;
    this.offsets = [];
    const message = (this.owner as unknown as { lastMessage?: { content?: { type: string; id?: string }[] } }).lastMessage;
    const issued = message?.content?.filter(c => c.type === "toolCall").map(c => c.id);
    if (width < 28 || !issued || this.ids.some((id, i) => issued[i] !== id) ||
      this.children.some((node, i) => !ordinary(node, this.ids[i]))) return super.render(width);
    const inner = width - 2;
    const rows: string[] = [];
    const offsets: typeof this.offsets = [];
    for (const child of this.children) {
      const meta = child as unknown as ToolMeta & { isPartial?: boolean; executionStarted?: boolean };
      const native = child.render(inner);
      const call = (child as unknown as { callRendererComponent?: Component }).callRendererComponent?.render(inner - 2);
      // Pi's native file/search shell has a spacer, one padding row and one
      // call row. Never discard a multi-line or special call renderer.
      const title = call?.[0]?.replace(/\x1b\[[0-9;]*m/g, "").trim() ?? "";
      if (native.length < 4 || native[0] !== "" || call?.length !== 1 ||
        !title.startsWith(`${meta.toolName} `) || /^read (?:resource|docs)\b/.test(title) ||
        visibleWidth(native[2] ?? "") > inner) return super.render(width);
      const details = meta.result?.details as { cancelled?: boolean; aborted?: boolean } | undefined;
      const state = meta.result ? meta.isPartial ? "running" : details?.cancelled || details?.aborted ? "cancelled"
        : meta.result.isError ? "failed" : "returned" : meta.executionStarted ? "running" : "preparing";
      const { marker, color } = statusPreset({ state, appearance: this.theme().appearance });
      const label = compactToolStatus(state);
      const location = toolLocation(meta.toolName!, meta.args, meta.cwd, 10000);
      const separator = location.indexOf("  ");
      const target = separator < 0 ? "" : location.slice(separator + 2);
      const suffix = label ? ` · ${label}` : "";
      const available = Math.max(0, inner - 4 - meta.toolName!.length - suffix.length);
      const heading = this.theme().style(` ${marker} ${meta.toolName}`, { fg: parseColor(color as string), bold: true })
        + (target && available ? this.theme().fg("accent", ` ${truncateToWidth(target, available - 1, "…")}`) : "")
        + this.theme().style(suffix, { fg: parseColor(color as string) });
      offsets.push({ child: child as ToolExecutionComponent, start: rows.length, height: native.length });
      rows.push(heading, ...native.slice(3));
    }
    if (!rows.length || graphics(rows) || rows.some(row => visibleWidth(row) > inner) ||
      this.children.some(node => (node as unknown as ToolMeta).result?.content?.some(c => c.type !== "text"))) return super.render(width);
    this.framedWidth = width;
    this.rows = rows;
    this.offsets = offsets;
    const theme = this.theme(), color = taskFrameColor(theme);
    const timestamp = (this.owner as unknown as { lastMessage?: { timestamp?: number } }).lastMessage?.timestamp;
    const options = this.prefs(), style = activeTranscript(options);
    const time = style.chat.showSent ? sentTime(timestamp, options, Date.now(), this.fullDate()) : "";
    return frameRows({ theme, width, rows: rows.map(terminalBackground), color,
      corners: { topLeft: toolIdentity(theme, ` Tools · ${this.children.length} calls `, color, style),
        [style.chat.sentPosition]: styledSentLabel(theme, time, color, "quiet", options?.icons) },
      surface: (text, cells) => composerSurface(theme, text, cells) });
  }
  override handleMouse(event: TuiMouseEvent): ReturnType<Container["handleMouse"]> {
    if (this.framedWidth !== event.width) return super.handleMouse(event);
    if (event.x <= 0 || event.x >= event.width - 1 || event.y <= 0 || event.y >= this.rows.length + 1) return undefined;
    const y = event.y - 1;
    const entry = this.offsets.find((item, i) => y >= item.start && y < (this.offsets[i + 1]?.start ?? this.rows.length));
    if (!entry) return undefined;
    const meta = entry.child as unknown as ToolMeta;
    if (y === entry.start && event.type === "click" && event.button === "left" && !event.shift && !event.alt && !event.ctrl && meta.result) {
      entry.child.setExpanded(!meta.expanded);
      return { handled: true, target: { component: entry.child, originX: event.screenX - event.x + 1,
        originY: event.screenY - event.y + 1 + entry.start, width: event.width - 2, height: entry.height - 2 } };
    }
    return entry.child.handleMouse({ ...event, x: event.x - 1, y: y - entry.start + 3,
      width: event.width - 2, height: entry.height });
  }
}

/** Reparent only adjacent native tool components whose IDs belong to one
 * recorded assistant message. Pi continues updating each original component
 * by call ID, and Container dispatches mouse to each child independently. */
export class GroupedTools {
  private groups = new Map<ToolGroup, Container>();
  private members = new WeakSet<ToolExecutionComponent>();
  constructor(private theme: () => Theme, private prefs: () => FooterPrefs | undefined,
    private fullDate: () => boolean = () => false) {}
  isGrouped = (node: ToolExecutionComponent): boolean => this.members.has(node);
  sync(root: Component): boolean {
    let changed = false;
    // If a result becomes graphical or a renderer changes, put the original
    // components back in Pi's chat before rendering them again.
    for (const [group, parent] of this.groups) {
      if (group.children.every((child, i) => ordinary(child, group.ids[i]!))) continue;
      const index = parent.children.indexOf(group);
      if (index >= 0) parent.children.splice(index, 1, ...group.children);
      for (const child of group.children) this.members.delete(child as ToolExecutionComponent);
      this.groups.delete(group); changed = true;
    }
    const visited = new Set<Component>();
    const visit = (node: Component, depth: number) => {
      if (depth > 16 || visited.has(node)) return;
      visited.add(node);
      if (!(node instanceof Container)) return;
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const owner = children[i];
        if (!(owner instanceof AssistantMessageComponent)) continue;
        const message = (owner as unknown as { lastMessage?: { timestamp?: number; content?: { type: string; id?: string }[] } }).lastMessage;
        if (!Number.isFinite(message?.timestamp) || message!.timestamp! < 0) continue;
        const ids = message?.content?.filter(c => c.type === "toolCall").map(c => c.id);
        if (!ids?.length || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) continue;
        let cursor = i + 1, index = 0;
        // Existing group can be extended when later calls arrive during streaming.
        const existing = children[cursor] instanceof ToolGroup && (children[cursor] as ToolGroup).owner === owner
          ? children[cursor] as ToolGroup : undefined;
        if (existing) { index = existing.children.length; cursor++; }
        const additions: ToolExecutionComponent[] = [];
        while (index < ids.length && ordinary(children[cursor], ids[index]!)) {
          additions.push(children[cursor] as ToolExecutionComponent); cursor++; index++;
        }
        if (existing) {
          if (additions.length) {
            children.splice(i + 2, additions.length);
            for (const tool of additions) { existing.addChild(tool); existing.ids.push((tool as unknown as ToolMeta).toolCallId!); this.members.add(tool); }
            changed = true;
          }
        } else if (additions.length >= 2) {
          const group = new ToolGroup(owner, ids.slice(0, additions.length) as string[], this.theme, this.prefs, this.fullDate);
          for (const tool of additions) { group.addChild(tool); this.members.add(tool); }
          children.splice(i + 1, additions.length, group);
          this.groups.set(group, node);
          changed = true;
        }
      }
      for (const child of children) visit(child, depth + 1);
    };
    visit(root, 0);
    for (const [group, parent] of this.groups) {
      if (visited.has(group)) continue;
      // Pi may clear/rebuild the chat container. Never restore old transcript
      // children into a new branch; only flatten a group still mounted here.
      const index = parent.children.indexOf(group);
      if (index >= 0) parent.children.splice(index, 1, ...group.children);
      for (const child of group.children) this.members.delete(child as ToolExecutionComponent);
      this.groups.delete(group);
      changed = true;
    }
    return changed;
  }
  dispose(): void {
    for (const [group, parent] of this.groups) {
      const index = parent.children.indexOf(group);
      if (index >= 0) parent.children.splice(index, 1, ...group.children);
    }
    this.groups.clear(); this.members = new WeakSet();
  }
}
