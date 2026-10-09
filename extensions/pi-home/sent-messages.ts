import { stripVTControlCharacters } from "node:util";
import { AssistantMessageComponent, UserMessageComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { frameRows } from "../../lib/frame.ts";
import { mixColors, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { composerSurface, quietFrameLabel, userFrameColor } from "./composer-style.ts";
import { clean, stamp, type FooterPrefs } from "./footer-state.ts";
import { taskFrameColor } from "../../lib/task-frame.ts";
type MessageComponent = UserMessageComponent | AssistantMessageComponent;

/** Remove background paint without consuming foreground payloads, OSC links or zones. */
export function terminalBackground(text: string): string {
  return text.replace(/\x1b\[([0-9;:]*)m/g, (escape, params: string) => {
    const parts = params.split(";"), out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const code = Number(parts[i].split(":")[0]);
      if (code === 38 || code === 48 || code === 58) {
        const count = parts[i].includes(":") ? 0 : parts[i + 1] === "2" ? 4 : parts[i + 1] === "5" ? 2 : 0;
        if (code === 48) out.push("49"); else out.push(...parts.slice(i, i + count + 1));
        i += count;
      } else out.push(code >= 40 && code <= 47 || code >= 100 && code <= 107 ? "49" : parts[i]);
    }
    return out.length ? `\x1b[${out.join(";")}m` : escape;
  });
}

/** Instance-only decoration of Pi's exported native user/assistant message components.
 * No message rewriting, duplicate transcript entries, core edits or global patch.
 */
export class SentMessageFrames {
  private mounted = new Map<MessageComponent, () => void>();
  private timestamps = new Map<MessageComponent, number>();
  private presentation?: { prefs?: FooterPrefs; users?: { text: string; timestamp: number }[] };
  sync(root: Component & { children?: Component[] }, theme: () => Theme, modelName: () => string = () => "Assistant",
    thinkingMotion?: () => { active: boolean; now: number; startAt: number },
    presentation?: () => { prefs?: FooterPrefs; users?: { text: string; timestamp: number }[] }): boolean {
    const found = new Set<MessageComponent>(), visited = new Set<Component>();
    const visit = (node: Component, depth: number) => {
      if (visited.has(node) || depth > 16) return;
      visited.add(node);
      if (node instanceof UserMessageComponent || node instanceof AssistantMessageComponent) { found.add(node); return; }
      const children = (node as Component & { children?: Component[] }).children;
      if (Array.isArray(children)) for (const child of children) visit(child, depth + 1);
    };
    visit(root, 0);
    let changed = false;
    for (const [node, dispose] of this.mounted) if (!found.has(node)) { dispose(); this.mounted.delete(node); this.timestamps.delete(node); changed = true; }
    // Associate user components with session messages in transcript order. Repeated
    // identical texts consume distinct entries; synthetic skill blocks have no match.
    this.presentation = presentation?.();
    const users = this.presentation?.users ?? [];
    const taken = new Set<number>();
    for (const node of found) if (node instanceof UserMessageComponent) {
      const index = users.findIndex((entry, i) => !taken.has(i) && entry.text === node.text);
      if (index >= 0) { taken.add(index); this.timestamps.set(node, users[index].timestamp); }
      else this.timestamps.delete(node);
    }
    for (const node of found) {
      if (this.mounted.has(node)) continue;
      const original = node.render, hadOwn = Object.hasOwn(node, "render");
      const originalMouse = node.handleMouse, hadMouse = Object.hasOwn(node, "handleMouse");
      let active = true, framedWidth = -1, trimmedThinkingSpace = false;
      const mouse: typeof node.handleMouse = event => {
        if (!active || framedWidth !== event.width) return originalMouse.call(node, event);
        if (event.x <= 0 || event.x >= event.width - 1 || event.y <= 0 || event.y >= event.height - 1) return undefined;
        return originalMouse.call(node, { ...event, x: event.x - 1, y: event.y - 1 + Number(trimmedThinkingSpace), width: event.width - 2, height: event.height - 2 + Number(trimmedThinkingSpace) });
      };
      const render = (width: number) => {
        framedWidth = -1;
        trimmedThinkingSpace = false;
        if (!active || width < 12) return original.call(node, width);
        const nativeLines = original.call(node, width - 2);
        if (!nativeLines.length) return nativeLines;
        const assistantMessage = node instanceof AssistantMessageComponent ? node.lastMessage : undefined;
        const firstVisible = assistantMessage?.content.find(block =>
          block.type === "thinking" ? !!block.thinking.trim() : block.type === "text" && !!block.text.trim());
        // Pi adds a native leading Spacer(1). Within Home's frame that becomes
        // a redundant empty first row for a thinking-first message. Preserve
        // shell integration's OSC 133 zone marker and the native mouse row.
        trimmedThinkingSpace = firstVisible?.type === "thinking" && nativeLines.length > 1 && !stripVTControlCharacters(nativeLines[0]).trim();
        const lines = trimmedThinkingSpace
          ? [(nativeLines[0].match(/\x1b]133;A\x07/g) ?? []).join("") + nativeLines[1], ...nativeLines.slice(2)]
          : nativeLines;
        // Image placement is protocol-specific: never prefix graphics payloads.
        if (lines.some(line => /\x1b(?:_G|\]1337;File=|P)/.test(line)) || lines.some(line => visibleWidth(line) > width - 2)) return original.call(node, width);
        framedWidth = width;
        const t = theme(), assistant = node instanceof AssistantMessageComponent;
        const color = assistant ? taskFrameColor(t) : userFrameColor(t);
        const label = truncateToWidth(assistant ? clean(modelName()) || "Assistant" : "jordan", width - 6, "…");
        const options = this.presentation;
        const timestamp = assistant ? (node as AssistantMessageComponent).lastMessage?.timestamp : this.timestamps.get(node);
        const time = options?.prefs?.messageTime === "on" && Number.isFinite(timestamp) && timestamp! >= 0
          ? stamp(timestamp, options.prefs.timestamps === "12h" ? "12h" : "24h", Date.now()) : "";
        const motion = assistant && (node as unknown as { isStreaming?: boolean }).isStreaming === true
          ? thinkingMotion?.() : undefined;
        return frameRows({ theme: t, width, rows: lines.map(terminalBackground), color,
          corners: { topLeft: t.style(` ${label} `, { fg: color }),
            bottomRight: time ? assistant ? quietFrameLabel(t, ` Sent ${time} `, color)
              : t.style(` Sent ${time} `, { fg: color }) : "" }, surface: (text, cells) => composerSurface(t, text, cells),
          motion: motion ? { ...motion, accent: mixColors(color, t.colors.text, .35) } : undefined });
      };
      node.render = render; node.handleMouse = mouse; node.invalidate();
      this.mounted.set(node, () => {
        active = false;
        if (node.render === render) {
          if (hadOwn) node.render = original;
          else delete (node as unknown as { render?: unknown }).render;
        }
        if (node.handleMouse === mouse) {
          if (hadMouse) node.handleMouse = originalMouse;
          else delete (node as unknown as { handleMouse?: unknown }).handleMouse;
        }
        node.invalidate();
      });
      changed = true;
    }
    return changed;
  }
  dispose(): void { for (const dispose of this.mounted.values()) dispose(); this.mounted.clear(); this.timestamps.clear(); this.presentation = undefined; }
}
