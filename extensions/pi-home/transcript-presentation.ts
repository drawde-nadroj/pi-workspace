import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { frameRows } from "../../lib/frame.ts";
import { composerRail, composerSurface, quietFrameLabel, userFrameColor } from "./composer-style.ts";
import { taskFrameColor } from "../../lib/task-frame.ts";
import type { FooterPrefs } from "./footer-state.ts";

/** Only presentation metadata: never message content, tool execution or timestamps. */
export interface TranscriptAppearance {
  version: 1;
  chat: { assistantLabel: "matched" | "quiet"; showSent: boolean; sentPosition: "bottomLeft" | "bottomRight" };
  tools: { identity: "matched" | "quiet"; status: "semantic" | "matched" };
}
export type TranscriptElementId = "chatFrame" | "chatIdentity" | "chatSent" | "toolFrame" | "toolIdentity" | "toolStatus";
export interface TranscriptHit { id: TranscriptElementId; x: number; y: number; width: number }
export function transcriptDefaults(prefs?: Pick<FooterPrefs, "messageTime" | "toolLabels">): TranscriptAppearance {
  return { version: 1, chat: { assistantLabel: "matched", showSent: prefs?.messageTime !== "off", sentPosition: "bottomRight" },
    tools: { identity: "quiet", status: prefs?.toolLabels === "matched" ? "matched" : "semantic" } };
}
/** Unknown future versions are read-only in the workspace and remain unmodified on disk. */
export function readTranscript(value: unknown, prefs?: Pick<FooterPrefs, "messageTime" | "toolLabels">): TranscriptAppearance | undefined {
  if (value === undefined) return transcriptDefaults(prefs);
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return undefined;
  const raw = value as { chat?: Record<string, unknown>; tools?: Record<string, unknown> }, result = transcriptDefaults(prefs);
  if (["matched", "quiet"].includes(String(raw.chat?.assistantLabel))) result.chat.assistantLabel = raw.chat!.assistantLabel as TranscriptAppearance["chat"]["assistantLabel"];
  if (typeof raw.chat?.showSent === "boolean") result.chat.showSent = raw.chat.showSent;
  if (["bottomLeft", "bottomRight"].includes(String(raw.chat?.sentPosition))) result.chat.sentPosition = raw.chat!.sentPosition as TranscriptAppearance["chat"]["sentPosition"];
  if (["matched", "quiet"].includes(String(raw.tools?.identity))) result.tools.identity = raw.tools!.identity as TranscriptAppearance["tools"]["identity"];
  if (["semantic", "matched"].includes(String(raw.tools?.status))) result.tools.status = raw.tools!.status as TranscriptAppearance["tools"]["status"];
  return result;
}
export const activeTranscript = (prefs?: FooterPrefs): TranscriptAppearance => readTranscript(prefs?.transcript, prefs) ?? transcriptDefaults();
export function assistantIdentity(theme: Theme, label: string, color: ReturnType<typeof taskFrameColor>, style: TranscriptAppearance) {
  return style.chat.assistantLabel === "quiet" ? quietFrameLabel(theme, label, color) : theme.style(label, { fg: color });
}
export function toolIdentity(theme: Theme, label: string, color: ReturnType<typeof taskFrameColor>, style: TranscriptAppearance) {
  return style.tools.identity === "quiet" ? quietFrameLabel(theme, label, color) : theme.style(label, { fg: color });
}
/** Only successful/non-attention statuses can match the rail; errors keep semantic color and marker. */
export const matchedToolStatus = (style: TranscriptAppearance, failedOrAttention: boolean): boolean => style.tools.status === "matched" && !failedOrAttention;

/** Synthetic facts, never a session message or tool call. Hit regions come from actually rendered labels. */
export function transcriptPreview(theme: Theme, width: number, style: TranscriptAppearance, group: "chat" | "tools"):
  { rows: string[]; hits: TranscriptHit[] } {
  if (width < 24) return { rows: ["Preview needs 24 columns".slice(0, width)], hits: [] };
  const rows: string[] = [], hits: TranscriptHit[] = [];
  const add = (lines: string[], labels: Array<{ id: TranscriptElementId; text: string; y: number }>, frame: TranscriptElementId) => {
    const start = rows.length;
    rows.push(...lines);
    for (const { id, text, y } of labels) {
      const plain = stripVTControlCharacters(lines[y] ?? ""), at = plain.indexOf(text);
      if (at < 1 || plain.indexOf(text, at + 1) !== -1) continue;
      const x = visibleWidth(plain.slice(0, at)), cells = visibleWidth(text);
      if (x + cells < width) hits.push({ id, x, y: start + y, width: cells });
    }
    for (const y of [0, lines.length - 1]) hits.push({ id: frame, x: 0, y: start + y, width });
  };
  if (group === "chat") {
    const user = userFrameColor(theme), assistant = taskFrameColor(theme);
    const userSent = style.chat.showSent ? " Sent 9:41 AM " : "";
    const assistantSent = style.chat.showSent ? " Sent 9:42 AM " : "";
    const userRows = frameRows({ theme, width, rows: ["  Sample user message"], color: user,
      corners: { topLeft: theme.style(" jordan ", { fg: user }), [style.chat.sentPosition]: theme.style(userSent, { fg: user }) },
      surface: (text, cells) => composerSurface(theme, text, cells) });
    add(userRows, [{ id: "chatIdentity", text: " jordan ", y: 0 }, { id: "chatSent", text: userSent, y: userRows.length - 1 }], "chatFrame");
    const assistantRows = frameRows({ theme, width, rows: ["  Sample assistant reply"], color: assistant,
      corners: { topLeft: assistantIdentity(theme, " Assistant ", assistant, style),
        [style.chat.sentPosition]: assistantSent ? quietFrameLabel(theme, assistantSent, assistant) : "" },
      surface: (text, cells) => composerSurface(theme, text, cells) });
    add(assistantRows, [{ id: "chatIdentity", text: " Assistant ", y: 0 }, { id: "chatSent", text: assistantSent, y: assistantRows.length - 1 }], "chatFrame");
  } else {
    const rail = taskFrameColor(theme), heading = " Read  sample.txt ", status = " ✓ returned ";
    const toolRows = [composerRail(theme, width, toolIdentity(theme, heading, rail, style),
      matchedToolStatus(style, false) ? quietFrameLabel(theme, status, rail) : theme.fg("success", status), true, rail),
      composerSurface(theme, "│  Sample tool output  │", width), composerRail(theme, width, "", "", false, rail)];
    add(toolRows, [{ id: "toolIdentity", text: heading, y: 0 }, { id: "toolStatus", text: status, y: 0 }], "toolFrame");
    const failed = " × failed ";
    const failedRows = [composerRail(theme, width, toolIdentity(theme, " Edit  sample.txt ", rail, style), theme.fg("error", failed), true, rail),
      composerSurface(theme, "│  Sample error (not executed)  │", width), composerRail(theme, width, "", "", false, rail)];
    add(failedRows, [{ id: "toolStatus", text: failed, y: 0 }], "toolFrame");
  }
  return { rows, hits };
}
