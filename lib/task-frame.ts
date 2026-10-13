import type { Theme } from "@earendil-works/pi-coding-agent";
import { frameRows } from "./frame.ts";
import { truncateToWidth, type Color } from "@earendil-works/pi-tui";

/** Keep Tasks and assistant transcript frames on the active Pi accent. */
export function taskFrameColor(theme: Theme): Color { return theme.colors.accent; }

export function taskFrame(theme: Theme, width: number, rows: string[], title = "Tasks", detail = ""): string[] {
  const color = taskFrameColor(theme);
  if (width < 12) return rows.map(row => truncateToWidth(row, Math.max(0, width), "…"));
  return frameRows({ theme, width, rows, color,
    corners: { topLeft: theme.style(` ${title} `, { fg: color }),
      topRight: detail ? theme.fg("muted", ` ${detail} `) : "" } });
}
