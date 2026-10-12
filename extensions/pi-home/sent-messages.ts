import { stripVTControlCharacters } from "node:util";
import { AssistantMessageComponent, UserMessageComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { frameRows } from "../../lib/frame.ts";
import { mixColors, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { composerSurface, userFrameColor } from "./composer-style.ts";
import { clean, type FooterPrefs } from "./footer-state.ts";
import { calendarDay, sentTime, styledSentLabel } from "./sent-metadata.ts";
import { taskFrameColor } from "../../lib/task-frame.ts";
import { activeTranscript, assistantIdentity } from "./transcript-presentation.ts";
import { nativeMessageFacts, type NativeMessageNode as MessageComponent } from "./native-message-adapter.ts";

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
  private presentation?: { prefs?: FooterPrefs; users?: { text: string; timestamp: number }[]; chronomancerDay?: string };
  sync(root: Component & { children?: Component[] }, theme: () => Theme, modelName: () => string = () => "Assistant",
    thinkingMotion?: () => { active: boolean; now: number; startAt: number },
    presentation?: () => { prefs?: FooterPrefs; users?: { text: string; timestamp: number }[]; chronomancerDay?: string }): boolean {
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
    for (const [node, dispose] of this.mounted) if (!found.has(node) || !nativeMessageFacts(node)) { dispose(); this.mounted.delete(node); this.timestamps.delete(node); changed = true; }
    // Associate user components with session messages in transcript order. Repeated
    // identical texts consume distinct entries; synthetic skill blocks have no match.
    this.presentation = presentation?.();
    const users = this.presentation?.users ?? [];
    const taken = new Set<number>();
    for (const node of found) if (node instanceof UserMessageComponent) {
      const facts = nativeMessageFacts(node);
      const index = facts?.kind === "user" ? users.findIndex((entry, i) => !taken.has(i) && entry.text === facts.text) : -1;
      if (index >= 0) { taken.add(index); this.timestamps.set(node, users[index].timestamp); }
      else this.timestamps.delete(node);
    }
    for (const node of found) {
      if (this.mounted.has(node) || !nativeMessageFacts(node)) continue;
      const original = node.render, hadOwn = Object.hasOwn(node, "render");
      const originalMouse = node.handleMouse, hadMouse = Object.hasOwn(node, "handleMouse");
      let active = true, framedWidth = -1, trimmedThinkingSpace = false, removedTop = 0, removedBottom = 0;
      const mouse: typeof node.handleMouse = event => {
        if (!active || framedWidth !== event.width) return originalMouse.call(node, event);
        if (event.x <= 0 || event.x >= event.width - 1 || event.y <= 0 || event.y >= event.height - 1) return undefined;
        return originalMouse.call(node, { ...event, x: event.x - 1, y: event.y - 1 + removedTop, width: event.width - 2, height: event.height - 2 + removedTop + removedBottom });
      };
      const render = (width: number) => {
        framedWidth = -1;
        trimmedThinkingSpace = false; removedTop = 0; removedBottom = 0;
        const facts = nativeMessageFacts(node);
        if (!active || width < 12 || !facts) return original.call(node, width);
        const nativeLines = original.call(node, width - 2);
        if (!nativeLines.length) return nativeLines;
        const firstVisible = facts.kind === "assistant" ? facts.firstVisible : undefined;
        // Pi adds a native leading Spacer(1). Within Home's frame that becomes
        // a redundant empty first row for a thinking-first message. Preserve
        // shell integration's OSC 133 zone marker and the native mouse row.
        trimmedThinkingSpace = firstVisible === "thinking" && nativeLines.length > 1 && !stripVTControlCharacters(nativeLines[0]).trim();
        const density = this.presentation?.prefs?.density ?? "spaced";
        const lines = [...nativeLines];
        if ((trimmedThinkingSpace || density === "compact") && lines.length > 1 && !stripVTControlCharacters(lines[0]).trim()) {
          lines[1] = (lines[0].match(/\x1b]133;A\x07/g) ?? []).join("") + lines[1]; lines.shift(); removedTop++;
        }
        // Native user messages alone append a blank interior row.
        if (node instanceof UserMessageComponent && lines.length > 1 && !stripVTControlCharacters(lines.at(-1)!).trim()) {
          const last = lines.pop()!;
          lines[lines.length - 1] += (last.match(/\x1b]133;[A-Z]\x07/g) ?? []).join("");
          removedBottom++;
        }
        // Image placement is protocol-specific: never prefix graphics payloads.
        if (lines.some(line => /\x1b(?:_G|\]1337;File=|P)/.test(line)) || lines.some(line => visibleWidth(line) > width - 2)) return original.call(node, width);
        framedWidth = width;
        const t = theme(), assistant = node instanceof AssistantMessageComponent;
        const color = assistant ? taskFrameColor(t) : userFrameColor(t);
        const options = this.presentation, style = activeTranscript(options?.prefs);
        const label = truncateToWidth(assistant ? clean(modelName()) || "Assistant" : clean(options?.prefs?.displayName ?? "jordan") || "jordan", width - 6, "…");
        const timestamp = facts.kind === "assistant" ? facts.timestamp : this.timestamps.get(node);
        const now = Date.now();
        const time = style.chat.showSent ? sentTime(timestamp, options?.prefs, now,
          !!options?.chronomancerDay && options.chronomancerDay !== calendarDay(now)) : "";
        const motion = facts.kind === "assistant" && facts.streaming
          ? thinkingMotion?.() : undefined;
        return frameRows({ theme: t, width, rows: lines.map(terminalBackground), color,
          corners: { topLeft: assistant ? assistantIdentity(t, ` ${label} `, color, style) : t.style(` ${label} `, { fg: color, bold: true }),
            [style.chat.sentPosition]: styledSentLabel(t, time, color, assistant ? "quiet" : "user", options?.prefs?.icons) },
          surface: (text, cells) => composerSurface(t, text, cells),
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
