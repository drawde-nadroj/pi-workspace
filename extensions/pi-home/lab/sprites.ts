import { Canvas } from "./design.ts";
import type { GazeOffset } from "../gaze.ts";

const CAT = [
  "   aa     aa   ", "  aAAa   aAAa  ", "  aAAAAAAAAAa  ", " aAAAAAAAAAAAa ",
  " aAAiAAAAAiAAa ", " aAAAAAAAAAAAa ", "  aAAAiiAAAAa  ", "   aAAAAAAAa   ",
  "  aAAAAAAAAAa  ", "  aAaaAAAaaAa  ", "   aa     aa   ", "               ",
];

/** Half-block sprite with transparent pixels; all coordinates are terminal cells. */
export function drawCat(c: Canvas, x: number, y: number, maxHeight: number, maxWidth: number,
  blink: boolean, lookRight = false, paw = false, gaze?: GazeOffset): void {
  const pixels = CAT.map((row) => row.split(""));
  if (gaze) {
    // Bilinear area coverage moves the original one-pixel eyes, rather than cross-fading two full eyes.
    // At integer destinations this is bit-for-bit the original crisp pixel. Only the 3×3 eye neighborhoods change.
    const dx = Number.isFinite(gaze.x) ? Math.max(-1, Math.min(1, gaze.x)) : 0;
    const dy = Number.isFinite(gaze.y) ? Math.max(-1, Math.min(1, gaze.y)) : 0;
    for (const col of [4, 10]) pixels[4][col] = "A";
    const ox = Math.floor(dx), oy = Math.floor(dy), fx = dx - ox, fy = dy - oy;
    for (const col of [4, 10]) for (let y = 0; y <= 1; y++) for (let x = 0; x <= 1; x++) {
      const coverage = Math.round((x ? fx : 1 - fx) * (y ? fy : 1 - fy) * 64);
      if (!coverage) continue;
      pixels[4 + oy + y][col + ox + x] = coverage === 64 ? "i" : `${blink ? "lid" : "eye"}${coverage}`;
    }
  } else if (lookRight && !blink) {
    for (const col of [4, 10]) { pixels[4][col] = "A"; pixels[4][col + 1] = "i"; }
  }
  if (paw) {
    pixels[6][13] = "a"; pixels[6][14] = "A";
    pixels[7][13] = "A"; pixels[7][14] = "a";
    pixels[8][13] = "a";
  }
  const colors: Record<string, string> = { a: "furShade", A: "fur", i: blink ? "furShade" : "ink" };
  const token = (value: string | undefined) => value && (colors[value] ?? (value.startsWith("eye") || value.startsWith("lid") ? value : undefined));
  for (let row = 0; row < pixels.length && row / 2 < maxHeight; row += 2) {
    const top = pixels[row], bottom = pixels[row + 1] ?? [];
    for (let col = 0; col < Math.min(maxWidth, Math.max(top.length, bottom.length)); col++) {
      const a = token(top[col]), b = token(bottom[col]);
      c.halfBlocks(x + col, y + row / 2, a, b);
    }
  }
}
