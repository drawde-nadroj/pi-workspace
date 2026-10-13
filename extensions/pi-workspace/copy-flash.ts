import type { Theme } from "@earendil-works/pi-coding-agent";
import { frameRows } from "../../lib/frame.ts";
import { parseColor } from "@earendil-works/pi-tui";

/** Pi 1.0 fullscreen flash adapter. Pi owns entries, copying, timers and placement.
 * Only decorate the exact native success row; drift and small screens stay native.
 * No input handler, overlay, preference, clipboard access or additional timer.
 */
export function installCopyFlashFrame(ui: unknown, theme: () => Theme): () => void {
  const noop = () => {};
  try {
    const host = ui as { flashes?: { render?: (width: number) => string[] }; terminal?: { rows?: number } };
    const flashes = host?.flashes;
    if (!flashes || typeof flashes.render !== "function") return noop;
    const original = flashes.render;
    let active = true;
    const render = function (this: typeof flashes, width: number): string[] {
      const rows = original.call(this, width);
      if (!active || !Number.isInteger(width) || width < 11 || !Array.isArray(rows)) return rows;
      const success = "\x1b[7m Copied! \x1b[27m";
      const count = rows.filter(row => row === success).length;
      const height = host.terminal?.rows;
      if (!count || typeof height !== "number" || rows.length + count * 2 > height) return rows;
      try {
        const current = theme();
        const framed = frameRows({ theme: current, width: 11, rows: [current.fg("text", " Copied! ")], color: parseColor(current.appearance === "light" ? "#707070" : "#909090") });
        return rows.flatMap(row => row === success ? framed : [row]);
      } catch { return rows; }
    };
    flashes.render = render;
    return () => {
      active = false;
      if (flashes.render === render) flashes.render = original;
    };
  } catch { return noop; }
}
