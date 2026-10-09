import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { cleanText, layoutDock, type DockSnapshot } from "../../lib/home-dock.ts";
import { createIdentity, splitRow } from "./ui.ts";
import { activity, shouldAnimate, type HomeState } from "./state.ts";
import { pineRow, pineRule, pineText } from "./biolume.ts";
import { canopy, catPosition } from "./canopy.ts";
import { composerInset, composerPadding, composerSurface } from "./composer-style.ts";
import { TaskPanel } from "./task-presentation.ts";

/** The top of one continuous workspace. Editor and footer continue these same edges/surfaces. */
export function createWorkspace(tui: TUI, ctx: () => ExtensionContext, state: HomeState,
  docks: Map<string, DockSnapshot>, focused: () => boolean, now: () => number = Date.now): Component {
  const identity = createIdentity(ctx, state);
  state.taskPanel ??= new TaskPanel();
  let visual = 0, last = 0, wasAnimated = false;
  const workspace: Component = {
    handleMouse(event) {
      state.gaze?.calibrate(event.screenX, event.screenY, event.x, event.y);
      return undefined; // Observation only: leave clicks, selection and wheel behavior to pi.
    },
    invalidate() { identity.invalidate(); },
    render(width) {
      if (width <= 0) return [];
      const context = ctx(), theme = context.ui.theme;
      const biolume = state.prefs.look === "biolume" && width >= 8;
      const composer = state.prefs.look === "composer";
      const nowMs = now(), animate = shouldAnimate(state, nowMs, focused());
      if (animate && wasAnimated) visual += Math.max(0, Math.min(250, nowMs - last));
      last = nowMs; wasAnimated = animate;
      const terminalRows = tui.terminal.rows;
      const name = cleanText(context.sessionManager.getSessionName()?.trim() || "Untitled session");
      const status = activity(state);
      const busy = state.clock.active || state.compacting;
      const glyph = busy && animate ? ["·", "•", "●", "•"][Math.floor(visual / 250) % 4] : busy ? "●" : "·";
      const tone = status === "error" ? "error" : status === "your turn" ? "warning" : "muted";
      const rows = composer ? [] : biolume ? [pineRule(theme, width, pineText(theme, `  π  ${name} `, "text", true),
        pineText(theme, ` ${glyph} ${cleanText(status)}  `, tone), "top")] : identity.render(width);
      // Art yields as a whole in short panes. Never crop or squash the approved cat to make it fit.
      const scene = biolume && state.prefs.scene && width >= 48 && terminalRows >= 34;
      if (scene) {
        const phase = status === "error" ? "error" : status === "your turn" ? "waiting" : busy ? "busy" : "idle";
        rows.push(...canopy(theme, width - 6, 6, visual, phase, state.gaze?.eyes).map((line) => pineRow(theme, width, line)));
        rows.push(pineRow(theme, width));
      }
      const providers = [...docks.values()].filter((d) => d.rows.length).slice(0, 6);
      state.taskPanel!.setVisible(providers.some(d => d.id === "pi-tasks"));
      if (biolume && providers.length && !scene && terminalRows >= 30) rows.push(pineRow(theme, width));
      let remaining = Math.max(4, Math.min(9, Math.floor(terminalRows / 4)));
      for (let index = 0; index < providers.length; index++) {
        const dock = providers[index];
        if (dock.id === "pi-tasks") {
          const frameWidth = biolume ? Math.max(1, width - 6) : width;
          const frame = state.taskPanel!.render(theme, frameWidth, dock, state, nowMs, focused(), Math.max(3, remaining));
          rows.push(...(biolume ? frame.map(line => pineRow(theme, width, line)) : frame));
          remaining -= frame.length;
          continue;
        }
        if (composer && !state.prefs.details && dock.layout !== "focus") {
          const primary = dock.rows.find(r => r.tone === "error" || r.tone === "warning")
            ?? dock.rows.find(r => r.tone === "accent") ?? dock.rows[0];
          const label = dock.id === "pi-tasks" ? "TASKS" : cleanText(dock.title);
          const text = `${label}${dock.summary ? " · " + cleanText(dock.summary) : ""}${primary ? " · " + cleanText(primary.text) : ""}`;
          const inset = composerInset(width);
          rows.push(" ".repeat(inset) + truncateToWidth(theme.fg(primary?.tone === "error" ? "error" : primary?.tone === "warning" ? "warning" : dock.id === "pi-tasks" ? "accent" : "muted", text), Math.max(0, width - 2 * inset), "…"));
          continue;
        }
        if (remaining < 2) {
          const text = `+ ${providers.length - index} more panels`;
          rows.push(biolume ? pineRow(theme, width, pineText(theme, text, "muted")) : truncateToWidth(theme.fg("muted", text), width));
          break;
        }
        const items = layoutDock(dock, Math.max(1, width - (biolume ? 6 : 2)), Math.min(7, remaining - 1));
        const heading = dock.id === "pi-tasks" ? "TASKS" : dock.layout === "focus" ? dock.summary ?? dock.title : dock.title;
        const summary = dock.layout === "focus" && dock.id !== "pi-tasks" ? "" : dock.summary;
        if (biolume) {
          rows.push(pineRow(theme, width, splitRow(pineText(theme, cleanText(heading), "muted", true),
            pineText(theme, cleanText(summary ?? ""), "faint"), Math.max(0, width - 6))));
          for (const r of items) rows.push(pineRow(theme, width, pineText(theme, cleanText(r.text), r.tone ?? "text", r.tone === "accent")));
        } else {
          rows.push(truncateToWidth(theme.fg(dock.id === "pi-tasks" ? "accent" : "muted", ` ${cleanText(heading)}${summary ? " · " + cleanText(summary) : ""}`), width));
          for (const row of items) rows.push(truncateToWidth(theme.fg(row.tone ?? "text", " " + cleanText(row.text)), width));
        }
        remaining -= items.length + 1;
      }
      if (biolume && providers.length && terminalRows >= 30) rows.push(pineRow(theme, width));
      // Activity is independent of task providers and always follows their rows.
      for (const line of state.activityRows?.(biolume ? Math.max(1, width - 6) : width) ?? []) {
        rows.push(biolume ? pineRow(theme, width, line) : line);
      }
      if (composer) {
        if (rows.length && composerPadding(width, terminalRows)) rows.push("");
        // The composer rail owns run state; only opt-in external status rows stay here.
        if (state.statusRows) rows.push(...state.statusRows(width));
      }
      // Pi mounts its document/widgets/editor/footer as public Container children in both modes.
      // Measure only siblings BELOW this widget; never re-render the conversation or inspect private layout state.
      let followingRows: number | undefined;
      if (scene && state.gaze && Array.isArray(tui.children)) {
        for (let i = 0; i < tui.children.length; i++) {
          const children = (tui.children[i] as Component & { children?: Component[] }).children;
          const at = children?.indexOf(workspace) ?? -1;
          if (at < 0 || !children) continue;
          followingRows = [...children.slice(at + 1), ...tui.children.slice(i + 1)].reduce((n, c) => n + c.render(width).length, 0);
          break;
        }
      }
      state.gaze?.setScene(scene ? { width, terminalRows, rows: rows.length, followingRows, eye: { x: 3 + catPosition(width - 6) + 7, y: 3.25 } } : undefined);
      return composer ? rows.map(line => composerSurface(theme, line, width)) : rows;
    },
  };
  return workspace;
}
