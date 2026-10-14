import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, truncateToWidth, visibleWidth, type Color } from "@earendil-works/pi-tui";
import type { AppearanceState } from "./appearance.ts";
import { shouldAnimate, type WorkspaceState } from "./state.ts";

const working = new Set<AppearanceState>(["working", "thinking", "responding", "tools", "compacting"]);
const dots = [[1, 2, 4, 64], [8, 16, 32, 128]];
/** Five fixed cells, not a progress bar. No clocks, randomness, or state writes in rendering. */
export function emberMarker(theme: Theme, state: AppearanceState, workspace: WorkspaceState, now: number, color: Color): string {
  const moving = working.has(state) && shouldAnimate(workspace, now, workspace.editorFocused?.() ?? true);
  if (!moving) {
    const glyph = state === "done" ? "✓" : ["error", "waiting", "interrupted", "stopped"].includes(state) ? "!" : working.has(state) ? "●" : "○";
    return theme.style(`  ${glyph}  `, { fg: color, bold: true });
  }
  const elapsed = Math.max(0, now - workspace.clock.transitionAt), t = elapsed / 1000;
  const eventAge = workspace.activityEventAt === undefined ? Infinity : Math.max(0, now - workspace.activityEventAt);
  const response = eventAge < 600 ? Math.sin(Math.PI * eventAge / 600) : 0;
  const flow = state === "responding";
  const x = flow ? 1 + (t * 2.8 % 7) : 4.5 + Math.sin(t * 2.1) * (2.1 + response);
  const y = 1.5 + Math.sin(t * 3.1) * .7;
  const radius = 1.05 + .25 * Math.sin(t * 2.7) + response * .45;
  let result = "";
  for (let cell = 0; cell < 5; cell++) {
    let bits = 0;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 4; dy++) {
      const px = cell * 2 + dx;
      const core = Math.hypot((px - x) * .75, (dy - y) * .9) < radius;
      const trail = px < x && px > x - 3 && dy === Math.round(1.5 + Math.sin(t * 3.1 - (x - px) * .6) * .7);
      if (core || trail) bits |= dots[dx][dy];
    }
    const bright = Math.abs(cell * 2 + .5 - x) < 1.6;
    result += theme.style(bits ? String.fromCharCode(0x2800 + bits) : " ", {
      fg: bright ? mixColors(color, theme.colors.text, .7) : color, bold: bright,
    });
  }
  return result;
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
