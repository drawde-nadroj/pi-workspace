import type { Theme } from "@earendil-works/pi-coding-agent";
import { parseColor, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { frameRows, statusPreset } from "../../lib/frame.ts";
import { compactToolStatus } from "./tool-status.ts";
import { composerSurface, quietFrameLabel } from "./composer-style.ts";
import { matchedToolStatus, toolIdentity, transcriptDefaults, type TranscriptAppearance } from "./transcript-presentation.ts";

// Explicit allowlist: other extensions' custom renderers remain their own.
// If pi-web-access renames a tool, leave it native until the mapping is updated.
const WEB_TOOLS = new Map([
  ["web_search", "Search"], ["fetch_content", "Fetch"], ["get_search_content", "Stored content"],
]);
export const isWebTool = (name: string): boolean => WEB_TOOLS.has(name);
type Result = { content?: { type: string }[]; isError?: boolean; details?: unknown };
type WebMeta = {
  toolName: string; result?: Result; isPartial?: boolean; expanded?: boolean; hideComponent?: boolean;
  toolDefinition?: { renderShell?: string; renderCall?: unknown; renderResult?: unknown };
  callRendererComponent?: Component; resultRendererComponent?: Component;
};
const hasGraphics = (rows: string[]) => rows.some(row => /\x1b(?:_G|\]1337;File=|P)/.test(row));

/** Consume Pi's already-created custom renderer components, not tool results or
 * registrations. Failure/unknown private shapes fall back to the original UI.
 * This adapter is intentionally scoped to Pi 1.0's ToolExecutionComponent. */
export function renderWebToolFrame(meta: WebMeta, theme: Theme, width: number, native: string[], labels: "semantic" | "matched" = "semantic", appearance?: TranscriptAppearance): string[] | undefined {
  const label = WEB_TOOLS.get(meta.toolName);
  if (!label || width < 24 || meta.hideComponent || !native.length || hasGraphics(native) ||
    meta.toolDefinition?.renderShell === "self" || !meta.toolDefinition?.renderCall || !meta.toolDefinition?.renderResult ||
    meta.result?.content?.some(content => content.type !== "text")) return undefined;
  const call = meta.callRendererComponent, result = meta.resultRendererComponent;
  if (!call || typeof call.render !== "function" || (meta.result && (!result || typeof result.render !== "function"))) return undefined;
  const inner = width - 4;
  let body: string[];
  try {
    const callRows = call.render(inner);
    const resultRows = meta.result ? result!.render(inner) : [];
    body = [...callRows, ...resultRows];
  } catch { return undefined; }
  if (!body.length || hasGraphics(body) || body.some(row => visibleWidth(row) > inner)) return undefined;
  const error = meta.result?.isError === true;
  const details = meta.result?.details && typeof meta.result.details === "object"
    ? meta.result.details as { cancelled?: boolean; aborted?: boolean } : undefined;
  const state = !meta.result || meta.isPartial ? "running" : details?.cancelled || details?.aborted
    ? "cancelled" : error ? "failed" : "returned";
  const status = statusPreset({ state, appearance: theme.appearance });
  const color = state === "failed" ? theme.colors.error : state === "cancelled" ? parseColor(status.color as string)
    : parseColor(theme.appearance === "light" ? "#a6acb8" : "#46505a");
  const labelText = compactToolStatus(state);
  const text = ` ${status.marker}${labelText ? ` ${labelText}` : ""} `;
  const fallback = transcriptDefaults();
  const style = appearance ?? { ...fallback, tools: { ...fallback.tools, status: labels } };
  return frameRows({ theme, width, rows: body, inset: 1, color,
    corners: { topLeft: toolIdentity(theme, ` Web · ${label} `, color, style),
      topRight: quietFrameLabel(theme, meta.result ? meta.expanded ? " ▾ " : " ▸ " : "", color),
      bottomRight: matchedToolStatus(style, state === "failed" || state === "cancelled") ? quietFrameLabel(theme, text, color)
        : theme.style(text, { fg: parseColor(status.color as string) }) },
    surface: (text, cells) => composerSurface(theme, text, cells) });
}
