import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { frameRows } from "../../lib/frame.ts";
import { taskFrameColor } from "../../lib/task-frame.ts";
import { userFrameColor } from "./composer-style.ts";
import { clean, type FooterPrefs } from "./footer-state.ts";
export type GeneralElementId = "identity" | "spacing";
/** Explicitly synthetic message samples. No time, session entry or model call. */
export function generalPreview(theme: Theme, width: number, prefs: FooterPrefs) {
  const name = clean(prefs.displayName), color = userFrameColor(theme);
  const user = frameRows({ theme, width, color, rows: prefs.density === "compact" ? ["Sample message"] : ["", "Sample message"],
    corners: { topLeft: theme.style(` ${name} `, { fg: color, bold: true }) } });
  const assistant = frameRows({ theme, width, color: taskFrameColor(theme), rows: prefs.density === "compact" ? ["Sample reply"] : ["", "Sample reply"],
    corners: { topLeft: theme.style(" Assistant ", { fg: taskFrameColor(theme), bold: true }) } });
  const label = ` ${name} `, plain = stripVTControlCharacters(user[0] ?? ""), offset = plain.indexOf(label);
  const hits: Array<{ id: GeneralElementId; x: number; y: number; width: number }> = [];
  if (offset >= 0 && width >= 4) hits.push({ id: "identity", x: visibleWidth(plain.slice(0, offset)), y: 0, width: visibleWidth(label) });
  return { rows: [...user, ...assistant], hits };
}
