import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, initTheme, plain, kb, visibleWidth, CURSOR_MARKER } from "./host.mjs";
const { chooseFooter } = await jiti.import(join(source, "footer-settings.ts"));
const { settingName, settingValue, partName } = await jiti.import(join(source, "workspace-setting-layout.ts"));
const { FOOTER_DEFAULTS, footerPrefs } = await jiti.import(join(source, "footer-state.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "state.ts"));
const { appearanceDefaults, POSITIONS, STATES } = await jiti.import(join(source, "appearance.ts"));
const { appearanceRow, appearanceBorder } = await jiti.import(join(source, "appearance-render.ts"));
const { ComposerEditor } = await jiti.import(join(source, "ui.ts"));
const { getEditorTheme } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js")));
export function workspace(prefs = FOOTER_DEFAULTS, width = 120, height = 40, signal) {
  let panel, options, latest;
  const clock = new RunClock(); clock.begin(1000); clock.settle(2000, "done");
  const workspace = { prefs: { ...DEFAULTS, look: "composer" }, clock, phase: "working", tools: new Map(), promptDepth: 1,
    compacting: false, lastInputAt: 0, footerPickerOpen: true, thinkingLevel: () => "high",
    railStatus: () => ({ state: "done", text: "your turn", tone: "success" }), lastUserSentAt: () => new Date(2026, 9, 8, 12, 30).valueOf() };
  const data = { cwd: "/project/界面", model: "Model Name", thinking: "high", session: "Actual chat 界面", usage: { percent: 37, tokens: 74000, contextWindow: 200000 } };
  workspace.appearanceData = () => data;
  const tui = { terminal: { columns: width, rows: height }, requestRender() {} };
  const ctx = { cwd: data.cwd, model: { name: data.model }, getContextUsage: () => data.usage, sessionManager: { getSessionName: () => data.session }, ui: { theme,
    custom(factory, opts) { options = opts; return new Promise(resolve => { panel = factory(tui, theme, kb, resolve); }); } } };
  const editor = new ComposerEditor(tui, getEditorTheme(), kb, () => ctx, workspace, () => "high"); editor.setText("Unsent native draft 界面");
  const surface = { select(selected, state) { workspace.appearancePreview = { selected, state }; }, render(width, shimmer) {
    if (workspace.appearancePreview) workspace.appearancePreview.shimmer = shimmer;
    workspace.appearanceHits = [];
    const native = editor.render(width);
    const footer = [appearanceRow(theme, width, workspace, "footer1", 3000), appearanceRow(theme, width, workspace, "footer2", 3000)].filter(Boolean);
    return { editor: native, footer, hits: workspace.appearanceHits };
  } };
  const pending = chooseFooter(ctx, prefs, p => { workspace.layout = p; latest = p; }, surface, signal);
  const rows = () => panel.render(tui.terminal.columns).map(plain);
  const clickAt = (x, y) => panel.handleMouse({ type: "click", button: "left", x, y, screenX: x, screenY: y, width: tui.terminal.columns, height: tui.terminal.rows, shift: false, alt: false, ctrl: false });
  const click = (label, last = false) => {
    label = ({ "[Elements]": "[Input]", "[Other options]": "[More settings]", "[Egregore]": "[General]" })[label] ?? label;
    label = partName(settingName(label));
    const lines = rows(), indices = lines.flatMap((line, i) => line.includes(label) ? [i] : []), y = last ? indices.at(-1) : indices[0];
    const rooms = ["Input", "Tasks", "Ask", "Transcript", "More settings", "General"];
    const room = /^\[(.*)\]$/.exec(label)?.[1];
    if (y === undefined && room && rooms.includes(room) && lines.some(line => line.includes("[Rooms…]"))) {
      click("[Rooms…]");
      for (let i = 0; i < rooms.length; i++) panel.handleInput("\x1b[A");
      for (let i = 0; i < rooms.indexOf(room); i++) panel.handleInput("\x1b[B");
      panel.handleInput("\r"); return;
    }
    assert.notEqual(y, undefined, `${label} not visible:\n${lines.join("\n")}`);
    clickAt(visibleWidth(lines[y].slice(0, lines[y].indexOf(label))), y);
  };
  const pick = label => {
    const shown = settingValue(label);
    for (let i = 0; i < 40; i++) { if (rows().some(row => row.includes(shown))) { click(shown); return; } panel.handleInput("\x1b[B"); }
    assert.fail(`choice ${label} not found`);
  };
  const text = value => { panel.handleInput("\x01"); panel.handleInput("\x0b"); panel.handleInput(value); panel.handleInput("\r"); };
  const discard = async () => { click("[Discard]"); if (rows().some(row => row.includes("[Discard changes]"))) click("[Discard changes]"); return pending; };
  return { get panel() { return panel; }, get options() { return options; }, get latest() { return latest; }, rows, click, clickAt, pick, text, discard, pending, workspace, data, tui, editor, surface };
}
