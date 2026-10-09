import type { Theme } from "@earendil-works/pi-coding-agent";
import { Canvas, makePalette } from "./lab/design.ts";
import { GardenPixels } from "./lab/garden.ts";
import { growForest } from "./lab/forest.ts";
import { drawFireflies } from "./lab/fireflies.ts";

import { drawCat } from "./lab/sprites.ts";
import type { GazeOffset } from "./gaze.ts";
export const catPosition = (width: number) => Math.floor(width * 0.27);
const palette = makePalette("glasshouse", false, "biolume");
// The clearing is the same surface as its surrounding card, not a separate green banner.
for (let i = 0; i < 6; i++) palette[`mist${i}`] = palette.panel;

/** Art only. Identity, activity and timing belong to the frame, never duplicated inside the scene. */
export function canopy(theme: Theme, width: number, height: number, visual: number, state: "idle" | "busy" | "waiting" | "error", gaze?: GazeOffset): string[] {
  const c = new Canvas(width, height, theme, palette);
  const field = new GardenPixels(width, height * 2, 0);
  growForest(field, visual / 1000);
  field.render(c, 0, 0);
  const x = catPosition(width), y = Math.max(0, height - 6);
  drawFireflies(c, { x: Math.max(1, Math.floor(width * 0.4)), y: 0, width: Math.max(1, Math.floor(width * 0.43)), height: Math.max(1, height - 1) }, visual,
    (fx, fy) => Boolean(field.occludes(fx, fy)));
  // Preserve the approved face, ears, body and paws at their native pixel resolution.
  // The workspace gives this six complete rows, rather than cropping or redrawing it.
  const blink = visual % 4700 > 4490;
  drawCat(c, x, y, 6, 15, blink, state === "busy", state === "waiting", gaze);
  const reaction = state === "waiting" ? "?" : state === "error" ? "!" : "";
  if (reaction) c.text(x + 16, y + 1, reaction, state === "error" ? "error" : "accent");
  return c.render();
}
