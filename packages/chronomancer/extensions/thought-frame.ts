import { stripVTControlCharacters } from "node:util";
import { UserMessageComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { foregroundAnsi, parseColor, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { frameRows } from "./frame.ts";
import { localDay, type Entry } from "./journal.ts";

// Match Home's default sent-user frame: native message body and zone markers,
// terminal-background interior, speaker at top-left and sourced Sent at bottom-right.
// Only the frame/identity color changes as a thought deepens.
const colors = {
  dark: ["#f0a3b1", "#efa456", "#e9c865", "#83c988", "#8cb9eb"],
  light: ["#a84760", "#9b4e0e", "#786008", "#317438", "#276197"],
};
export function thoughtColor(theme: Theme, depth: number) {
  return parseColor(colors[theme.appearance][Math.max(0, Math.min(depth, 5) - 1)]!);
}

function terminalBackground(text: string): string {
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
function inheritColors(text: string, fg: string, bg: string): string {
  return text.replace(/\x1b\[([0-9;:]*)m/g, (escape, params: string) => {
    const parts = params === "" ? ["0"] : params.split(";");
    let resetFg = false, resetBg = false;
    for (let i = 0; i < parts.length; i++) {
      const code = Number(parts[i].split(":")[0] || 0);
      if (code === 0) { resetFg = true; resetBg = true; }
      else if (code === 39) resetFg = true;
      else if (code === 49) resetBg = true;
      else if (code === 38 || code === 48 || code === 58) {
        if (code === 38) resetFg = false;
        if (code === 48) resetBg = false;
        if (!parts[i].includes(":")) i += parts[i + 1] === "2" ? 4 : parts[i + 1] === "5" ? 2 : 0;
      } else if (code >= 30 && code <= 37 || code >= 90 && code <= 97) resetFg = false;
      else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) resetBg = false;
    }
    return escape + (resetFg ? fg : "") + (resetBg ? bg : "");
  });
}
function surface(theme: Theme, text: string, width: number): string {
  const fg = foregroundAnsi(theme.colors.text, theme.getColorMode()), bg = "\x1b[49m";
  const safe = visibleWidth(text) <= width ? text : truncateToWidth(text, Math.max(0, width), "");
  return fg + bg + inheritColors(safe, fg, bg) + " ".repeat(Math.max(0, width - visibleWidth(safe))) + "\x1b[49m\x1b[39m";
}

/** A silent journal entry is presented as the same native sent-user message frame. */
export function renderThought(entry: Entry & { day: string; visit?: boolean }, theme: Theme, width: number): string[] {
  const native = new UserMessageComponent(entry.body);
  if (width < 12) return native.render(width);
  const lines = native.render(width - 2);
  if (!lines.length || lines.some(line => visibleWidth(line) > width - 2 || /\x1b(?:_G|\]1337;File=|P)/.test(line))) return native.render(width);
  // Match Home's user frame: native messages append one redundant blank row.
  if (lines.length > 1 && !stripVTControlCharacters(lines.at(-1)!).trim()) {
    const last = lines.pop()!;
    lines[lines.length - 1] += (last.match(/\x1b]133;[A-Z]\x07/g) ?? []).join("");
  }
  const color = thoughtColor(theme, entry.depth);
  const actual = new Date(entry.createdAt), actualDay = localDay(actual);
  const fullDate = entry.day !== localDay() || actualDay !== entry.day;
  const clock = actual.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const time = Number.isFinite(actual.getTime()) ? `${fullDate ? `${actualDay} ` : ""}${clock}` : "";
  const sent = time ? theme.style(` \u{f10dd} ${time} `, { fg: color, bold: true }) : "";
  return frameRows({ theme, width, rows: lines.map(terminalBackground), color,
    corners: { topLeft: theme.style(` ${entry.visit ? "↶ " : ""}jordan `, { fg: color, bold: true }), bottomRight: sent },
    surface: (text, cells) => surface(theme, text, cells) });
}
