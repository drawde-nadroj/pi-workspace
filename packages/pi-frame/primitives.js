import { mixColors, parseColor, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const toColor = value => typeof value === "string" && value.startsWith("#") ? parseColor(value) : value;
const fit = (value, width) => truncateToWidth(value, Math.max(0, width), "…");
const ink = (theme, glyph, color, bold = false) => color && theme?.style ? theme.style(glyph, { fg: toColor(color), bold }) : glyph;
const cover = (row, width, surface) => surface ? surface(row, width) : row + " ".repeat(Math.max(0, width - visibleWidth(row)));

/** Optional, Pi-independent presentation preset. The caller owns state detection and rerenders. */
export function statusPreset({ state = "observed", appearance = "dark", attention = false, markers = {}, colors = {}, labels = {} }) {
  const tone = state === "failed" ? "failed" : state === "cancelled" || attention ? "attention"
    : state === "returned" ? "returned" : state === "running" ? "running" : "quiet";
  const symbol = state === "failed" ? "failed" : state === "cancelled" ? "cancelled"
    : attention ? "attention" : state === "returned" ? "returned" : state === "running" ? "running" : "quiet";
  const palette = appearance === "light"
    ? { failed: "#b4233b", attention: "#895600", returned: "#187444", running: "#096caf", quiet: "#636975" }
    : { failed: "#ff879b", attention: "#efc16c", returned: "#8ed6a7", running: "#80caff", quiet: "#a2a9b5" };
  const defaults = { failed: "×", cancelled: "■", attention: "!", returned: "✓", running: "◉", quiet: "·" };
  return { marker: markers[symbol] ?? defaults[symbol], color: colors[tone] ?? palette[tone], label: labels[state] ?? state };
}

/** Draw a single rail. Labels may contain ANSI styling; every position is optional. */
export function frameRail({ theme, width, left = "", center = "", right = "", side = "top", color, textColor, surface }) {
  width = Math.max(0, Math.floor(width));
  if (width < 4) return cover(fit(left, width), width, surface);
  const inner = width - 2;
  const label = text => textColor ? ink(theme, text, textColor) : text;
  const rule = count => ink(theme, "─".repeat(count), color);
  let content;
  if (center) {
    // Center stays centered in terminal cells, even when the two side labels differ.
    // Side labels yield first; a caller can omit low-priority hints at small widths.
    center = fit(center, inner);
    const start = Math.floor((inner - visibleWidth(center)) / 2);
    const end = start + visibleWidth(center);
    left = fit(left, Math.max(0, start - (start > 0 ? 1 : 0)));
    right = fit(right, Math.max(0, inner - end - (end < inner ? 1 : 0)));
    content = label(left) + rule(start - visibleWidth(left)) + label(center)
      + rule(inner - end - visibleWidth(right)) + label(right);
  } else {
    right = fit(right, Math.max(0, inner - 2));
    left = fit(left, inner - visibleWidth(right));
    content = label(left) + rule(Math.max(0, inner - visibleWidth(left) - visibleWidth(right))) + label(right);
  }
  return cover(ink(theme, side === "top" ? "╭" : "╰", color) + content
    + ink(theme, side === "top" ? "╮" : "╯", color), width, surface);
}

/** Frame pre-rendered content without taking over its input, mouse, or focus. */
export function frameRows({ theme, width, rows, corners = {}, color, textColor, inset = 0, minWidth = 4, surface, motion }) {
  width = Math.max(0, Math.floor(width));
  if (width < minWidth || width < 4) return rows.map(row => cover(fit(row, width), width, surface));
  inset = Math.max(0, Math.min(Math.floor(inset), Math.floor((width - 4) / 2)));
  const inner = width - 2 - 2 * inset;
  const content = rows.map(row => cover(
    ink(theme, "│", color) + " ".repeat(inset) + cover(fit(row, inner), inner, surface)
      + " ".repeat(inset) + ink(theme, "│", color), width, surface));
  const result = [frameRail({ theme, width, left: corners.topLeft, center: corners.topCenter, right: corners.topRight, color, textColor, surface }),
    ...content, frameRail({ theme, width, left: corners.bottomLeft, center: corners.bottomCenter, right: corners.bottomRight, side: "bottom", color, textColor, surface })];
  return motion?.active ? paintFramePerimeter(result, { theme, width, bottom: result.length - 1, color, ...motion, surface }) : result;
}

/** Recolor only border glyphs of an existing frame. Does not move or edit content. */
export function paintFramePerimeter(rows, { theme, width, bottom = rows.length - 1, color, accent, active = false, now = 0, startAt = 0, periodMs = 3000, quiet = false, intensity = 1, direction = "clockwise", effect = "shimmer", surface } = {}) {
  if (!active || width < 4 || bottom < 1 || !accent) return rows;
  periodMs = Number.isFinite(periodMs) && periodMs > 0 ? periodMs : 3000;
  intensity = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 1;
  if (!Number.isFinite(now) || !Number.isFinite(startAt)) return rows;
  const perimeter = 2 * (width - 1 + bottom);
  const phase = ((now - startAt) % periodMs + periodMs) % periodMs / periodMs;
  const head = (direction === "counterclockwise" ? 1 - phase : phase) * perimeter;
  const paint = (glyph, x, y) => {
    const position = y === 0 ? x : x === width - 1 ? width - 1 + y : y === bottom ? 2 * (width - 1) + bottom - x : perimeter - y;
    const sign = direction === "counterclockwise" ? -1 : 1;
    const behind = (sign * (head - position) + perimeter) % perimeter;
    const ahead = (sign * (position - head) + perimeter) % perimeter;
    const strength = (effect === "pulse" ? .5 - .5 * Math.cos(phase * 2 * Math.PI)
      : Math.max(Math.exp(-behind / 12), Math.exp(-ahead * ahead / 5))) * (quiet ? .4 : 1) * intensity;
    // Theme style accepts concrete color values. The caller controls color and refresh scheduling.
    const glow = color ? mixColors(toColor(color), toColor(accent), strength) : accent;
    return ink(theme, glyph, glow, !quiet && strength > .7);
  };
  return rows.map((row, y) => {
    if (y > bottom) return row;
    if (y === 0 || y === bottom) {
      return cover(row.replace(/[╭╮╰╯─]/g, (glyph, offset) => paint(glyph, visibleWidth(row.slice(0, offset)), y)), width, surface);
    }
    const first = row.indexOf("│"), last = row.lastIndexOf("│");
    if (first < 0 || last <= first) return row;
    return cover(row.slice(0, first) + paint("│", 0, y) + row.slice(first + 1, last) + paint("│", width - 1, y) + row.slice(last + 1), width, surface);
  });
}
