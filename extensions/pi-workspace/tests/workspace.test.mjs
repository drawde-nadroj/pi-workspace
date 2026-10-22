import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

// No installed dependencies: exercise the same host packages/jiti mapping that pi uses.
const source = resolve(fileURLToPath(new URL("..", import.meta.url)));
const install = join(homedir(), ".pi/agent/install");
const root = process.env.PI_WORKSPACE_HOST_MODULES || process.env.PI_HOME_HOST_MODULES || join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules");
const host = join(root, "@earendil-works/pi-coding-agent/dist");
const { createJiti } = await import(pathToFileURL(join(root, "jiti/lib/jiti.mjs")));
const jiti = createJiti(import.meta.url, {
  alias: {
    "@earendil-works/pi-coding-agent": join(host, "index.js"),
    "@earendil-works/pi-tui": join(root, "@earendil-works/pi-tui/dist/index.js"),
  },
});
const { ComposerEditor, createFooter, createIdentity, splitRow, shortPath, cleanLabel } = await jiti.import(join(source, "ui.ts"));
const { DEFAULTS, RunClock, preferencesFrom, formatDuration, shouldAnimate, TIMING_ENTRY } = await jiti.import(join(source, "state.ts"));
const { OPTIONS } = await jiti.import(join(source, "footer-state.ts"));
const factory = await jiti.import(join(source, "index.ts"), { default: true });
const { initTheme, getEditorTheme, theme, getThemeByName, setThemeInstance } = await import(pathToFileURL(join(host, "modes/interactive/theme/theme.js")));
const { KeybindingsManager } = await import(pathToFileURL(join(host, "core/keybindings.js")));
const { visibleWidth, CURSOR_MARKER, setKeybindings } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { createEventBus } = await import(pathToFileURL(join(host, "core/event-bus.js")));
const { loadExtensions } = await import(pathToFileURL(join(host, "core/extensions/loader.js")));
initTheme("dark", false);
// Same optional pi-vim compatibility alias documented in docs/INSTALL.md.
const nativeKb = new KeybindingsManager();
const kb = new KeybindingsManager({
  "tui.editor.undo": [...new Set([...nativeKb.getKeys("tui.editor.undo"), "ctrl+-"])],
});
setKeybindings(kb);
const plain = (s) => stripVTControlCharacters(s.replaceAll(CURSOR_MARKER, ""));
const newState = () => ({ prefs: { ...DEFAULTS }, clock: new RunClock(), tools: new Map(), phase: "working", promptDepth: 0, compacting: false, lastInputAt: 0 });
function setup(rows = 40) {
  const state = newState();
  const tui = { terminal: { rows }, requestRender() {} };
  const ctx = { ui: { theme }, sessionManager: { getSessionId: () => "render-test", getSessionName: () => "Rendering" }, cwd: homedir(), model: { id: "gpt-model", contextWindow: 200000 }, getContextUsage: () => ({ percent: 24, contextWindow: 200000 }) };
  const editor = new ComposerEditor(tui, getEditorTheme(), kb, () => ctx, state, () => "high", () => 10000);
  editor.focused = true;
  return { state, tui, ctx, editor };
}
function mouse(width, x, y, height = 10) {
  return { type: "click", button: "left", x, y, screenX: x, screenY: y, width, height, shift: false, alt: false, ctrl: false };
}

test("host loader accepts the extension without starting session resources", async () => {
  const result = await loadExtensions([join(source, "index.ts")], source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  assert.ok(result.extensions[0].commands.has("workspace"));
  assert.ok(result.extensions[0].commands.has("composer"));
  assert.equal(result.extensions[0].commands.has("home"), false, "retired command is not registered");
});

test("timing spans repeated starts and survives resume without inventing unfinished timing", () => {
  const clock = new RunClock();
  assert.equal(clock.label(1000), "ready");
  assert.equal(clock.begin(1000), true);
  assert.equal(clock.begin(5000), false);
  assert.equal(clock.label(13000), "working 12s");
  const timing = clock.settle(39000, "done");
  assert.equal(clock.label(173000), "took 38s · idle 2m 14s");
  assert.equal(clock.settle(40000, "done"), undefined);
  const resumed = new RunClock();
  resumed.restore(timing);
  assert.equal(resumed.label(173000), clock.label(173000));
  resumed.restore({ startedAt: 1000 });
  assert.equal(resumed.label(200000), "previous run unfinished");
  resumed.restore({ startedAt: 1000, endedAt: 500 });
  assert.equal(resumed.label(0), "ready");
  resumed.begin(1000);
  resumed.settle(2500, "stopped");
  assert.equal(resumed.label(3000), "stopped after 1s · idle 0s");
  resumed.begin(5000);
  resumed.settle(7000, "error");
  assert.equal(resumed.label(8000), "failed after 2s · idle 1s");
  const waiting = new RunClock();
  waiting.begin(1000);
  waiting.pause(3000); waiting.pause(4000);
  assert.equal(waiting.label(9000), "waiting for you");
  waiting.resume(9000);
  assert.equal(waiting.label(10000), "waiting for you", "nested prompts keep the clock paused");
  waiting.resume(12000);
  assert.equal(waiting.label(13000), "working 3s");
  assert.equal(waiting.settle(14000, "done").activeMs, 4000);
  assert.equal(waiting.label(15000), "took 4s · idle 1s");
  waiting.restore({ startedAt: 1000, endedAt: 14000, outcome: "done" });
  assert.equal(waiting.label(15000), "elapsed 13s · idle 1s", "legacy wall time is labeled elapsed");
});

test("preferences, elapsed formatting, and motion policy are bounded", () => {
  assert.deepEqual(preferencesFrom({ look: "not-a-look", motion: "fast", icons: "bad" }), DEFAULTS);
  assert.deepEqual(preferencesFrom({ enabled: false, look: "orbit", scene: true, gaze: "both", motion: "ambient", icons: "plain" }),
    { ...DEFAULTS, enabled: false, icons: "plain" }, "retired look and artwork migrate to Composer without rewriting source preferences");
  assert.equal(formatDuration(-10), "0s");
  assert.equal(formatDuration(NaN), "0s");
  assert.equal(formatDuration(3601000), "1h 0m");
  assert.equal(formatDuration(90000000), "1d 1h");
  const state = newState();
  assert.equal(shouldAnimate(state, 10000, true), false);
  state.clock.begin(1000);
  assert.equal(shouldAnimate(state, 10000, true), true);
  state.promptDepth = 1;
  assert.equal(shouldAnimate(state, 10000, true), false);
  state.promptDepth = 0;
  state.lastInputAt = 9900;
  assert.equal(shouldAnimate(state, 10000, true), true, "ordinary typing does not stop real-work animation");
  state.prefs.motion = "off";
  assert.equal(shouldAnimate(state, 10000, true), false);
  state.prefs.motion = "work";
  state.clock.settle(2000, "done");
  assert.equal(shouldAnimate(state, 2100, false), false, "completion uses a static marker");
  assert.equal(shouldAnimate(state, 10000, false), false, "Composer does not animate while idle");
});

test("Composer fits narrow/wide panes, Unicode, multiline text, and both icon sets", () => {
  for (const look of ["composer"]) {
    for (const rows of [16, 40]) {
      const { editor, state } = setup(rows);
      for (const icons of ["nerd", "plain"]) {
        state.prefs.icons = icons;
        for (const text of ["", "hello world", "界面 🌈 e\u0301", Array.from({ length: 30 }, (_, i) => `row ${i}`).join("\n")]) {
          editor.setText(text);
          for (const width of [1, 2, 4, 6, 7, 8, 9, 12, 20, 32, 44, 60, 80, 120]) {
            const lines = editor.render(width);
            for (const line of lines) {
              assert.ok(visibleWidth(line) <= width, `${look}/${rows}/${width}/${JSON.stringify(text)}: ${visibleWidth(line)} > ${width}: ${JSON.stringify(line)}`);
              assert.ok(!line.includes("\0"), "internal sentinel escaped");
            }
            if (width >= 8) assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1, "one native IME cursor");
          }
        }
      }
    }
  }
});

test("Composer appearance changes preserve native cursor and large-paste storage", () => {
  const { editor, state } = setup();
  editor.handleInput("\x1b[200~" + "line of pasted text\n".repeat(40) + "\x1b[201~");
  const text = editor.getExpandedText();
  const cursor = editor.getCursor();
  for (const motion of ["off", "work"]) {
    state.prefs.motion = motion;
    editor.render(80);
    assert.equal(editor.getExpandedText(), text);
    assert.deepEqual(editor.getCursor(), cursor);
  }
});

test("fullscreen mouse maps box padding back to native text coordinates", () => {
  const { editor } = setup();
  editor.setText("abcdef");
  editor.render(80);
  editor.handleMouse(mouse(80, 6, 2));
  assert.deepEqual(editor.getCursor(), { line: 0, col: 3 });
  editor.handleMouse(mouse(80, 3, 2));
  assert.deepEqual(editor.getCursor(), { line: 0, col: 0 });
});

test("completion menu stays outside box and remains keyboard/mouse selectable", async () => {
  for (const look of ["composer"]) {
    const { editor } = setup();
    editor.setAutocompleteProvider({
      triggerCharacters: ["/"],
      async getSuggestions() { return { prefix: "/", items: [{ value: "/hello", label: "hello" }, { value: "/composer", label: "workspace" }] }; },
      applyCompletion(_lines, _row, _col, item) { return { lines: [item.value], cursorLine: 0, cursorCol: item.value.length }; },
    });
    editor.handleInput("/");
    await new Promise((r) => setTimeout(r, 100));
    const lines = editor.render(80);
    const bottom = lines.findIndex((line, i) => i > 0 && /^[╰└├┗]/u.test(plain(line)));
    assert.ok(bottom >= 2);
    assert.ok(lines.slice(bottom + 1).some((line) => plain(line).includes("hello")));
    assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
    const itemRow = lines.findIndex((line, i) => i > bottom && plain(line).includes("workspace"));
    assert.ok(itemRow > bottom);
    editor.handleMouse(mouse(80, 6, itemRow, lines.length));
    assert.equal(editor.getText(), "/composer");
    editor.render(80);
    editor.handleInput("\x1b");
  }
});

test("scroll indicators survive framing and autocompletion does not overwrite the bottom rail", () => {
  const { editor } = setup();
  editor.setText("row\n".repeat(40));
  const lines = editor.render(80).map(plain);
  assert.match(lines[0], /↑ \d+ more/);
  assert.ok(lines.some((line) => line.startsWith("╰")));
});

test("footer prioritizes both timings, retains other extension statuses, and disposes subscription", () => {
  const { state, tui, ctx } = setup();
  state.clock.begin(1000);
  state.clock.settle(39000, "done");
  let disposed = false;
  const data = { getGitBranch: () => "feature/something-long", getExtensionStatuses: () => new Map([["ask", "ask: waiting"]]), onBranchChange: () => () => { disposed = true; } };
  const footer = createFooter(tui, () => ctx, state, data, () => 173000);
  for (const width of [8, 20, 32, 60, 80, 140]) {
    const lines = footer.render(width);
    for (const line of lines) assert.ok(visibleWidth(line) <= width);
    const text = lines.map(plain).join(" ");
    assert.match(text, /took 38s/);
    assert.match(text, /idle 2m 14s/);
    assert.match(text, /ask: waiting/);
  }
  footer.dispose();
  assert.ok(disposed);
});

test("theme invalidation, path boundaries and metadata sanitization", () => {
  const { editor } = setup();
  const dark = editor.render(80).join("");
  initTheme("light", false);
  editor.invalidate();
  const light = editor.render(80).join("");
  assert.notEqual(dark, light);
  initTheme("dark", false);
  assert.equal(shortPath(homedir() + "-other/project"), homedir() + "-other/project");
  assert.equal(shortPath(homedir() + "/project"), "~/project");
  assert.equal(cleanLabel("bad\x1b[31mname\nmore"), "badname more");
  for (let width = 0; width < 50; width++) assert.ok(visibleWidth(splitRow("a long left", "right", width)) <= width);
});

async function harness(mode = "tui", savedComposerPrefs) {
  const scratch = mkdtempSync(join(tmpdir(), "pi-workspace-test-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = scratch;
  writeFileSync(join(scratch, "pi-recaps.json"), JSON.stringify({ enabled: false }));
  if (savedComposerPrefs) writeFileSync(join(scratch, "pi-home.json"), JSON.stringify(savedComposerPrefs));
  const handlers = new Map(), commands = new Map(), entries = [], widgets = new Map(), placements = new Map();
  let name;
  let currentFactory, editor, footer, header, picker;
  let renders = 0, subscribed = 0, visible = true;
  const tui = { mode: "fullscreen", terminal: { rows: 40 }, getFocusedComponent: () => editor, requestRender() { renders++; } };
  const data = { getGitBranch: () => "main", getExtensionStatuses: () => new Map(), onBranchChange() { subscribed++; return () => subscribed--; } };
  const ctx = {
    mode, cwd: scratch, model: { id: "test-model" },
    sessionManager: { getLeafId: () => null, getBranch: () => entries, getSessionName: () => name, getSessionId: () => "workspace-test", getHeader: () => ({ timestamp: new Date().toISOString() }) },
    getContextUsage: () => ({ percent: 10 }),
    ui: {
      theme, getTheme: getThemeByName, setTheme(value) { setThemeInstance(value); return { success: true }; },
      getEditorComponent: () => currentFactory,
      setEditorComponent(f) {
        const text = editor?.getText() ?? "";
        if (editor) editor.focused = false;
        currentFactory = f;
        editor = f ? f(tui, getEditorTheme(), kb) : undefined;
        if (editor) { editor.setText(text); editor.focused = true; }
      },
      getEditorText: () => editor?.getExpandedText() ?? "",
      setEditorText: (text) => editor?.setText(text),
      setWorkingVisible: (v) => visible = v,
      setHeader: (f) => header = f?.(tui, theme),
      setWidget: (key, f, options) => { if (f) { widgets.set(key, f(tui, theme)); placements.set(key, options?.placement ?? "aboveEditor"); } else { widgets.delete(key); placements.delete(key); } },
      setFooter: (f) => { footer?.dispose(); footer = f?.(tui, theme, data); },
      notify: (message, type) => { if (type === "warning" || type === "error") throw new Error(message); },
      custom: (make, options) => new Promise(resolve => { picker = { component: make(tui, theme, kb, resolve), options, resolve }; }),
    },
  };
  const api = {
    events: createEventBus(),
    on(name, fn) { handlers.set(name, [...(handlers.get(name) ?? []), fn]); },
    registerCommand(name, command) { commands.set(name, command); },
    registerEntryRenderer() {},
    getThinkingLevel: () => "high",
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
  };
  await factory(api);
  const emit = async (name, data = {}) => { for (const fn of handlers.get(name) ?? []) await fn({ type: name, ...data }, ctx); };
  const command = (text) => commands.get("composer").handler(text, ctx);
  return { ctx, tui, emit, command, entries, handlers, widgets, placements, events: api.events,
    completions(prefix) { return commands.get("composer").getArgumentCompletions(prefix).map(item => item.value); },
    rename(value) { name = value; },
    get picker() { return picker; },
    workspaceCommand: () => commands.get("workspace").handler("", ctx),
    get editor() { return editor; }, get footer() { return footer; }, get header() { return header; },
    get renders() { return renders; }, get subscribed() { return subscribed; }, get visible() { return visible; },
    async close() {
      await emit("session_shutdown");
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
      await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

test("fresh and retired Workspace preferences render only Composer, with migration deferred until an explicit save", async () => {
  const legacy = { enabled: true, look: "biolume", motion: "ambient", scene: false, gaze: "mouse", theme: true, icons: "plain" };
  for (const saved of [undefined, legacy]) {
    const h = await harness("tui", saved);
    try {
      await h.emit("session_start");
      assert.match(h.header.render(100).map(plain).join("\n"), /pi \/ composer/);
      assert.match(h.editor.render(100).map(plain).join("\n"), /What’s next\?/);
      for (const old of ["biolume", "hearth", "studio", "orbit", "lab", "scene", "gaze", "motion ambient"])
        assert.deepEqual(h.completions(old), [], `${old} must not be offered`);
      if (!saved) continue;
      const path = join(h.ctx.cwd, "pi-home.json");
      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), saved, "opening must not rewrite older preferences");
      await h.command("motion off");
      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), saved, "explicit save leaves legacy data intact");
      const persisted = JSON.parse(readFileSync(join(h.ctx.cwd, "pi-composer.json"), "utf8"));
      assert.equal(persisted.look, "composer");
      assert.equal(persisted.motion, "off");
      assert.equal(persisted.icons, "plain");
      assert.deepEqual(Object.keys(persisted).sort(), ["enabled", "icons", "look", "motion", "theme"].sort());
    } finally { await h.close(); }
  }
});

test("questions stay above the complete Workspace workspace and restore placement after nested prompts", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    await h.command("composer");
    await h.emit("agent_start");
    const key = "pi-workspace:dock";
    const draft = h.editor;
    draft.setText("Keep this draft");
    assert.equal(h.placements.get(key), "aboveEditor");
    for (const toolName of ["ask_user_question", "ask_questions"]) {
      await h.emit("tool_execution_start", { toolCallId: "q", toolName });
      await h.emit("ui_prompt_start", { kind: "custom" });
      assert.equal(h.placements.get(key), "belowEditor", "question is above Workspace, not between Workspace and footer");
      const text = h.widgets.get(key).render(100).map(plain).join("\n");
      assert.doesNotMatch(text, /Waiting for you|Your turn|What do you think|Questions|Question|tool.*running/);
      await h.emit("ui_prompt_start", { kind: "custom" });
      await h.emit("ui_prompt_end", { kind: "custom" });
      assert.equal(h.placements.get(key), "belowEditor", "nested close must not restore early");
      await h.emit("ui_prompt_end", { kind: "custom" });
      assert.equal(h.placements.get(key), "aboveEditor", "submit/cancel/abort share the prompt-end restoration");
      await h.emit("tool_execution_end", { toolCallId: "q", toolName });
      assert.equal(h.editor, draft);
      assert.equal(draft.getText(), "Keep this draft");
    }
    await h.emit("ui_prompt_start", { kind: "select" });
    assert.equal(h.placements.get(key), "aboveEditor", "unrelated dialogs keep the normal layout");
    await h.emit("ui_prompt_end", { kind: "select" });
  } finally { await h.close(); }
});

test("lifecycle: timings, parallel tools, prompts, command persistence, restore and shutdown", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    assert.equal(h.subscribed, 1);
    assert.equal(h.visible, false);
    assert.match(h.editor.render(100).map(plain).join(""), /Untitled session/);
    h.rename("Our new workspace 界面");
    await h.emit("session_info_changed", { name: "Our new workspace 界面" });
    assert.match(h.editor.render(100).map(plain).join(""), /Our new workspace 界面/);
    const original = h.editor;
    h.editor.setText("draft");
    await h.command("motion off");
    assert.equal(h.editor, original);
    assert.equal(h.editor.getText(), "draft");
    assert.equal(JSON.parse(readFileSync(join(h.ctx.cwd, "pi-composer.json"), "utf8")).look, "composer");
    await h.emit("agent_start");
    await h.emit("agent_start");
    assert.equal(h.entries.filter(e => e.customType === TIMING_ENTRY).length, 1);
    await h.emit("tool_execution_start", { toolCallId: "a", toolName: "read" });
    await h.emit("tool_execution_start", { toolCallId: "b", toolName: "bash" });
    assert.match(plain(h.editor.render(100)[0]), /2 tools/);
    await h.emit("ui_prompt_start");
    assert.match(plain(h.editor.render(100)[0]), /Waiting for you/);
    await h.emit("ui_prompt_end");
    await h.emit("tool_execution_end", { toolCallId: "a" });
    assert.match(plain(h.editor.render(100)[0]), /running/);
    await h.emit("message_end", { message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] } });
    await h.emit("agent_settled");
    assert.equal(h.entries.filter(e => e.customType === TIMING_ENTRY).length, 2);
    assert.match(h.editor.render(100).map(plain).join(" "), /Our new workspace 界面/);
    await h.command("motion off");
    await h.command("icons plain");
    await h.command("off");
    assert.equal(h.editor, undefined);
    assert.equal(h.widgets.size, 1, "independent activity strip stays when workspace is off");
    assert.equal(h.visible, true);
    assert.equal(h.subscribed, 1, "custom footer stays when workspace is off");
    await h.command("on");
    assert.equal(h.subscribed, 1);
    h.entries.length = 0;
    await h.emit("session_tree");
    assert.match(h.editor.render(100).map(plain).join(" "), /What’s next\?/);
  } finally { await h.close(); }
  assert.equal(h.subscribed, 0);
  const renders = h.renders;
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(h.renders, renders, "no rendering timer after shutdown");
});

test("/workspace overlay keeps the real Composer editor visible and previews rail changes transactionally", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    h.rename("Actual session");
    await h.command("composer");
    const editor = h.editor;
    editor.setText("Unsent draft 界面");
    const frame = () => editor.render(100).map(plain).join("\n");
    assert.match(frame(), /Actual session/);
    const open = h.workspaceCommand();
    for (let i = 0; i < 20 && !h.picker?.component; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const panel = h.picker.component;
    assert.equal(h.picker.options.overlay, true);
    assert.equal(h.picker.options.overlayOptions.anchor, "top-left");
    assert.equal(h.picker.options.overlayOptions.width, "100%");
    assert.match(panel.render(90).map(plain).join("\n"), /Your live input · appearance preview/);
    assert.match(panel.render(90).map(plain).join("\n"), /Unsent draft 界面/);
    assert.match(panel.render(90).map(plain).join("\n"), /Actual session/);
    assert.equal(h.editor, editor, "opening settings must not swap out the native editor");
    await h.emit("ui_prompt_start", { kind: "custom" });
    assert.doesNotMatch(frame(), /Live preview/);
    assert.doesNotMatch(frame(), /Waiting for you/, "settings are not a question awaiting an answer");
    panel.handleInput("\x1b[B"); // Chat title
    panel.handleInput("\r"); panel.handleInput("\r"); // Open properties, switch visibility
    assert.doesNotMatch(frame(), /Actual session/, "the actual full-width frame updates while settings are open");
    assert.match(frame(), /Unsent draft 界面/);
    panel.handleInput("\x1b"); panel.handleInput("\x1b"); panel.handleInput("\r"); await open;
    await h.emit("ui_prompt_end", { kind: "custom" });
    assert.match(frame(), /Actual session/, "Cancel restores the live frame");
    assert.equal(h.editor, editor);
    assert.equal(editor.getText(), "Unsent draft 界面");
  } finally { await h.close(); }
});

test("approved composer has one real working indicator, no context capsule, and event-aware status", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    const editor = h.editor;
    editor.setText("Real draft 界面");
    await h.command("composer");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.editor, editor);
    assert.equal(editor.getText(), "Real draft 界面");
    assert.equal(theme.name, "pi-workspace-composer");
    const all = () => [...h.widgets.values()].flatMap(c => c.render(120)).concat(h.editor.render(120), h.footer.render(120)).map(plain).join("\n");
    await h.emit("agent_start");
    assert.equal(h.visible, false, "Pi's default working display must be hidden");
    assert.equal((all().match(/working/gi) ?? []).length, 1, all());
    assert.doesNotMatch(all(), /\ue0b6|\ue0b4|SIMULATED|sample plan|42%/);
    assert.doesNotMatch(all(), /10%/, "context usage is optional and off in Composer by default");
    assert.match(h.editor.render(120).map(plain).join("\n"), /working/i);
    await h.emit("tool_execution_start", { toolCallId: "one", toolName: "read" });
    await h.emit("tool_execution_start", { toolCallId: "two", toolName: "bash" });
    assert.match(all(), /2 tools running/);
    await h.emit("ui_prompt_start");
    assert.match(all(), /Waiting for you/);
    assert.doesNotMatch(all(), /working|2 tools running/i);
    await h.emit("ui_prompt_end");
    await h.emit("tool_execution_end", { toolCallId: "two", toolName: "bash", isError: true });
    assert.doesNotMatch(all(), /Tool failed/);
    assert.match(all(), /1 tool running/);
    await h.emit("tool_execution_end", { toolCallId: "one", toolName: "read", isError: false });
    await h.emit("message_update", { assistantMessageEvent: { type: "text_delta" } });
    assert.match(all(), /Writing reply/);
    await h.emit("message_end", { message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Reply" }] } });
    await h.emit("agent_settled");
    assert.match(all(), /your turn/);
    assert.doesNotMatch(all(), /Tool failed/, "tool results remain in the transcript, not a persistent composer warning");
    assert.doesNotMatch(all(), /last run /, "last-run clutter stays hidden in the minimal Composer view");
    const rail = h.editor.render(120).map(plain).find(line => line.startsWith("╰"));
    assert.match(rail, /test-model/);
    assert.match(rail, /pi-workspace-test/, "directory and model belong to the bottom rail");
    await h.command("motion off");
    await h.emit("agent_start");
    const still = h.editor.render(120);
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.deepEqual(h.editor.render(120), still);
    assert.equal(h.visible, false);
    assert.doesNotMatch(all(), /Tool failed: bash/);
    await h.emit("message_end", { message: { role: "assistant", stopReason: "error", content: [] } });
    await h.emit("agent_settled");
    assert.match(all(), /Run failed/);
    await h.emit("agent_start");
    assert.doesNotMatch(all(), /Run failed/);
    await h.emit("message_end", { message: { role: "assistant", stopReason: "aborted", content: [] } });
    await h.emit("agent_settled");
    assert.match(all(), /Run stopped/);
    await h.command("off");
    assert.equal(theme.name, "dark", "turning Workspace off restores preceding theme");
  } finally { await h.close(); }
});

for (const order of ["before", "after"]) test(`composer adopts pi-vim installed ${order} Workspace without replacing its instance or losing animation`, async () => {
  const { ModalEditor } = await jiti.import(join(source, "../../node_modules/pi-vim/index.ts"));
  const h = await harness();
  let vim, nativeRender;
  const vimFactory = (tui, theme, kb) => {
    vim = new ModalEditor(tui, theme, kb); vim.setClipboardMirrorPolicy("never");
    nativeRender = vim.render; return vim;
  };
  try {
    writeFileSync(join(h.ctx.cwd, "pi-composer.json"), JSON.stringify({ ...DEFAULTS, look: "composer" }));
    if (order === "before") h.ctx.ui.setEditorComponent(vimFactory);
    await h.emit("session_start");
    if (order === "after") h.ctx.ui.setEditorComponent(vimFactory);
    vim.setText("Vim draft 界面");
    vim.handleInput("\x1b"); vim.handleInput("0"); vim.handleInput("x");
    await h.emit("agent_start");
    assert.equal(h.editor, vim);
    assert.equal(h.ctx.ui.getEditorComponent(), vimFactory, "do not compete for editor ownership");
    assert.match(plain(vim.render(100)[0]), /Working.*Untitled session/);
    const rail = () => vim.render(100)[0];
    const before = rail(), renders = h.renders;
    await new Promise(resolve => setTimeout(resolve, 220));
    assert.notEqual(rail(), before, "the actual native editor frame advances during work");
    assert.ok(h.renders > renders, "Workspace animation scheduler requests renders with Vim focused");
    vim.handleInput("u"); assert.equal(vim.getText(), "Vim draft 界面", "undo predating adoption survives");
    assert.match(vim.render(100).map(plain).find(line => line.startsWith("╰")), /NORMAL|INSERT/);
    assert.ok(visibleWidth(vim.render(100)[0]) <= 100);
    await h.command("off");
    assert.equal(h.editor, vim);
    assert.equal(vim.render, nativeRender);
  } finally { await h.close(); }
});

test("live Workspace decorates sent messages and restores them on disable, re-enable and shutdown", async () => {
  const { UserMessageComponent } = await import(pathToFileURL(join(host, "index.js")));
  const h = await harness(), user = new UserMessageComponent("My sent message");
  const native = user.render;
  h.tui.children = [user];
  try {
    await h.emit("session_start"); await h.command("composer");
    assert.match(plain(user.render(90)[0]), /╭ jordan/);
    await h.command("off"); assert.equal(user.render, native);
    await h.command("on"); assert.match(plain(user.render(90)[0]), /╭ jordan/);
    await h.emit("session_shutdown"); assert.equal(user.render, native);
  } finally { await h.close(); }
});

test("live Workspace mounts Activity Blocks, observes nested tool kinds and restores native tools on shutdown", async () => {
  const { ToolExecutionComponent } = await import(pathToFileURL(join(host, "index.js")));
  const h = await harness();
  const tool = new ToolExecutionComponent("codemode", "parent", {}, { showImages: false }, undefined, h.tui, h.ctx.cwd);
  const original = tool.render, expand = tool.setExpanded;
  h.tui.children = [tool];
  try {
    await h.emit("session_start"); await h.command("composer");
    await h.emit("tool_execution_start", { toolCallId: "child", parentToolCallId: "parent", toolName: "read", args: { path: "a" } });
    assert.match(tool.render(90).map(plain).join("\n"), /Read/);
    tool.setExpanded(true);
    await h.command("output raw"); assert.match(tool.render(90).map(plain).join("\n"), /Raw arguments/);
    await h.command("output readable"); assert.doesNotMatch(tool.render(90).map(plain).join("\n"), /Raw arguments/);
    tool.setExpanded(false);
    await h.command("off"); assert.equal(tool.render, original); assert.equal(tool.setExpanded, expand);
    await h.command("composer"); assert.match(tool.render(90).map(plain).join("\n"), /Codemode/);
    await h.emit("session_shutdown"); assert.equal(tool.render, original); assert.equal(tool.setExpanded, expand);
  } finally { await h.close(); }
});

test("session identity sanitizes titles and fits small widths", () => {
  const { state, ctx } = setup();
  ctx.sessionManager = { getSessionName: () => "My 界面 session\x1b[31m\nname" };
  const identity = createIdentity(() => ctx, state);
  assert.match(identity.render(100).map(plain).join(""), /My 界面 session name/);
  for (const width of [0, 1, 2, 8, 20, 80]) {
    for (const line of identity.render(width)) assert.ok(visibleWidth(line) <= width);
  }
});

test("footer and Workspace exclude only actual blocking time, including nested passive dialogs", async () => {
  const h = await harness(), originalNow = Date.now; let time = 1000; Date.now = () => time;
  try {
    await h.emit("session_start"); await h.emit("agent_start");
    h.events.emit("pi-workspace:interaction:v1", { version: 1, sessionId: "workspace-test", id: "pi-ask:posted", active: true });
    time = 2000; await h.emit("ui_prompt_start", { kind: "custom" });
    time = 3000; await h.emit("tool_execution_start", { toolCallId: "sync", toolName: "ask_questions" });
    await h.emit("ui_prompt_start", { kind: "custom" });
    time = 8000; await h.emit("ui_prompt_end", { kind: "custom" }); await h.emit("tool_execution_end", { toolCallId: "sync", toolName: "ask_questions" });
    time = 9000; await h.emit("ui_prompt_end", { kind: "custom" });
    time = 11000; await h.emit("agent_settled");
    const footer = h.entries.filter(e => e.customType === "pi-workspace:footer-v1").at(-1)?.data;
    const clock = h.editor.homeState.clock;
    assert.equal(clock.timing.activeMs, 5000);
    const snapshot = h.entries.filter(e => e.data?.lastRunBasis === "active").at(-1)?.data;
    assert.equal(snapshot.lastRunMs, clock.timing.activeMs);
  } finally { Date.now = originalNow; await h.close(); }
});

test("posted-question and Tasks overlays keep real work timing active but pause motion; synchronous Ask still waits", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); await h.emit("agent_start");
    const state = h.editor.homeState;
    for (const id of ["pi-tasks:browser", "pi-ask:posted"]) {
      h.events.emit("pi-workspace:interaction:v1", { version: 1, sessionId: "workspace-test", id, active: true });
      await h.emit("ui_prompt_start", { kind: "custom" });
      assert.equal(state.promptDepth, 1); assert.equal(state.blockingPromptDepth, 0);
      assert.notEqual(state.railStatus().state, "waiting", "footer status shares the passive-dialog policy");
      assert.match(state.clock.label(Date.now()), /^working /);
      assert.equal(shouldAnimate(state, Date.now(), false), false, "input-owning overlay is visually still");
      await h.emit("tool_execution_start", { toolCallId: "synchronous", toolName: "ask_user_question" });
      await h.emit("ui_prompt_start", { kind: "custom" });
      assert.equal(state.blockingPromptDepth, 1); assert.equal(state.clock.label(Date.now()), "waiting for you");
      assert.equal(state.railStatus().state, "waiting", "synchronous Ask still blocks both status adapters");
      await h.emit("ui_prompt_end", { kind: "custom" });
      await h.emit("tool_execution_end", { toolCallId: "synchronous", toolName: "ask_user_question" });
      assert.match(state.clock.label(Date.now()), /^working /);
      await h.emit("ui_prompt_end", { kind: "custom" });
      h.events.emit("pi-workspace:interaction:v1", { version: 1, sessionId: "workspace-test", id, active: false });
    }
    h.events.emit("pi-workspace:interaction:v1", { version: 1, sessionId: "wrong-session", id: "pi-ask:posted", active: true });
    await h.emit("ui_prompt_start", { kind: "custom" });
    assert.equal(state.clock.label(Date.now()), "waiting for you", "foreign sessions cannot suppress a blocking clock pause");
    await h.emit("ui_prompt_end", { kind: "custom" });
  } finally { await h.close(); }
});

test("session replacement detaches owned mounts and makes queued old renders inert, even after remount", async () => {
  const h = await harness();
  try {
    for (const reason of ["new", "resume", "reload", "quit"]) {
      await h.emit("session_start", { reason: "new" });
      const old = [h.header, h.widgets.get("pi-workspace:dock"), h.editor, h.footer];
      const paints = old.map(component => component.render);
      const nativeWorking = h.visible;
      await h.emit("session_shutdown", { reason });
      assert.equal(h.header, undefined);
      assert.equal(h.widgets.has("pi-workspace:dock"), false);
      assert.equal(h.editor, undefined);
      assert.equal(h.subscribed, 0);
      assert.equal(h.visible, nativeWorking, "teardown must not resurrect the native working loader");
      for (const paint of paints) assert.deepEqual(paint(100), [], "a queued paint cannot read an inactive session");
      await h.emit("session_shutdown", { reason });
      await h.emit("session_start", { reason: "new" });
      assert.equal(h.subscribed, 1);
      assert.ok(h.header.render(100).length);
      for (const paint of paints) assert.deepEqual(paint(100), [], "new context must not reactivate old mounts");
      await h.emit("session_shutdown", { reason: "new" });
    }
  } finally { await h.close(); }
});

test("shutdown disposes a temporary native Composer preview before invalidating context or awaiting dialog cleanup", async () => {
  const { ModalEditor } = await jiti.import(join(source, "../../node_modules/pi-vim/index.ts"));
  const h = await harness();
  try {
    h.ctx.ui.setEditorComponent((tui, theme, kb) => new ModalEditor(tui, theme, kb));
    await h.emit("session_start");
    await h.command("off");
    const native = h.editor;
    native.setText("Unsent preview draft 界面");
    const picker = h.workspaceCommand();
    const deadline = Date.now() + 3000;
    while (!h.picker && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(h.picker, "preview must actually be mounted before testing teardown");
    const queuedRender = native.render;
    // Exercise the exact boundary before the appearance owner's later abort hook runs.
    const [runtimeShutdown, ...otherShutdowns] = h.handlers.get("session_shutdown");
    runtimeShutdown({ type: "session_shutdown", reason: "new" }, h.ctx);
    assert.doesNotThrow(() => queuedRender(100));
    assert.equal(native.getText(), "Unsent preview draft 界面");
    for (const fn of otherShutdowns) await fn({ type: "session_shutdown", reason: "new" }, h.ctx);
    await picker;
  } finally { await h.close(); }
});

test("Composer off/on leaves old queued components inert without replacing the current native draft", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    const stale = h.widgets.get("pi-workspace:dock");
    await h.command("off");
    assert.deepEqual(stale.render(100), []);
    await h.command("on");
    h.editor.setText("Current draft 界面");
    assert.deepEqual(stale.render(100), []);
    assert.equal(h.editor.getText(), "Current draft 界面");
  } finally { await h.close(); }
});

test("print/json/rpc sessions never install UI or append appearance metadata", async () => {
  for (const mode of ["print", "json", "rpc"]) {
    const h = await harness(mode);
    try {
      await h.emit("session_start");
      await h.emit("agent_start");
      await h.emit("agent_settled");
      assert.equal(h.editor, undefined);
      assert.equal(h.subscribed, 0);
      assert.equal(h.entries.length, 0);
      assert.equal(h.renders, 0);
    } finally { await h.close(); }
  }
});
