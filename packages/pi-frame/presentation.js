import { mixColors, parseColor } from "@earendil-works/pi-tui";
import { frameRows } from "./primitives.js";

export const FRAME_POSITIONS = ["topLeft", "topCenter", "topRight", "bottomLeft", "bottomCenter", "bottomRight"];
export const FRAME_STATES = ["idle", "working", "waiting", "done", "blocked", "error"];
const paintKeys = ["borderColor", "labelColor", "metadataColor", "textColor", "activeColor", "highlightColor"];
const paints = ["accent", "text", "muted", "warning", "error", "success", "highlight"];
const validPaint = v => typeof v === "string" && (paints.includes(v) || /^#[0-9a-f]{6}$/i.test(v));
const object = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const bounded = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

/** Fresh serializable settings. State rules belong to the package, not its callers. */
export function framePresentationDefaults() {
  return { version: 1, borderColor: "accent", labelColor: "accent", metadataColor: "muted", textColor: "text",
    activeColor: "text", highlightColor: "highlight", labelBold: true, activeBold: true,
    motion: "work", effect: "shimmer", periodMs: 4000, intensity: .65, direction: "clockwise",
    progressSweep: true, textEffect: "none", positions: { title: "topLeft", summary: "topRight", hint: "bottomRight" },
    states: { blocked: { borderColor: "warning" }, error: { borderColor: "error" } } };
}
export function readFramePresentation(value) {
  const raw = object(value), out = framePresentationDefaults();
  if (raw.version !== 1) return out;
  for (const k of paintKeys) if (validPaint(raw[k])) out[k] = raw[k];
  for (const k of ["labelBold", "activeBold", "progressSweep"]) if (typeof raw[k] === "boolean") out[k] = raw[k];
  for (const [k, values] of Object.entries({ motion: ["work", "changes", "off"], effect: ["shimmer", "pulse"], direction: ["clockwise", "counterclockwise"], textEffect: ["none", "labels", "active", "both"] })) {
    if (values.includes(raw[k])) out[k] = raw[k];
  }
  out.periodMs = bounded(raw.periodMs, out.periodMs, 1200, 12000);
  out.intensity = bounded(raw.intensity, out.intensity, 0, 1);
  for (const k of ["title", "summary", "hint"]) if (FRAME_POSITIONS.includes(raw.positions?.[k])) out.positions[k] = raw.positions[k];
  for (const state of FRAME_STATES) {
    const source = object(raw.states?.[state]);
    const style = out.states[state] ?? {};
    for (const k of paintKeys) if (validPaint(source[k])) style[k] = source[k];
    if (["repeat", "change", "off"].includes(source.motion)) style.motion = source.motion;
    if (Object.keys(style).length) out.states[state] = style;
  }
  return out;
}

/** Optional clock/controller. External clock mode schedules nothing; automatic mode owns one bounded timer. */
export function createFrameController({ requestRender = () => {}, automatic = false, now = Date.now,
  schedule = (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; }, cancel = clearTimeout, fps = 25 } = {}) {
  let input, settings = framePresentationDefaults(), last, elapsed = 0, active = false, once = false, timer, disposed = false;
  let previousState, previousRevision, initialized = false, repeatAllowed = false;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const sample = time => {
    if (last !== undefined && active) elapsed += Math.max(0, time - last);
    last = time;
    if (once && elapsed >= settings.periodMs) { once = false; active = repeatAllowed; if (active) elapsed %= settings.periodMs; }
    return { active: active && !disposed, elapsed, progress: Math.min(1, elapsed / settings.periodMs), state: input?.state ?? "idle", once };
  };
  const arm = () => {
    clear();
    if (!automatic || !active || disposed) return;
    timer = schedule(() => { timer = undefined; sample(now()); requestRender(); arm(); }, 1000 / bounded(fps, 25, 1, 30));
  };
  return {
    update(facts, value, time = now()) {
      if (disposed) return sample(time);
      sample(time);
      const changed = initialized && facts.revision !== undefined && facts.revision !== previousRevision;
      const stateChanged = initialized && facts.state !== previousState;
      const wasActive = active;
      input = facts; settings = readFramePresentation(value);
      const rule = settings.states[facts.state]?.motion;
      const allowed = !facts.suspended && !facts.reducedMotion && facts.visible !== false && settings.motion !== "off" && settings.intensity > 0;
      const repeat = rule === "repeat" || !rule && settings.motion === "work" && facts.state === "working";
      repeatAllowed = allowed && rule !== "off" && repeat;
      const trigger = rule !== "off" && (rule === "change" || settings.progressSweep || settings.motion === "changes") && changed && facts.state !== "waiting";
      if (!allowed || rule === "off") { active = false; once = false; elapsed = 0; }
      else if (trigger) { elapsed = 0; active = true; once = true; }
      else if (repeat && !once) { if (!wasActive || stateChanged) elapsed = 0; active = true; }
      else if (once && elapsed < settings.periodMs && !stateChanged) active = true;
      else { once = false; active = repeat; if (active && !wasActive) elapsed = 0; }
      previousRevision = facts.revision; previousState = facts.state; initialized = true;
      arm(); return sample(time);
    },
    sample(time = now()) { const result = sample(time); if (!result.active) clear(); return result; },
    get active() { return active && !disposed; },
    reset() { clear(); input = undefined; last = undefined; initialized = false; active = false; once = false; repeatAllowed = false; elapsed = 0; },
    dispose() { clear(); disposed = true; active = false; },
  };
}

const resolve = (theme, value) => value === "highlight" ? parseColor(theme?.appearance === "light" ? "#29354a" : "#f5f6ff")
  : typeof value === "string" && value.startsWith("#") ? parseColor(value) : theme?.colors?.[value] ?? value;
/** Styles labels and semantic body rows without changing stored content, input state, or cursor coordinates. */
export function presentationRows({ theme, width, rows, title = "", summary = "", hint = "", presentation, frame, inset = 1, surface }) {
  const p = readFramePresentation(presentation), style = { ...p, ...p.states[frame?.state ?? "idle"] };
  const highlight = resolve(theme, style.highlightColor);
  const glow = frame?.active ? (.5 - .5 * Math.cos(2 * Math.PI * frame.elapsed / p.periodMs)) * p.intensity * .5 : 0;
  const ink = (text, color, bold, animate = false) => theme?.style
    ? theme.style(text, { fg: animate && glow ? mixColors(resolve(theme, color), highlight, glow) : resolve(theme, color), bold }) : text;
  const corners = {};
  for (const [key, value, color, bold] of [["title", title, style.labelColor, p.labelBold], ["summary", summary, style.metadataColor, false], ["hint", hint, style.metadataColor, false]]) {
    if (!value) continue;
    const position = p.positions[key];
    const label = ink(` ${value} `, color, bold, ["labels", "both"].includes(p.textEffect));
    corners[position] = (corners[position] ?? "") + label;
  }
  const content = rows.map(row => typeof row === "string" ? ink(row, style.textColor, false) :
    ink(row.text, row.role === "error" ? "error" : row.role === "warning" ? "warning" : row.role === "muted" ? "muted" : row.role === "active" ? style.activeColor : style.textColor,
      row.role === "active" && p.activeBold, row.role === "active" && ["active", "both"].includes(p.textEffect)));
  return frameRows({ theme, width, rows: content, corners, color: resolve(theme, style.borderColor), inset, surface,
    motion: { active: !!frame?.active, now: frame?.elapsed ?? 0, accent: highlight, periodMs: p.periodMs,
      intensity: p.intensity, direction: p.direction, effect: p.effect } });
}
