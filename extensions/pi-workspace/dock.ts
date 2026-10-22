import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { cleanText, layoutDock, type DockSnapshot } from "../../lib/workspace-dock.ts";
import type { WorkspaceState } from "./state.ts";
import { composerPadding, composerSurface } from "./composer-style.ts";
import { TaskPanel } from "./task-presentation.ts";

/** Composer's optional dock sits above the native editor; no art or idle animation. */
export function createDock(tui: TUI, ctx: () => ExtensionContext, state: WorkspaceState,
  docks: Map<string, DockSnapshot>, focused: () => boolean, now: () => number = Date.now): Component {
  state.taskPanel ??= new TaskPanel();
  return {
    invalidate() {},
    render(width) {
      if (width <= 0) return [];
      const theme = ctx().ui.theme, terminalRows = tui.terminal.rows;
      const nowMs = now();
      const rows: string[] = [];
      const providers = [...docks.values()].filter((dock) => dock.rows.length).slice(0, 6);
      state.taskPanel!.setVisible(providers.some((dock) => dock.id === "pi-tasks"));
      let remaining = Math.max(4, Math.min(9, Math.floor(terminalRows / 4)));
      for (let index = 0; index < providers.length; index++) {
        const dock = providers[index];
        if (dock.id === "pi-tasks") {
          const frame = state.taskPanel!.render(theme, width, dock, state, nowMs, focused(), Math.max(3, remaining));
          rows.push(...frame);
          remaining -= frame.length;
          continue;
        }
        if (remaining < 2) {
          rows.push(truncateToWidth(theme.fg("muted", `+ ${providers.length - index} more panels`), width));
          break;
        }
        const items = layoutDock(dock, Math.max(1, width - 2), Math.min(7, remaining - 1));
        rows.push(truncateToWidth(theme.fg("muted", ` ${cleanText(dock.title)}${dock.summary ? " · " + cleanText(dock.summary) : ""}`), width));
        for (const row of items) rows.push(truncateToWidth(theme.fg(row.tone ?? "text", " " + cleanText(row.text)), width));
        remaining -= items.length + 1;
      }
      for (const line of state.activityRows?.(width) ?? []) rows.push(line);
      if (rows.length && composerPadding(width, terminalRows, state.layout?.density)) rows.push("");
      if (state.statusRows) rows.push(...state.statusRows(width));
      return rows.map((line) => composerSurface(theme, line, width));
    },
  };
}
