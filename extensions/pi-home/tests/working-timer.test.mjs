import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain, kb } from "./host.mjs";
const { registerFooter } = await jiti.import(join(source, "footer.ts"));
const { createWorkspace } = await jiti.import(join(source, "workspace.ts"));
const { HomeEditor } = await jiti.import(join(source, "ui.ts"));
const { installPaintGuard } = await jiti.import(join(source, "paint-guard.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "state.ts"));
const host = join(root, "@earendil-works/pi-coding-agent/dist");
const { createInteractiveTuiReference } = await import(pathToFileURL(join(host, "modes/interactive/tui-renderer.js")));
const { createChatViewport } = await import(pathToFileURL(join(host, "modes/interactive/chat-viewport.js")));
const { Container, Text, TuiMainScreen, TuiAltScreen } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { getEditorTheme } = await import(pathToFileURL(join(host, "modes/interactive/theme/theme.js")));

for (const Renderer of [TuiMainScreen, TuiAltScreen]) test(`${Renderer.name}: live composer timer paints during silent work through Pi's TUI reference`, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "pi-home-timer-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = scratch;
  const writes = [];
  const terminal = { columns: 100, rows: 40, kittyProtocolActive: false, start() {}, stop() {}, async drainInput() {}, write(s) { writes.push(s); }, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  const renderer = new Renderer(terminal, false), tui = createInteractiveTuiReference(() => renderer);
  const home = { prefs: { ...DEFAULTS, look: "composer", motion: "off" }, clock: new RunClock(), tools: new Map(), phase: "thinking", promptDepth: 0, compacting: false, lastInputAt: 0, editorFocused: () => false };
  const handlers = new Map(), entries = [], widgets = new Container(), footer = new Container();
  const ctx = { mode: "tui", cwd: scratch, model: { name: "fixture" }, getContextUsage: () => undefined,
    sessionManager: { getBranch: () => entries, getSessionId: () => "fixture", getSessionName: () => "Fixture", getHeader: () => undefined },
    ui: { theme, notify() {}, setWidget() {}, setFooter(factory) { footer.clear(); footer.addChild(factory(tui, theme, { onBranchChange: () => () => {}, getExtensionStatuses: () => new Map() })); } },
  };
  const pi = { events: { on() {} }, getThinkingLevel: () => "high", registerCommand() {}, on(name, fn) { handlers.set(name, fn); }, appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); } };
  registerFooter(pi, home);
  const emit = async name => handlers.get(name)?.({ type: name }, ctx);
  const workspace = createWorkspace(tui, () => ctx, home, new Map(), () => false);
  widgets.addChild(workspace);
  const editor = new HomeEditor(tui, getEditorTheme(), kb, () => ctx, home, () => "high");
  editor.setText("draft");
  if (Renderer === TuiAltScreen) {
    const view = createChatViewport({ document: new Text("Transcript", 0, 0), pendingMessages: new Container(), status: new Container(), widgetsAbove: widgets, editor, footer });
    renderer.setLayoutRoot(view.root);
  } else { renderer.addChild(widgets); renderer.addChild(editor); renderer.addChild(footer); }
  const cleanup = installPaintGuard(tui, () => {}, () => true);
  try {
    await emit("session_start");
    renderer.start();
    home.clock.begin(Date.now());
    await emit("agent_start");
    await new Promise(resolve => setTimeout(resolve, 2300));
    const output = writes.map(plain).join("");
    assert.match(output, /Thinking\s+0s/);
    assert.match(output, /Thinking\s+2s/, "no stream/input/tool events are needed for the live timer");
    home.clock.settle(Date.now(), "done");
    await emit("agent_settled");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(writes.map(plain).join(""), /your turn/);
  } finally {
    await emit("session_shutdown"); cleanup(); renderer.stop();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(scratch, { recursive: true, force: true });
  }
});
