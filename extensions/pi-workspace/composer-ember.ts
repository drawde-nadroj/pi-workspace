import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, truncateToWidth, visibleWidth, type Color } from "@earendil-works/pi-tui";
import type { AppearanceState } from "./appearance.ts";
import { shouldAnimate, type WorkspaceState } from "./state.ts";

const working = new Set<AppearanceState>(["working", "thinking", "responding", "tools", "compacting"]);
const CELLS = 5;
const WIDTH = 10;
const HEIGHT = 4;
const BRAILLE = [[1, 2, 4, 64], [8, 16, 32, 128]];
const CONVEYOR_SPEEDS = [5.2, 6.4, 7.1, 5.8];
const COLLAPSE_CORNERS = [[0, 0], [9, 0], [0, 3], [9, 3]];
type Scene = "figure-eight" | "conveyor" | "twin-orbit" | "collapse" | "serpentine";
interface GlyphFrame { bits: Uint8Array; heat: Float32Array }

function emptyFrame(): GlyphFrame {
  return { bits: new Uint8Array(CELLS), heat: new Float32Array(CELLS) };
}

/** The only grid writer: snap to the nearest dot, ignore off-canvas, record per-cell heat. */
function dot(frame: GlyphFrame, x: number, y: number, heat = 0): void {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) return;
  const cell = px >> 1;
  frame.bits[cell] |= BRAILLE[px & 1][py];
  if (heat > frame.heat[cell]) frame.heat[cell] = heat;
}

function renderFrame(theme: Theme, frame: GlyphFrame, color: Color): string {
  let out = "";
  for (let cell = 0; cell < CELLS; cell++) {
    const bits = frame.bits[cell];
    if (!bits) { out += " "; continue; }
    const bright = frame.heat[cell] > .72;
    out += theme.style(String.fromCharCode(0x2800 + bits), {
      fg: bright ? mixColors(color, theme.colors.text, .7) : color,
      bold: bright,
    });
  }
  return out;
}

function figureEight(t: number, energy: number): GlyphFrame {
  const frame = emptyFrame();
  const samples = 14 + Math.round(energy * 5);
  for (let k = 0; k < samples; k++) {
    const tt = t - k * .03;
    dot(frame,
      4.5 + 4.1 * Math.sin(tt * 2.1 + .6),
      1.5 + 1.35 * Math.sin(tt * 3.15 + Math.PI / 2),
      k === 0 ? 1 : .8 - (k / samples) * .65);
  }
  return frame;
}

function conveyor(t: number, energy: number): GlyphFrame {
  const frame = emptyFrame();
  for (let row = 0; row < HEIGHT; row++) {
    const head = (t * CONVEYOR_SPEEDS[row] + row * 2.9 + 2.5) % 13;
    const length = 3 - (row % 2) + (energy > .5 ? 1 : 0);
    for (let k = 0; k < length; k++) dot(frame, head - k, row, k === 0 ? 1 : .6 - k * .15);
  }
  return frame;
}

function twinOrbit(t: number, energy: number): GlyphFrame {
  const frame = emptyFrame();
  const samples = 8 + Math.round(energy * 2);
  for (let s = 0; s < 2; s++) {
    const direction = s === 0 ? 1 : -1;
    const a = t * 2.2 * direction + s * Math.PI;
    for (let k = 0; k < samples; k++) {
      const aa = a - k * .11 * direction;
      dot(frame,
        4.5 + Math.cos(aa) * (3.7 + s * .25 + energy * .25),
        1.5 + Math.sin(aa) * (1.15 + s * .15 + energy * .1),
        k === 0 ? 1 : .8 - (k / samples) * .65);
    }
  }
  return frame;
}

function collapse(t: number, energy: number): GlyphFrame {
  const frame = emptyFrame();
  const phase = (t % 2.4) / 2.4;
  const trail = 2 + Math.round(energy * 2);
  for (let i = 0; i < COLLAPSE_CORNERS.length; i++) {
    const [cx, cy] = COLLAPSE_CORNERS[i];
    const p = Math.min(1, Math.max(0, phase * 1.15 - i * .03));
    for (let k = 0; k <= trail; k++) {
      const q = Math.max(0, p - k * .07);
      dot(frame, cx + (4.5 - cx) * q, cy + (1.5 - cy) * q, k === 0 ? .95 : .55 - k * .12);
    }
  }
  if (phase > .86 || energy > .5) {
    for (let dx = 0; dx < 2; dx++) for (let dy = 1; dy < 3; dy++) dot(frame, 4.5 + dx - .5, dy - .5, 1);
  }
  return frame;
}

function serpentPath(): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  for (let y = 0; y < HEIGHT; y++) {
    if (y % 2 === 0) for (let x = 0; x < WIDTH; x++) path.push([x, y]);
    else for (let x = WIDTH - 1; x >= 0; x--) path.push([x, y]);
  }
  return path;
}
const SERPENT_PATH = serpentPath();

function serpentine(t: number, energy: number): GlyphFrame {
  const frame = emptyFrame();
  // The +16 head start exceeds the longest trail (12 + 4), so a fresh run has no wrapped tail.
  const head = (16 + Math.floor(t * 6.5)) % SERPENT_PATH.length;
  const trail = 12 + Math.round(energy * 4);
  for (let k = 0; k < trail; k++) {
    const [x, y] = SERPENT_PATH[(head - k + SERPENT_PATH.length) % SERPENT_PATH.length];
    dot(frame, x, y, k === 0 ? 1 : .8 - (k / trail) * .65);
  }
  return frame;
}

const SCENES: Record<Scene, (t: number, energy: number) => GlyphFrame> = {
  "figure-eight": figureEight, conveyor, "twin-orbit": twinOrbit, collapse, serpentine,
};
const SCENE_BY_STATE: Partial<Record<AppearanceState, Scene>> = {
  thinking: "figure-eight",
  responding: "conveyor",
  tools: "twin-orbit",
  compacting: "collapse",
  working: "serpentine",
};

/** Five fixed grid scenes in five cells. Deterministic from elapsed run time; no clocks, randomness, or state writes in rendering. */
export function emberMarker(theme: Theme, state: AppearanceState, workspace: WorkspaceState, now: number, color: Color): string {
  const moving = working.has(state) && shouldAnimate(workspace, now, workspace.editorFocused?.() ?? true);
  if (!moving) {
    const glyph = state === "done" ? "✓" : ["error", "waiting", "interrupted", "stopped"].includes(state) ? "!" : working.has(state) ? "●" : "○";
    return theme.style(`    ${glyph}`, { fg: color, bold: true });
  }
  const elapsed = Math.max(0, now - workspace.clock.transitionAt), t = elapsed / 1000;
  const eventAge = workspace.activityEventAt === undefined ? Infinity : Math.max(0, now - workspace.activityEventAt);
  const response = eventAge < 600 ? Math.sin(Math.PI * eventAge / 600) : 0;
  const ignition = Math.max(0, 1 - t / .5);
  const energy = Math.max(response, ignition * .7);
  const scene = SCENE_BY_STATE[state] ?? "figure-eight";
  const frame = SCENES[scene](t, energy);
  if (!frame.bits.some(bits => bits !== 0)) dot(frame, 4.5, 1.5, 1);
  return renderFrame(theme, frame, color);
}

/** Keep status before tool detail; drop the large marker before sacrificing the state label. */
export function emberStatus(theme: Theme, text: string, state: AppearanceState, workspace: WorkspaceState,
  now: number, budget: number, color: Color, bold = true, markerEnabled = true): string {
  const marker = emberMarker(theme, state, workspace, now, color);
  const room = markerEnabled && budget >= 6 + Math.min(visibleWidth(text), 24) ? 6 : 0;
  return (room ? marker + " " : "") + theme.style(truncateToWidth(text, Math.max(0, budget - room), "…"), { fg: color, bold });
}
export function statusWithTools(text: string, workspace: WorkspaceState): string {
  if (!workspace.tools.size || (workspace.blockingPromptDepth ?? workspace.promptDepth) > 0) return text;
  const names = [...new Set(workspace.tools.values())].map(name => name.replace(/[\x00-\x1f\x7f-\x9f]/g, " "));
  const detail = names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
  return `${text} · ${detail}`;
}
