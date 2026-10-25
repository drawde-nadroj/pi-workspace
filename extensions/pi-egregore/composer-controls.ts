import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { WorkspaceState, Preferences } from "./state.ts";

const COMMANDS = ["output raw", "output readable", "composer", "theme on", "theme off", "motion work", "motion off", "icons nerd", "icons plain", "on", "off"];

/** Composer controls own operational choices; Egregore owns mounting and session lifetime. */
export function registerComposerControls(pi: ExtensionAPI, controls: {
  state: WorkspaceState;
  setContext: (ctx: ExtensionContext) => void;
  isCurrent: (ctx: ExtensionContext) => boolean;
  restoreTheme: (ctx: ExtensionContext) => void;
  setOutputMode: (raw: boolean) => void;
  openRecaps: (ctx: ExtensionCommandContext) => Promise<void>;
  apply: (next: Preferences, ctx: ExtensionContext) => Promise<void>;
}): void {
  async function choose(ctx: ExtensionCommandContext): Promise<string | undefined> {
    const options = ["Work motion…", "Egregore header icons…", "Matching palette…", "Activity recaps…",
      controls.state.prefs.enabled ? "Turn appearance off" : "Turn appearance on"];
    const result = await ctx.ui.select("Composer controls · choices save immediately", options);
    if (!result) return;
    const index = options.indexOf(result);
    if (index === 0) {
      const motion = await ctx.ui.select("Work motion · readouts stay live", ["work", "off"]);
      return motion ? `motion ${motion}` : undefined;
    }
    if (index === 1) {
      const icons = await ctx.ui.select("Egregore header icons · frame metadata uses /egregore", ["Nerd Font", "Plain text"]);
      return icons ? `icons ${icons === "Nerd Font" ? "nerd" : "plain"}` : undefined;
    }
    if (index === 2) {
      const theme = await ctx.ui.select("Matching palette · off restores your preceding colors", ["on", "off"]);
      return theme ? `theme ${theme}` : undefined;
    }
    if (index === 3) { await controls.openRecaps(ctx); return; }
    return controls.state.prefs.enabled ? "off" : "on";
  }

  pi.registerCommand("composer", {
    description: "Composer appearance: output raw/readable, theme, motion, icons, on/off. Tasks are independent; /egregore edits frame and metadata appearance.",
    getArgumentCompletions: (prefix) => COMMANDS.filter((s) => s.startsWith(prefix)).map((s) => ({ value: s, label: s })),
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") { ctx.ui.notify("Composer appearance is available only in terminal UI mode.", "info"); return; }
      controls.setContext(ctx);
      const command = args.trim().toLowerCase() || await choose(ctx);
      if (!command || !controls.isCurrent(ctx)) return;
      if (command === "output raw" || command === "output readable") {
        controls.setOutputMode(command === "output raw");
        ctx.ui.notify(`Expanded tool cards now use ${command === "output raw" ? "raw payloads" : "readable output"}. Use Ctrl+O to expand. Session only.`, "info");
        return;
      }
      const next = { ...controls.state.prefs };
      if (command === "composer") next.enabled = true;
      else if (command === "on" || command === "off") next.enabled = command === "on";
      else if (command === "theme on" || command === "theme off") {
        controls.restoreTheme(ctx);
        next.theme = command === "theme on";
      }
      else if (command === "motion work" || command === "motion off") next.motion = command.slice(7) as Preferences["motion"];
      else if (command === "icons nerd" || command === "icons plain") next.icons = command.slice(6) as Preferences["icons"];
      else { ctx.ui.notify("Usage: /composer [composer|theme on|theme off|motion work|motion off|icons nerd|icons plain|output raw|output readable|on|off]", "warning"); return; }
      await controls.apply(next, ctx);
    },
  });

}
