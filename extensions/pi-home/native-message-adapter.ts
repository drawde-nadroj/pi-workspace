import { AssistantMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

export type NativeMessageNode = UserMessageComponent | AssistantMessageComponent;
export type NativeMessageFacts = { kind: "user"; text: string } | {
  kind: "assistant"; firstVisible?: "thinking" | "text"; timestamp?: number; streaming: boolean;
  calls: ReadonlyArray<{ id: string }>;
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** The only boundary for guarded Pi-native message internals. Read-only facts,
 * not a cast that makes a private host API public. Revalidate on each render so
 * streaming/host shape changes fail back to the original native renderer.
 */
export function nativeMessageFacts(node: Component): NativeMessageFacts | undefined {
  try {
    if (typeof node.render !== "function" || typeof node.invalidate !== "function" || typeof node.handleMouse !== "function") return;
    if (node instanceof UserMessageComponent) {
      const text: unknown = Reflect.get(node, "text");
      return typeof text === "string" ? { kind: "user", text } : undefined;
    }
    if (!(node instanceof AssistantMessageComponent)) return;
    const streaming: unknown = Reflect.get(node, "isStreaming");
    if (typeof streaming !== "boolean" || !Reflect.has(node, "lastMessage")) return;
    const message: unknown = Reflect.get(node, "lastMessage");
    if (message === undefined) return { kind: "assistant", streaming, calls: [] };
    if (!record(message) || message.role !== "assistant" || !Array.isArray(message.content)) return;
    let firstVisible: "thinking" | "text" | undefined;
    const calls: Array<{ id: string }> = [];
    for (const block of message.content as unknown[]) {
      if (!record(block)) return;
      if (block.type === "text" || block.type === "thinking") {
        const value = block.type === "text" ? block.text : block.thinking;
        if (typeof value !== "string") return;
        if (!firstVisible && value.trim()) firstVisible = block.type;
      } else if (block.type === "toolCall") {
        if (typeof block.id !== "string" || typeof block.name !== "string" || !record(block.arguments)) return;
        calls.push({ id: block.id });
      } else return; // Unsupported future content stays native, including graphics.
    }
    const timestamp = typeof message.timestamp === "number" && Number.isFinite(message.timestamp) && message.timestamp > 0 ? message.timestamp : undefined;
    return { kind: "assistant", firstVisible, timestamp, streaming, calls };
  } catch { return; } // Throwing accessors are an incompatible host shape, not an empty message.
}
