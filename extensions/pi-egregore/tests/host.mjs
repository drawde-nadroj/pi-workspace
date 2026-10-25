import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

export const source = resolve(fileURLToPath(new URL("..", import.meta.url)));
const install = join(homedir(), ".pi/agent/install");
export const root = process.env.PI_WORKSPACE_HOST_MODULES || process.env.PI_HOME_HOST_MODULES || join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules");
const host = join(root, "@earendil-works/pi-coding-agent/dist");
const { createJiti } = await import(pathToFileURL(join(root, "jiti/lib/jiti.mjs")));
export const jiti = createJiti(import.meta.url, {
  alias: {
    "@earendil-works/pi-coding-agent": join(host, "index.js"),
    "@earendil-works/pi-tui": join(root, "@earendil-works/pi-tui/dist/index.js"),
  },
});
export const { initTheme, theme } = await import(pathToFileURL(join(host, "modes/interactive/theme/theme.js")));
const { KeybindingsManager } = await import(pathToFileURL(join(host, "core/keybindings.js")));
export const { visibleWidth, CURSOR_MARKER, setKeybindings, colorToRgb, colorToOklch } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
// Color assertions use truecolor unless a test explicitly selects 256-color.
const { setCapabilityOverrides } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
setCapabilityOverrides({ trueColor: true });
initTheme("dark", false);
// pi-vim 0.14.2 sends Ctrl+- internally for "u", independent of host defaults.
// Match the documented optional-Vim setup without changing real user bindings.
export const nativeKb = new KeybindingsManager();
export const kb = new KeybindingsManager({
  "tui.editor.undo": [...new Set([...nativeKb.getKeys("tui.editor.undo"), "ctrl+-"])],
});
setKeybindings(kb);
// Node's ANSI stripper does not consume Pi's BEL-terminated APC cursor markers.
// Strip only these host-owned zero-width markers before asserting visible text.
export const plain = (s) => stripVTControlCharacters(s.replaceAll(CURSOR_MARKER, "")
  .replaceAll("\x1b_pi:fc\x07", "").replaceAll("\x1b_pi:/fc\x07", ""));
