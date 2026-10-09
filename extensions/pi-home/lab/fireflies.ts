import { Canvas } from "./design.ts";
import type { Region } from "./scenes.ts";

export interface Firefly {
  x: number;
  y: number;
  color: number;
  light: number;
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const ease = (n: number) => n * n * n * (n * (n * 6 - 15) + 10);
const noise = (seed: number, step: number) => {
  const n = Math.sin(seed * 127.1 + step * 311.7) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
};

/** Smooth, seeded waypoints: each fly slows to a hover before wandering toward its next point. */
function wander(seed: number, time: number): number {
  const step = Math.floor(time), blend = ease(time - step);
  return noise(seed, step) * (1 - blend) + noise(seed, step + 1) * blend;
}

/** Pure preview-clock motion, with independent paths and pulses; no randomness or animation timer. */
export function fireflyFrame(width: number, height: number, visual: number): Firefly[] {
  if (width <= 0 || height <= 0) return [];
  const count = Math.min(9, Math.max(3, Math.floor(width / 4.5)));
  const t = Math.max(0, visual) / 1000;
  return Array.from({ length: count }, (_, i) => {
    const clock = t / (5.7 + i * 0.43) + i * 0.79;
    const x = clamp(0.08 + 0.84 * (i + 0.5) / count + wander(i * 2 + 3, clock) * 0.18, 0.02, 0.98);
    const y = clamp(0.5 + wander(i * 2 + 4, clock * 0.83 + 1.1) * 0.32 + Math.sin(t * 0.43 + i * 2.4) * 0.12, 0.04, 0.96);
    const pulse = (1 + Math.sin(t * (0.58 + i * 0.017) + i * 2.39996)) / 2;
    return {
      x: x * (width - 1), y: y * (height - 1), color: (i * 5 + 3) % 6,
      light: Math.round(15 * ease(pulse)),
    };
  });
}

export function drawFireflies(c: Canvas, r: Region, visual: number, blocked: (x: number, y: number) => boolean): void {
  for (const fly of fireflyFrame(r.width, r.height, visual)) {
    const x = r.x + Math.round(fly.x), y = r.y + Math.round(fly.y);
    if (fly.light < 2 || blocked(x, y)) continue;
    // Small round lights, not diamonds, starbursts, trails, or connected orbital tracks.
    c.text(x, y, fly.light >= 13 ? "•" : "·", `firefly${fly.color}_${fly.light}`);
  }
}
