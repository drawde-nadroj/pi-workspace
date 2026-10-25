import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, parseColor, SelectList, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { frameRows } from "../../lib/frame.ts";

export const QUEST_PALETTES = {
  dark: { jade: "#65D6AD", gold: "#E8C879" },
  light: { jade: "#006B50", gold: "#805800" },
};

/** Native selection behavior inside Quests-owned, static chrome. No editor replacement. */
export async function questSelect(ctx: ExtensionContext, title: string, choices: string[], identity = "Quests", options: {selected?: string; maxChoices?: number} = {}): Promise<string | undefined> {
  if (ctx.mode !== "tui") return ctx.ui.select(title, choices);
  return ctx.ui.custom<string | undefined>((tui, theme, _keys, done) => {
    const panel = createQuestSelector(theme, title, choices, () => Math.max(1, Math.floor(tui.terminal.rows * 0.9)), done, identity, options);
    return {
      render: panel.render,
      invalidate: panel.invalidate,
      handleInput(data: string) { panel.handleInput(data); tui.requestRender(); },
    };
  }, { overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "90%" } });
}

export function createQuestSelector(theme: Theme, title: string, choices: string[], height: () => number, done: (value: string | undefined) => void, identity = "Quests", options: {selected?: string; maxChoices?: number} = {}) {
  let selected = Math.max(0, choices.indexOf(options.selected ?? ""));
  let list: SelectList;
  let visible = 0;
  let textOffset = 0;
  let wrapped: string[] = [];
  let bodyBudget = 1;
  const palette = () => QUEST_PALETTES[theme.appearance === "light" ? "light" : "dark"];
  const paint = (value: string, color: "jade" | "gold", bold = false) => theme.style(value, { fg: parseColor(palette()[color]), bold });
  function buildList(count: number) {
    visible = count;
    list = new SelectList(choices.map(value => ({value, label:value})), count, {
      selectedPrefix: s => paint(s, "jade", true), selectedText: s => paint(s, "jade", true),
      description: s => theme.fg("muted", s), scrollInfo: s => theme.fg("muted", s), noMatch: s => theme.fg("muted", s),
    });
    list.setSelectedIndex(selected);
    list.onSelect = item => done(item.value);
    list.onCancel = () => done(undefined);
    list.onSelectionChange = item => { selected = choices.indexOf(item.value); };
  }
  buildList(5);
  return {
    render(width: number): string[] {
      if (width <= 0) return [];
      const inner = Math.max(1, width - 4);
      // The caller supplies the overlay budget, not the whole editor/terminal height.
      const rows = Math.max(0, Math.floor(height()));
      if (!rows) return [];
      if (rows < 6 || width < 4) {
        bodyBudget = 1;
        return [choices[selected] ? `› ${choices[selected]}` : identity, "↑↓ choose · Enter open · Esc back"]
          .slice(0, rows).map(line => truncateToWidth(theme.fg("text", line), width));
      }
      const count = Math.max(1, Math.min(options.maxChoices ?? 4, choices.length, options.maxChoices ? Math.max(1, rows - 13) : Math.floor(rows / 4)));
      if (count !== visible) buildList(count);
      const optionRows = list.render(inner).map(s => theme.fg("text", s));
      bodyBudget = Math.max(1, rows - optionRows.length - 3);
      wrapped = title.split("\n").flatMap(line => wrapTextWithAnsi(line, inner));
      textOffset = Math.min(textOffset, Math.max(0, wrapped.length - bodyBudget));
      const body = wrapped.slice(textOffset, textOffset + bodyBudget).map(line =>
        /^(QUESTIONS|EVIDENCE|DISCOVERIES|CONNECTIONS|Open question:|Discovery \/ evidence:|Linked quests:)/.test(line) ? paint(line, "gold") : /^(NOW|WORK|FIRST MOVE|SOURCE|PURPOSE|NEXT MOVE|GOAL|DEVELOPMENTS|LINKED TASKS|ORIGIN|PURSUIT|ACTIONS|HISTORY)/.test(line) ? paint(line, "jade", true) : theme.fg("text", line));
      return frameRows({ theme, width, inset:1, rows:[...body, "", ...optionRows], color:parseColor(palette().jade),
        corners: { topLeft:paint(` ${identity} `, "jade", true), topRight: width > 35 ? paint(identity === "Quests" ? " Explore · Connect " : " History · Sources ", "gold") : "",
          bottomLeft: theme.fg("muted", wrapped.length > bodyBudget ? " ↑↓ choose · PgUp/PgDn read · Esc back " : " ↑↓ choose · Enter open · Esc back ") },
      }).map(line => truncateToWidth(line, width));
    },
    handleInput(data: string) {
      // Page keys scroll long source/evidence prose; arrows remain native SelectList navigation.
      if (matchesKey(data, "pageUp")) textOffset = Math.max(0, textOffset - bodyBudget);
      else if (matchesKey(data, "pageDown")) textOffset = Math.min(Math.max(0, wrapped.length - bodyBudget), textOffset + bodyBudget);
      else list.handleInput(data);
    },
    invalidate() { list.invalidate(); },
  };
}
