import { Canvas, type DemoFrame, type Mood } from "./design.ts";
import type { Region } from "./scenes.ts";
import { drawCat } from "./sprites.ts";
import { growForest } from "./forest.ts";
import { drawFireflies } from "./fireflies.ts";

const TAU = Math.PI * 2;

/** A small half-cell art layer, composited by the same Canvas as the rest of the UI. */
export class GardenPixels {
  private pixels: string[][];
  private foliage: boolean[][];
  constructor(readonly width: number, readonly height: number, time: number) {
    this.pixels = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) =>
      `mist${Math.floor(x / width * 3 + y / height * 2 + time / 8) % 6}`));
    this.foliage = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  }
  put(x: number, y: number, color: string, solid = true) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y][x] = color;
    this.foliage[y][x] = solid;
  }
  line(x0: number, y0: number, x1: number, y1: number, color: string) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) this.put(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, color);
  }
  leaf(cx: number, cy: number, a: number, b: number, angle: number, split = false, light = 0) {
    const cos = Math.cos(angle), sin = Math.sin(angle), radius = Math.ceil(a + b);
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(this.height - 1, cy + radius); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(this.width - 1, cx + radius); x++) {
        const u = (x - cx) * cos + (y - cy) * sin, v = -(x - cx) * sin + (y - cy) * cos;
        if ((u / a) ** 2 + (v / b) ** 2 > 1) continue;
        // Fenestrated edges and a continuous midrib, rather than a generic green ellipse.
        if (split && Math.abs(v) > b * 0.38 && Math.abs(u) < a * 0.78 && ((u / a + 1) * 4) % 1 < 0.2) continue;
        const vein = Math.abs(v) < 0.35 || Math.abs((u + Math.abs(v) * 1.3 + a) % 3.8) < 0.35;
        const shade = Math.max(0, Math.min(5, Math.round(2.3 - v / b * 1.6 + light)));
        this.put(x, y, vein ? "leafVein" : `leaf${shade}`);
      }
    }
  }
  occludes(x: number, y: number) {
    return this.foliage[y * 2]?.[x] || this.foliage[y * 2 + 1]?.[x];
  }
  render(c: Canvas, x: number, y: number) {
    for (let row = 0; row < this.height; row += 2) {
      for (let col = 0; col < this.width; col++) {
        const top = this.pixels[row][col], bottom = this.pixels[row + 1]?.[col] ?? "inset";
        c.text(x + col, y + row / 2, top === bottom ? " " : "▀", top, bottom);
      }
    }
  }
}

function growPlants(p: GardenPixels, time: number) {
  const h = p.height, w = p.width, small = w < 74, scale = small ? 0.67 : 1;
  const sway = Math.sin(time * 0.65) * 0.6;
  const root = 10 * scale;
  const leaves = [
    [12 * scale + sway, h * 0.35, 9 * scale, 4, -0.5],
    [4 * scale - sway, h * 0.67, 6 * scale, 3, 0.3],
    [21 * scale + sway, h * 0.7, 7 * scale, 3.5, -0.6],
  ];
  for (const [x, y, a, b, angle] of leaves) {
    p.line(root, h - 1, x, y, "leaf");
    p.leaf(x, y, a, Math.min(b, h * 0.22), angle, true, Math.sin(time / 5) * 0.35);
  }
  for (let x = root - 3; x <= root + 3; x++) { p.put(x, h - 2, "pot"); p.put(x, h - 1, "furShade"); }

  // A feathery fern, with independent but very slow movement.
  const fernX = w - (small ? 10 : 19), fernH = Math.min(h - 2, small ? 10 : 15);
  for (let i = 0; i < fernH; i++) {
    const x = fernX + Math.sin(i / fernH * 2 + time * 0.45) * 1.2;
    const y = h - 1 - i;
    const spread = Math.sin(i / fernH * Math.PI) * (small ? 4 : 8);
    p.put(x, y, "leafVein");
    if (i % 2 === 1) for (const side of [-1, 1]) {
      p.line(x, y, x + side * spread, y - 2, side > 0 ? "leaf4" : "leaf2");
      p.line(x, y - 1, x + side * spread * 0.75, y - 3, "leaf3");
    }
  }

  // Pothos drapes down from the opposite corner, framing rather than covering the work area.
  let lastX = w - 4, lastY = 0;
  for (let y = 0; y < h * 0.74; y += 3) {
    const x = w - 4 + Math.sin(y / 4 + time * 0.3) * 1.2;
    p.line(lastX, lastY, x, y, "leaf");
    if (y) p.leaf(x + (y % 2 ? -2 : 1), y, 2.8, 1.5, y % 2 ? -0.5 : 0.5, false, 0.7);
    lastX = x; lastY = y;
  }
}

export function drawGlasshouse(c: Canvas, r: Region, f: DemoFrame, mood: Mood) {
  const artHeight = r.height - 1;
  const t = f.visual / 1000;
  const field = new GardenPixels(r.width, artHeight * 2, t);
  if (mood === "biolume") growForest(field, t);
  else growPlants(field, t);
  field.render(c, r.x, r.y);

  const catX = r.width >= 74 ? Math.floor(r.width * 0.27) : 8;
  const catY = Math.max(0, artHeight - 6);
  const cx = Math.max(catX + 19, Math.floor(r.width * 0.64));
  const cy = Math.max(2, (artHeight - 1) / 2);
  const rx = Math.min(18, r.width * 0.17), ry = Math.max(1.2, artHeight / 2 - 1);
  if (mood === "biolume") {
    const left = Math.max(catX + 18, Math.floor(cx - rx - 2));
    const right = Math.min(r.width - 2, Math.ceil(cx + rx + 1));
    drawFireflies(c, { x: r.x + left, y: r.y + 1, width: right - left + 1, height: artHeight - 2 }, f.visual, (x, y) => {
      const lx = x - r.x, ly = y - r.y;
      return Boolean(field.occludes(lx, ly)) || (ly === Math.round(cy) && Math.abs(lx - cx) <= 2);
    });
  } else {
    // Retain the original orbital treatment in the other two comparison moods.
    const turn = t / (mood === "kaleido" ? 1.8 : 2.5);
    const rings = mood === "kaleido" ? 4 : 3;
    for (let ring = 0; ring < rings; ring++) {
      const points = mood === "kaleido" ? 46 : 32;
      for (let i = 0; i < points; i++) {
        const a = i / points * TAU + turn * (ring % 2 ? -1 : 1);
        const petals = mood === "kaleido" ? 0.8 + 0.2 * Math.cos(a * 3 + turn) : 1;
        const x = Math.round(cx + Math.cos(a) * rx * (1 - ring * 0.15) * petals);
        const y = Math.round(cy + Math.sin(a + ring * 0.8) * ry * (1 - ring * 0.1));
        if (x < 0 || x >= r.width || y < 0 || y >= artHeight || field.occludes(x, y)) continue;
        const head = i % 8 === 0, trail = i % 8 < 3;
        const color = `${head || trail ? "spectrum" : "trail"}${(Math.floor(i / points * 6 + t / 3) + ring) % 6}`;
        c.text(r.x + x, r.y + y, head ? "◆" : trail ? "•" : "·", color);
      }
    }
  }
  const core = f.failed ? " ! " : f.phase === "waiting" ? " ? " : f.phase === "complete" ? " ✿ " : "‹π›";
  c.text(r.x + cx - 1, r.y + Math.round(cy), core, f.failed ? "error" : f.phase === "waiting" ? "warning" : "glow", "inset", true);

  if (mood === "biolume") {
    for (let i = 0; i < 4; i++) {
      const x = Math.round((i < 2 ? r.width * 0.18 : r.width * 0.83) + Math.sin(t * 0.4 + i * 2) * 3);
      const y = Math.round(1 + (i % 2) * (artHeight - 3) + Math.sin(t * 0.6 + i) * 0.5);
      if (x >= 0 && x < r.width && y >= 0 && y < artHeight && !field.occludes(x, y)) {
        c.text(r.x + x, r.y + y, "·", `aura${(i * 11 + Math.floor(t * 3)) % 48}`);
      }
    }
  }

  const sleeping = f.phase === "idle";
  const paw = !sleeping && !f.failed && f.phase !== "waiting" && f.visual % 6000 > 4400;
  const blink = sleeping || f.visual % 4700 > 4490;
  drawCat(c, r.x + catX, r.y + catY, Math.min(6, artHeight), r.width - catX, blink, true, paw);
  const tail = sleeping ? "⌁" : Math.sin(t * 1.8) > 0 ? "╮" : "~";
  c.text(r.x + catX + 14, r.y + artHeight - 2, tail, "fur");
  const reaction = sleeping ? "z Z" : f.failed ? "!" : f.phase === "waiting" ? "?" : f.phase === "complete" ? "♥" : paw ? "✦" : "";
  if (reaction) c.text(r.x + catX + 16, r.y + catY + (paw ? 3 : 1), reaction, f.failed ? "error" : "accent", "inset");

  if (f.phase === "complete" && mood !== "biolume") {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + t / 2;
      const x = Math.round(cx + Math.cos(a) * (rx + 2)), y = Math.round(cy + Math.sin(a) * ry);
      if (x >= 0 && x < r.width && y >= 0 && y < artHeight && !field.occludes(x, y)) {
        c.text(r.x + x, r.y + y, "✧", `spectrum${i}`);
      }
    }
  }
  const statusY = r.y + r.height - 1;
  c.text(r.x + 2, statusY, f.status, f.failed ? "error" : f.phase === "waiting" ? "warning" : "muted", "inset", false, r.width - 4);
}
