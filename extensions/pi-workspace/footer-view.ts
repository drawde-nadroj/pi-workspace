import { basename } from "node:path";
import { COMPOSER_ICONS } from "./composer-icons.ts";
import type { ContextUsage, Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, parseColor, sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Color } from "@earendil-works/pi-tui";
import { clean, gitLabel, homePath, type FooterPrefs, type GitState } from "./footer-state.ts";

import { meter, paintMeter, type MotionFrame } from "./footer-effects.ts";

export interface FooterData {
  frame?: MotionFrame;
  cwd: string; model: string; thinking: string; session: string;
  usage?: ContextUsage; git?: GitState; gitUnavailable?: boolean;
}
const nerd: Record<string, string> = COMPOSER_ICONS;
const plain: Record<string, string> = { directory: "dir", git: "git", session: "session", model: "", context: "ctx" };
const accents = {
  dark: { cyan: parseColor("#67d8e8"), violet: parseColor("#c4a7ff"), green: parseColor("#a0d080") },
  light: { cyan: parseColor("#006879"), violet: parseColor("#68409b"), green: parseColor("#406522") },
};
const compactNumber = (n: number) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}m` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
export function middle(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  if (width < 5) return truncateToWidth(text, Math.max(0, width), "…");
  const front = Math.ceil((width - 1) / 3), back = width - front - 1;
  return sliceByColumn(text, 0, front) + "…" + sliceByColumn(text, Math.max(0, visibleWidth(text) - back), visibleWidth(text));
}
export function contextText(p: FooterPrefs, u: ContextUsage | undefined, width: number): string {
  const percent = u?.percent;
  if (percent == null || !Number.isFinite(percent)) return "—";
  const label = `${Math.round(percent)}%`;
  const length = width < 65 ? 5 : 10;
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 100 * length);
  const chars = p.bar === "dots" ? ["●", "○"] : p.bar === "thin" ? ["━", "─"] : ["█", "░"];
  const bar = width < 38 ? "" : (p.effect === "classic" ? chars[0].repeat(filled) + chars[1].repeat(length - filled) : meter(p, percent, length * 2)) + " ";
  const counts = (p.context === "counts" || (p.context === "adaptive" && width >= 110)) && u?.tokens != null && u.contextWindow > 0
    ? ` · ${compactNumber(u.tokens)}/${compactNumber(u.contextWindow)}` : "";
  return bar + label + counts;
}
interface Segment { id: string; text: string; tone?: "error" | "warning" | "success" }
function semanticColor(theme: Theme, id: string) {
  const dark: Record<string, string> = { session: "#c4a7ff", context: "#67d8e8", directory: "#8caed2" };
  const light: Record<string, string> = { session: "#68409b", context: "#006879", directory: "#375e86" };
  const hex = (theme.appearance === "dark" ? dark : light)[id];
  return hex ? parseColor(hex) : theme.colors.text;
}
export function decorateFooterPart(theme: Theme, p: FooterPrefs, part: Segment, index: number, frame?: MotionFrame, override?: Color): string {
  const tone = override ?? part.tone ?? (p.color === "mono" ? "text" : p.color === "semantic" ? semanticColor(theme, part.id) : p.color === "theme" ? "accent" : accents[theme.appearance][p.color]);
  if (part.id === "context") {
    const text = override ? part.text : paintMeter(part.text, theme, p, frame, part.tone === "success" ? undefined : part.tone);
    if (p.shape === "pill") {
      const fg = typeof tone === "string" ? theme.colors[tone] : tone;
      const bg = mixColors(theme.colors.toolPendingBg, fg, theme.appearance === "dark" ? 0.17 : 0.10);
      return theme.style(p.icons === "nerd" ? "\ue0b6" : "(", { fg: bg })
        + theme.style(` ${text} `, { fg, bg })
        + theme.style(p.icons === "nerd" ? "\ue0b4" : ")", { fg: bg });
    }
    part = { ...part, text };
  }
  if (p.style === "powerline") {
    const bg = index % 2 ? theme.colors.selectedBg : theme.colors.toolPendingBg;
    return theme.style(` ${part.text} `, { fg: tone, bg }) + theme.style("", { fg: bg });
  }
  if (p.style === "dashboard") {
    const colors = ["accent", "success", "warning", "text"] as const;
    return theme.style(part.text, { fg: override ?? part.tone ?? (p.color === "theme" ? colors[index % colors.length] : tone), bold: true });
  }
  return theme.style(part.text, { fg: override ?? part.tone ?? (p.color === "theme" && p.style === "quiet" ? "muted" : tone) });
}
/** Allocate columns before adding ANSI; always retain a short context/level at normal pane widths. */
function row(parts: Segment[], p: FooterPrefs, theme: Theme, width: number, frame?: MotionFrame): string {
  if (!parts.length || width <= 0) return "";
  const power = p.style === "powerline";
  const separator = power ? "" : p.style === "structured" ? " │ " : "  ";
  const padding = (s: Segment) => s.id === "context" && p.shape === "pill" ? 4 : power ? 3 : 0;
  const overhead = parts.reduce((n, s) => n + padding(s), 0) + (parts.length - 1) * visibleWidth(separator);
  const budget = Math.max(0, width - overhead);
  const sizes = parts.map(s => visibleWidth(s.text));
  const minima = parts.map(s => Math.min(visibleWidth(s.text), s.id === "thinking" ? 6 : s.id === "context" ? 9 : s.id === "git" && s.tone === "error" ? 9 : 5));
  let total = sizes.reduce((a, b) => a + b, 0);
  while (total > budget) {
    let index = -1, excess = 0;
    sizes.forEach((v, i) => { if (v - minima[i] > excess) { index = i; excess = v - minima[i]; } });
    if (index < 0) { index = sizes.indexOf(Math.max(...sizes)); if (sizes[index] <= 0) break; }
    sizes[index]--; total--;
  }
  const rendered = parts.map((s, i) => {
    let text = s.id === "directory" ? middle(s.text, sizes[i]) : truncateToWidth(s.text, sizes[i], "…");
    // Keep the numeric percentage at the right when its bar/counts have to shrink.
    if (s.id === "context" && visibleWidth(s.text) > sizes[i]) {
      const percentage = s.text.match(/\d+%/)?.[0] ?? "—";
      text = truncateToWidth(percentage, sizes[i], "");
    }
    if (p.style === "structured") text += " ".repeat(Math.max(0, sizes[i] - visibleWidth(text)));
    return decorateFooterPart(theme, p, { ...s, text }, i, frame);
  });
  // The first field anchors left; all remaining fields form a single right-aligned group.
  const used = rendered.reduce((n, s) => n + visibleWidth(s), 0) + (parts.length - 1) * visibleWidth(separator);
  const gap = Math.max(0, width - used);
  const line = rendered.map((s, i) => (i ? (i === 1 ? " ".repeat(gap) : "") + theme.fg("dim", separator) : "") + s).join("");
  return truncateToWidth(line, width, "");
}
export function footerRows(p: FooterPrefs, d: FooterData, theme: Theme, width: number): string[] {
  if (width <= 0) return [];
  const icons = p.icons === "nerd" ? nerd : plain;
  const field = (id: string, text: string, tone?: Segment["tone"]): Segment => ({ id, text: `${icons[id] ? icons[id] + " " : ""}${clean(text)}`, tone });
  const fields: Record<string, Segment | undefined> = {};
  if (p.directory !== "off") fields.directory = field("directory", p.directory === "folder" ? basename(d.cwd) || d.cwd : homePath(d.cwd));
  if (p.session === "on") fields.session = field("session", d.session || "Untitled session");
  if (p.git !== "off") {
    if (d.git) {
      // Put conflict count first so a long branch cannot hide it.
      const g = { ...d.git, branch: middle(d.git.branch, width < 80 ? 14 : 30) };
      const text = gitLabel(g, p, width < 75);
      fields.git = field("git", g.conflicts ? `!${g.conflicts} ${text.replace(` !${g.conflicts}`, "")}` : text, g.conflicts ? "error" : p.color === "semantic" ? g.staged + g.changed + g.untracked > 0 ? "warning" : "success" : undefined);
    } else if (d.gitUnavailable) fields.git = field("git", "—", "warning");
  }
  if (p.model === "on") fields.model = field("model", d.model || "no model");
  if (p.thinking === "on") fields.thinking = field("thinking", d.thinking);
  if (p.context !== "off") fields.context = field("context", contextText(p, d.usage, width),
    (d.usage?.percent ?? 0) >= 90 ? "error" : (d.usage?.percent ?? 0) >= 75 ? "warning" : undefined);
  const collect = (order: string) => order.split(",").map(k => fields[k]).filter((s): s is Segment => !!s);
  if (p.layout === "paired") {
    const left = [collect("session"), collect("context")];
    const center = collect("git"), right = [collect("directory"), collect("model,thinking")];
    const natural = (parts: Segment[]) => parts.reduce((n, s) => n + visibleWidth(s.text) + (s.id === "context" && p.shape === "pill" ? 4 : p.style === "powerline" ? 3 : 0), 0) + Math.max(0, parts.length - 1) * 3;
    const hasLeft = left.some(x => x.length), hasRight = right.some(x => x.length);
    const gaps = 2 * (Number(hasLeft) + Number(hasRight) + Number(!!center.length) - 1);
    const usable = Math.max(0, width - Math.max(0, gaps));
    let r = hasRight ? Math.min(Math.max(...right.map(natural)), Math.floor(usable * 0.35)) : 0;
    let c = center.length ? Math.min(natural(center), Math.floor(usable * 0.30)) : 0;
    let l = Math.max(0, usable - r - c);
    if (!hasLeft) { c += l; l = 0; }
    // Shared column widths keep directory and model at the same starting column.
    const cell = (parts: Segment[], size: number) => {
      const text = row(parts, p, theme, size, d.frame);
      return text + " ".repeat(Math.max(0, size - visibleWidth(text)));
    };
    return [0, 1].map(i => truncateToWidth([
      ...(hasLeft ? [cell(left[i], l)] : []),
      ...(center.length ? [cell(i === 0 ? center : [], c)] : []),
      ...(hasRight ? [cell(right[i], r)] : []),
    ].join("  "), width, ""));
  }
  return [row(collect(p.topOrder), p, theme, width, d.frame), row(collect(p.bottomOrder), p, theme, width, d.frame)];
}
export function timingRows(parts: string[], theme: Theme, width: number): string[] {
  if (width <= 0 || !parts.length) return [];
  // Timing gets up to two rows in narrow panes; prioritize run state rather than cutting a number mid-field.
  const text = parts.join(" · ");
  return wrapTextWithAnsi(theme.fg("muted", text), Math.max(1, width)).slice(0, 2).map(s => truncateToWidth(s, width, ""));
}
