import type { GardenPixels } from "./garden.ts";

/** Evergreen silhouettes and understory, authored in square half-cell pixels. No external assets. */
export function growForest(p: GardenPixels, time: number) {
  const w = p.width, h = p.height, small = w < 74;

  function conifer(cx: number, top: number, height: number, spread: number, distant = false) {
    const base = Math.min(h - 1, Math.round(top + height));
    p.line(cx, top, cx, base, distant ? "forest2" : "bark");
    for (let y = Math.max(0, Math.round(top)); y < base - 1; y++) {
      const t = Math.max(0, (y - top) / height);
      const tier = (t * 5) % 1;
      const radius = Math.max(0, spread * t * (0.6 + 0.4 * tier));
      const sway = Math.sin(time * 0.42 + cx / 9) * 0.65 * (1 - t);
      const center = cx + sway;
      for (let x = Math.ceil(center - radius); x <= Math.floor(center + radius); x++) {
        const edge = x - center;
        const shade = Math.max(0, Math.min(5, Math.round(2.2 + edge / Math.max(1, radius) + (tier > 0.72 ? 0.8 : 0))));
        p.put(x, y, `${distant ? "forest" : "leaf"}${shade}`, !distant);
      }
      // A few pale needle tips catch the ambient light, never outlining the entire tree in neon.
      if (!distant && tier > 0.75 && radius > 2) p.put(center + radius, y, "leaf4");
    }
    p.put(cx, top, distant ? "forest3" : "leaf3", !distant);
  }

  // Receding treeline. Keep the cat and orbital clearing open rather than filling every pixel.
  conifer(3, h * 0.18, h * 0.8, small ? 4 : 6, true);
  conifer(w * 0.2, h * 0.33, h * 0.65, small ? 4 : 7, true);
  conifer(w * 0.43, h * 0.61, h * 0.36, 4, true);
  conifer(w - 24, h * 0.4, h * 0.57, 6, true);

  conifer(small ? 5 : 11, 0, h - 1, small ? 7 : 12);
  if (!small) conifer(23, h * 0.31, h * 0.66, 7);
  conifer(w - (small ? 4 : 9), 1, h - 2, small ? 7 : 11);

  // A mossy floor, with fixed texture so it doesn't shimmer like visual noise.
  for (let x = 0; x < w; x++) {
    p.put(x, h - 1, `leaf${Math.floor((Math.sin(x * 1.73) + 1) * 1.4)}`);
    if (x % 7 < 3) p.put(x, h - 2, "leaf1");
  }

  // Ferny undergrowth at the forest edge.
  const fernX = w - (small ? 13 : 23), fernH = Math.min(7, h - 3);
  for (let i = 0; i < fernH; i++) {
    const y = h - 2 - i;
    const x = fernX + Math.sin(time * 0.5 + i / 3) * 0.5;
    p.put(x, y, "leaf3");
    if (i % 2 === 1) for (const side of [-1, 1]) {
      const reach = Math.sin(i / fernH * Math.PI) * 5;
      p.line(x, y, x + side * reach, y - 1, "leaf2");
    }
  }

  // Tiny pastel caps, a quiet bioluminescent detail instead of an additional large focal point.
  for (const [x, color] of [[small ? 16 : 25, "spectrum1"], [Math.floor(w * 0.46), "spectrum0"]] as const) {
    p.put(x, h - 2, "leafVein");
    p.put(x, h - 4, color);
    for (let dx = -2; dx <= 2; dx++) p.put(x + dx, h - 3, color);
  }
}
