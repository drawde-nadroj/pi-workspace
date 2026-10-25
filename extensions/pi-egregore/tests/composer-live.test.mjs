import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, kb, theme, plain, visibleWidth, CURSOR_MARKER } from "./host.mjs";
const { ModalEditor } = await jiti.import(join(source, "../../node_modules/pi-vim/index.ts"));
const { dressComposerEditor } = await jiti.import(join(source, "composer-editor.ts"));
const { composerPadding, composerMessageRail, composerBottomRail, composerFrame, composerRail, composerSurface, composerThemeColors, composerThinkingBorder, userFrameColor } = await jiti.import(join(source, "composer-style.ts"));
const { ComposerEditor } = await jiti.import(join(source, "ui.ts"));
const { COMPOSER_ICONS } = await jiti.import(join(source, "composer-icons.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "state.ts"));
const { FOOTER_DEFAULTS, ActivityClock } = await jiti.import(join(source, "footer-state.ts"));
const { composerStatus, composerStatusRows } = await jiti.import(join(source, "composer-live.ts"));
const { createDock } = await jiti.import(join(source, "dock.ts"));
const { appearanceBorder, appearanceColor } = await jiti.import(join(source, "appearance-render.ts"));
const { appearanceDefaults } = await jiti.import(join(source, "appearance.ts"));
const { TuiMainScreen, TuiAltScreen, colorToHex, parseColor } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { getEditorTheme } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js")));
function state() { return { prefs: { ...DEFAULTS, look: "composer" }, clock: new RunClock(), tools: new Map(), phase: "working", promptDepth: 0, compacting: false, lastInputAt: 0, editorFocused: () => true }; }
const ctx = { ui: { theme }, sessionManager: { getSessionId: () => "a real session", getSessionName: () => "Alchemy" } };

test("Pi accent stays on the composer border while model and selected thinking level share the bottom-right", () => {
  const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const palette = composerThemeColors(false);
  const roleTheme = { ...theme, colors: { ...theme.colors, ...Object.fromEntries(Object.entries(palette).map(([role, hex]) => [role, hex ? parseColor(hex) : theme.colors[role]])) } };
  for (const level of levels) assert.equal(colorToHex(composerThinkingBorder(roleTheme, level)), palette.accent);
  assert.equal(colorToHex(composerThinkingBorder(theme, "unknown")), colorToHex(theme.colors.accent));
  let level = "off";
  const workspace = state(); workspace.prefs.motion = "off"; workspace.thinkingLevel = () => level;
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const fullCtx = { ...ctx, cwd: "/tmp", model: { id: "test-model" }, getContextUsage: () => ({ percent: 24, contextWindow: 200000 }) };
  const native = new ComposerEditor(tui, getEditorTheme(), kb, () => fullCtx, workspace, () => level, () => 10000);
  native.focused = true; native.setText("draft 界面");
  const vim = new ModalEditor(tui, getEditorTheme(), kb); vim.focused = true; vim.setText("draft 界面");
  const cleanup = dressComposerEditor(vim, () => fullCtx, workspace, () => 10000, () => 40);
  try {
    for (const editor of [native, vim]) {
      const rendered = levels.map(current => { level = current; return editor.render(85); });
      assert.equal(new Set(rendered.map(rows => rows[0])).size, 1, "top rail retains a fixed accent");
      assert.equal(new Set(rendered.map(rows => rows.find(row => plain(row).startsWith("╰")))).size, levels.length, rendered.map(rows => plain(rows.find(row => plain(row).startsWith("╰")))).join("\n"));
      assert.ok(rendered.every((rows, i) => plain(rows.find(row => plain(row).startsWith("╰"))).includes(`test-model · ${levels[i]}`)));
      assert.deepEqual(rendered.map(rows => rows.slice(0, -1).map(plain)), Array(levels.length).fill(rendered[0].slice(0, -1).map(plain)), "input geometry and content stay unchanged");
      assert.ok(rendered.every(rows => rows.join("").split(CURSOR_MARKER).length - 1 === 1), "IME cursor survives");
      assert.equal(editor.getText(), "draft 界面");
    }
    workspace.prefs.motion = "work"; workspace.clock.begin(1000); workspace.lastInputAt = 0;
    level = "low"; const movingLow = vim.render(85);
    level = "high"; const movingHigh = vim.render(85);
    assert.equal(movingLow[0], movingHigh[0], "motion stays on the same accent regardless of thinking level");
    assert.notEqual(plain(movingLow.at(-1)), plain(movingHigh.at(-1)), "level changes only its bottom-right text");
  } finally { cleanup(); }
});

for (const Renderer of [TuiMainScreen, TuiAltScreen]) test(`${Renderer.name}: decorate real pi-vim in place; motion, Unicode, native cursor and undo survive`, () => {
  let input = () => {}, now = 10000;
  const writes = [];
  const terminal = { columns: 100, rows: 40, kittyProtocolActive: false, start(fn) { input = fn; }, stop() {}, async drainInput() {}, write(text) { writes.push(text); }, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  const tui = new Renderer(terminal, false), workspace = state();
  const editor = new ModalEditor(tui, getEditorTheme(), kb);
  editor.setClipboardMirrorPolicy("never");
  tui.addChild(editor); tui.setFocus(editor);
  const original = editor.render;
  let cleanup;
  try {
    tui.start();
    editor.setText("one two 界面");
    input("\x1b"); input("0"); input("x");
    assert.equal(editor.getText(), "ne two 界面");
    const cursor = editor.getCursor();
    cleanup = dressComposerEditor(editor, () => ctx, workspace, () => now, () => terminal.rows);
    assert.deepEqual(editor.getCursor(), cursor);
    input("u"); assert.equal(editor.getText(), "one two 界面", "undo made before decoration survives");
    input("x"); const beforeQuestion = editor.getText(), beforeCursor = editor.getCursor();
    workspace.promptDepth++;
    // Exactly the native custom-screen restoration call, before ui_prompt_end.
    editor.setText(beforeQuestion);
    workspace.promptDepth--;
    assert.deepEqual(editor.getCursor(), beforeCursor);
    input("u"); assert.equal(editor.getText(), "one two 界面", "question restoration does not erase Vim undo");
    assert.match(editor.render(100).map(plain).join("\n"), /NORMAL/);
    input("i"); assert.match(editor.render(100).map(plain).join("\n"), /INSERT/);
    for (const width of [1, 2, 7, 8, 12, 20, 38, 58, 100, 160]) {
      const lines = editor.render(width);
      for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${visibleWidth(line)}`);
      if (width >= 20) {
        assert.match(plain(lines[0]), width >= 50 ? /╭.*Alchemy/ : /╭.*What’s next/);
        assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
      }
    }
    const draft = editor.getText();
    workspace.clock.begin(1000); workspace.lastInputAt = 0; // agent_start clears the typing hold.
    const start = editor.render(100)[0];
    tui.renderNow(true); writes.length = 0;
    now += 420; // Sample across the glint bloom, not its intentionally quiet trough.
    const next = editor.render(100)[0];
    assert.notEqual(start, next, "actual decorated Vim rail moves, not just preview artwork");
    tui.renderNow(); assert.ok(writes.length > 0);
    assert.equal(editor.getText(), draft);
    workspace.prefs.motion = "off";
    const still = editor.render(100); now += 500;
    assert.deepEqual(editor.render(100).slice(1), still.slice(1), "draft and bottom rail stay still while elapsed status advances");
    workspace.prefs.motion = "work"; workspace.promptDepth = 1;
    const waiting = editor.render(100); now += 500;
    assert.deepEqual(editor.render(100).slice(1), waiting.slice(1), "dialog pauses motion, not the elapsed time label");
    cleanup(); cleanup();
    assert.equal(editor.render, original);
    assert.equal(editor.getText(), draft);
  } finally { cleanup?.(); tui.stop(); }
});

test("decorated Vim retains literal rules, scroll hints, large paste storage and mouse completion", async () => {
  const workspace = state(), tui = { terminal: { rows: 40 }, requestRender() {} };
  const editor = new ModalEditor(tui, getEditorTheme(), kb);
  editor.setClipboardMirrorPolicy("never"); editor.focused = true;
  const cleanup = dressComposerEditor(editor, () => ctx, workspace, () => 10000, () => tui.terminal.rows);
  try {
    editor.setText("──── literal rule\nfollowing line");
    const rows = editor.render(90).map(plain);
    assert.match(rows.join("\n"), /│.*──── literal rule/);
    assert.match(rows.join("\n"), /│.*following line/);
    assert.equal(rows.filter(row => row.startsWith("╰")).length, 1);
    assert.match(rows[1], /^│\s+│$/);
    const cursor = editor.getCursor();
    editor.handleMouse({ type: "click", button: "left", x: 5, y: 1, width: 90, height: rows.length });
    assert.deepEqual(editor.getCursor(), cursor, "padding does not move the cursor");
    tui.terminal.rows = 22;
    assert.equal(editor.render(90).length, rows.length - 2, "padding yields in short panes");
    tui.terminal.rows = 40;
    editor.setText("row 界面\n".repeat(40));
    assert.match(plain(editor.render(90)[0]), /↑ \d+ more/);
    editor.setText("");
    const paste = "界面 word ".repeat(400);
    editor.handleInput("\x1b[200~" + paste + "\x1b[201~");
    assert.equal(editor.getExpandedText(), paste);
    workspace.promptDepth = 1; editor.setText(editor.getText()); workspace.promptDepth = 0;
    assert.equal(editor.getExpandedText(), paste);
    editor.setText("");
    editor.setAutocompleteProvider({ triggerCharacters: ["/"],
      async getSuggestions() { return { prefix: "/", items: [{ value: "/hello", label: "hello" }, { value: "/composer", label: "workspace" }] }; },
      applyCompletion(_lines, _row, _col, item) { return { lines: [item.value], cursorLine: 0, cursorCol: item.value.length }; },
    });
    editor.handleInput("/"); await new Promise(resolve => setTimeout(resolve, 100));
    const lines = editor.render(90), bottom = lines.findIndex(row => plain(row).startsWith("╰"));
    const item = lines.findIndex((row, i) => i > bottom && plain(row).includes("workspace"));
    assert.ok(item > bottom);
    editor.handleMouse({ type: "click", button: "left", x: 6, y: item, screenX: 6, screenY: item, width: 90, height: lines.length, shift: false, alt: false, ctrl: false });
    assert.equal(editor.getText(), "/composer");
  } finally { cleanup(); }
});

test("live ember moves during work and typing; pauses for dialogs/off; stops without fake progress", () => {
  const workspace = state(), clock = new ActivityClock();
  workspace.clock.begin(1000); clock.begin(1000);
  const render = time => composerStatusRows(workspace, clock, FOOTER_DEFAULTS, time, theme, 100);
  assert.notEqual(render(10000)[0], render(10400)[0]);
  workspace.editorFocused = () => false;
  assert.notEqual(render(10000)[0], render(10400)[0], "work is not coupled to editor/transcript focus");
  workspace.promptDepth = 1; assert.match(plain(render(10100)[0]), /Waiting for you/);
  workspace.tools.set("question", "ask_questions");
  assert.deepEqual(render(10100), [], "the question frame owns the only heading");
  workspace.tools.delete("question");
  assert.deepEqual(render(10000), render(10100));
  workspace.promptDepth = 0; workspace.lastInputAt = 9900;
  assert.notDeepEqual(render(10000), render(10400), "typing does not freeze activity");
  workspace.lastInputAt = 0; workspace.prefs.motion = "off";
  assert.deepEqual(render(10000), render(10100));
  assert.equal(composerPadding(90, 40), 1);
  assert.equal(composerPadding(90, 24), 0);
  assert.equal(composerPadding(30, 40), 0);
  workspace.prefs.motion = "work"; workspace.clock.settle(11000, "done");
  const arrival = composerMessageRail(theme, 100, workspace, 11100, "a real session");
  assert.match(plain(arrival), /a real session/);
  assert.doesNotMatch(plain(arrival), /[✧✦⋆·]/);
  assert.equal(arrival, composerMessageRail(theme, 100, workspace, 11500, "a real session"), "finished state is static");
  assert.equal(composerMessageRail(theme, 100, workspace, 12000, "a real session"), composerMessageRail(theme, 100, workspace, 13000, "a real session"));
  workspace.clock.begin(11100); workspace.clock.settle(11200, "error");
  const failed = composerMessageRail(theme, 100, workspace, 11200, "a real session");
  assert.equal(failed, composerMessageRail(theme, 100, workspace, 11400, "a real session"));
  assert.equal(COMPOSER_ICONS.context, "");
  assert.equal(new Set(Object.values(COMPOSER_ICONS)).size, Object.values(COMPOSER_ICONS).length);
});

test("bottom rail keeps thinking visible with a long model name and gives native scroll indicators priority", () => {
  const workspace = state(); workspace.layout = { ...FOOTER_DEFAULTS }; workspace.thinkingLevel = () => "xhigh";
  const context = { cwd: "/tmp/project", model: { name: "provider/model-with-an-exceptionally-long-name" } };
  const rail = composerBottomRail(theme, 58, workspace, context, "NORMAL");
  assert.ok(visibleWidth(rail) <= 58);
  assert.match(plain(rail), /\/tmp\/project/);
  assert.match(plain(rail), /NORMAL/);
  assert.match(plain(rail), /xhigh/);
  const scroll = composerBottomRail(theme, 58, workspace, context, "NORMAL", "↓ 3 more");
  assert.match(plain(scroll), /↓ 3 more/);
  assert.doesNotMatch(plain(scroll), /xhigh/);
});

test("session title remains centered at mid-width without displacing run state or native scroll", () => {
  const workspace = state(); workspace.prefs.motion = "off"; workspace.layout = { ...FOOTER_DEFAULTS };
  workspace.lastUserSentAt = () => new Date(2025, 4, 8, 12, 30).getTime();
  for (const width of [40, 42, 48, 50, 80]) {
    const row = plain(composerMessageRail(theme, width, workspace, workspace.lastUserSentAt() + 1000, "Alchemy"));
    assert.match(row, /What’s next/);
    assert.match(row, /Alch/, `title missing at ${width}: ${row}`);
    assert.ok(visibleWidth(row) <= width);
  }
  const scroll = plain(composerMessageRail(theme, 80, workspace, workspace.lastUserSentAt() + 1000, "Alchemy", "↑ 2 more"));
  assert.match(scroll, /Alchemy/);
  assert.match(scroll, /↑ 2 more/);
  workspace.layout.railTitle = "off";
  assert.doesNotMatch(plain(composerMessageRail(theme, 80, workspace, workspace.lastUserSentAt() + 1000, "Alchemy")), /Alchemy/);
});

test("composer top-right shows only a recorded user-send time in user red, with native scroll priority", () => {
  const workspace = state(); workspace.prefs.motion = "off"; workspace.layout = { ...FOOTER_DEFAULTS };
  workspace.nextHint = () => "review tests";
  const at = new Date(2025, 4, 8, 12, 30).getTime(), now = at + 60_000;
  assert.match(plain(composerMessageRail(theme, 100, workspace, now, "Alchemy")), /Next: review tests/);
  workspace.lastUserSentAt = () => at;
  const sent = composerMessageRail(theme, 100, workspace, now, "Alchemy");
  const seconds = new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  assert.ok(plain(sent).includes(`${COMPOSER_ICONS.sent} ${seconds}`));
  assert.ok(sent.includes(theme.style(` ${COMPOSER_ICONS.sent} ${seconds} `, { fg: userFrameColor(theme), bold: true })), "time uses the user frame red");
  assert.doesNotMatch(plain(sent), /Next: review tests/);
  assert.equal(sent, composerMessageRail(theme, 100, workspace, now + 20_000, "Alchemy"), "recorded time does not tick");
  assert.match(plain(composerMessageRail(theme, 100, workspace, now, "Alchemy", "↑ 3 more")), /↑ 3 more/);
  assert.doesNotMatch(plain(composerMessageRail(theme, 100, workspace, now, "Alchemy", "↑ 3 more")), /Sent/);
  assert.doesNotMatch(plain(composerMessageRail(theme, 38, workspace, now, "Alchemy")), /Sent/);
  workspace.lastUserSentAt = () => undefined;
  assert.doesNotMatch(plain(composerMessageRail(theme, 100, workspace, now, "Alchemy")), /Sent/);
});

test("Chronomancer hides run-state rail without hiding session title or changing normal mode", () => {
  const workspace = state(); workspace.prefs.motion = "off"; workspace.layout = { ...FOOTER_DEFAULTS };
  workspace.railStatus = () => ({ text: "your turn", tone: "success" });
  const at = new Date(2025, 4, 8, 12, 30).getTime();
  workspace.lastUserSentAt = () => at;
  assert.match(plain(composerMessageRail(theme, 110, workspace, at, "Alchemy")), /your turn/);
  workspace.chronomancerDay = "2025-05-01";
  const inMode = plain(composerMessageRail(theme, 110, workspace, at, "Alchemy"));
  assert.doesNotMatch(inMode, /your turn/);
  assert.match(inMode, /Alchemy/);
  assert.match(inMode, /2025-05-08/);
  workspace.chronomancerDay = undefined;
  assert.match(plain(composerMessageRail(theme, 110, workspace, at, "Alchemy")), /your turn/);
});

test("Chronomancer makes the native composer frame red, preserves Vim and explicit /egregore frame colors", () => {
  const workspace = state(); workspace.prefs.motion = "off"; workspace.layout = { ...FOOTER_DEFAULTS };
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const vim = new ModalEditor(tui, getEditorTheme(), kb);
  vim.setText("unsent red draft");
  const cleanup = dressComposerEditor(vim, () => ctx, workspace, () => 10000, () => 40);
  const rgbAnsi = color => `\x1b[38;2;${[1, 3, 5].map(i => parseInt(colorToHex(color).slice(i, i + 2), 16)).join(";")}m`;
  try {
    const normal = vim.render(90);
    workspace.chronomancerDay = "2025-05-01";
    const red = vim.render(90), redAnsi = rgbAnsi(userFrameColor(theme));
    assert.notEqual(normal[0], red[0], "active mode changes the existing frame");
    assert.equal(colorToHex(appearanceBorder(theme, workspace)), colorToHex(userFrameColor(theme)));
    assert.ok(red[0].includes(redAnsi), "top rail is red");
    assert.ok(red[1].includes(redAnsi), "composer side is red");
    assert.ok(red.find(row => plain(row).startsWith("╰"))?.includes(redAnsi), "bottom rail is red");
    assert.equal(vim.getText(), "unsent red draft");
    assert.match(plain(red.join("\n")), /INSERT/);
    workspace.layout.appearance = appearanceDefaults(workspace.layout);
    assert.ok(vim.render(90)[0].includes(redAnsi), "the default /egregore layout is red in mode too");
    workspace.layout.appearance.frameColor = "blue";
    assert.equal(colorToHex(appearanceBorder(theme, workspace)), colorToHex(appearanceColor(theme, "blue")));
    assert.ok(vim.render(90)[0].includes(rgbAnsi(appearanceColor(theme, "blue"))));
    workspace.layout.appearance.frameColor = "accent";
    workspace.layout.appearance.states = { idle: { frameColor: "green" } };
    assert.equal(colorToHex(appearanceBorder(theme, workspace)), colorToHex(appearanceColor(theme, "green")));
    workspace.layout.appearance = undefined;
    workspace.chronomancerDay = undefined;
    assert.equal(vim.render(90)[0], normal[0], "normal accent returns on exit");
    assert.equal(vim.getText(), "unsent red draft");
    for (const appearance of ["dark", "light"]) {
      const current = { ...theme, colors: theme.colors, appearance };
      workspace.chronomancerDay = "2025-05-01";
      assert.equal(colorToHex(appearanceBorder(current, workspace)), colorToHex(userFrameColor(current)));
    }
  } finally { cleanup(); }
});

test("ember changes shape without moving text or border geometry, and obeys motion gates", () => {
  const workspace = state(); workspace.clock.begin(1000);
  for (const width of [1, 3, 8, 20, 44, 90, 160]) {
    for (const time of [7200, 7500, 7800, 8100, 8700, 9000]) {
      const frame = composerMessageRail(theme, width, workspace, time, "unused");
      assert.ok(visibleWidth(frame) <= width);
      assert.doesNotMatch(plain(frame), /[✧✦⋆·]/);
    }
  }
  const frame = time => composerFrame(theme, [composerMessageRail(theme, 90, workspace, time, "unused"),
    composerRail(theme, 90, "", "", false)], 90, workspace, time, 1)[0];
  const a = frame(7800);
  const b = frame(8100);
  assert.notEqual(a, b, "bloom changes its brightness");
  assert.equal(plain(a).slice(8).replace(/\d+s/, "time"), plain(b).slice(8).replace(/\d+s/, "time"), "only the fixed marker and elapsed time change");
  assert.equal(visibleWidth(a), visibleWidth(b));
  assert.match(plain(a), /─{8}/);
  for (const gate of ["off", "dialog"]) {
    workspace.prefs.motion = gate === "off" ? "off" : "work";
    workspace.lastInputAt = gate === "typing" ? 7700 : 0;
    workspace.promptDepth = gate === "dialog" ? 1 : 0;
    assert.equal(plain(frame(7800)).replace(/\d+s/, "time"), plain(frame(8100)).replace(/\d+s/, "time"));
  }
});

test("composer uses the terminal background and interrupts effects on real state changes", () => {
  for (const light of [false, true]) {
    const colors = composerThemeColors(light);
    for (const token of ["selectedBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]) assert.equal(colors[token], "");
  }
  for (const input of [false, true]) {
    const row = composerSurface(theme, "draft" + CURSOR_MARKER, 30, input);
    assert.ok(row.includes("\x1b[49m"));
    assert.ok(row.includes(CURSOR_MARKER));
    assert.doesNotMatch(row, /\x1b\[(?:48[;:]|4[0-7]m|10[0-7]m)/);
  }
  const workspace = state(); workspace.clock.begin(1000);
  const render = time => composerFrame(theme, [composerMessageRail(theme, 90, workspace, time, ""),
    composerRail(theme, 90, "", "", false)], 90, workspace, time, 1)[0];
  const start = render(1100), next = render(1400);
  assert.notEqual(start, next, "start sweep advances");
  assert.equal(plain(start).slice(8), plain(next).slice(8), "status stays still beside the marker");
  assert.match(plain(start), /^╭.*╮$/);
  workspace.clock.settle(1400, "error");
  assert.equal(render(1400), render(1700), "failed run cancels motion immediately");
  workspace.clock.begin(1800); workspace.clock.settle(2000, "done");
  assert.equal(render(2100), render(2400), "settlement is static");
  assert.equal(render(2800), render(3200), "completed transitions do not linger");
});

test("run state moves into the composer rail below Tasks and timing across widths and states", () => {
  const workspace = state(), clock = new ActivityClock(1000);
  workspace.railStatus = () => composerStatus(workspace, clock);
  workspace.activityRows = () => ["TIMING"];
  const dock = { id: "pi-tasks", title: "Plan", rows: [{ text: "Current task", tone: "accent" }] };
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const dockView = createDock(tui, () => ctx, workspace, new Map([["pi-tasks", dock]]), () => false, () => 5000);
  const editor = new ModalEditor(tui, getEditorTheme(), kb);
  const cleanup = dressComposerEditor(editor, () => ctx, workspace, () => 5000, () => tui.terminal.rows);
  try {
    for (const width of [24, 38, 100]) for (const rows of [22, 40]) {
      tui.terminal.rows = rows;
      for (const phase of ["ready", "thinking", "done", "error", "stopped"]) {
        clock.restore(undefined, 1000); workspace.clock.restore(undefined); workspace.phase = "thinking";
        if (phase !== "ready") { clock.begin(1000); workspace.clock.begin(1000); }
        if (["done", "error", "stopped"].includes(phase)) { clock.settle(4000, phase); workspace.clock.settle(4000, phase); }
        const raw = [...dockView.render(width), ...editor.render(width)];
        const lines = raw.map(plain);
        raw.forEach(line => assert.ok(visibleWidth(line) <= width));
        const composer = lines.findIndex((line, index) => index > lines.findIndex(row => /TIMING/.test(row)) && line.startsWith("╭"));
        assert.ok(composer > lines.findIndex(line => /TASKS/.test(line)));
        assert.ok(composer > lines.findIndex(line => /TIMING/.test(line)));
        assert.ok(lines[composer].includes(phase === "thinking" ? "Thinking" : phase === "ready" ? "What’s next?"
          : phase === "done" ? "your turn" : phase === "error" ? "Run failed" : "Run stopped"));
        assert.equal(lines.slice(0, composer).filter(line => /your turn|Run failed|Run stopped|What’s next\?/.test(line)).length, 0);
      }
    }
  } finally { cleanup(); }
});

test("the dock shows the plan title, open work and one summary without changing task data", () => {
  const workspace = state();
  const snapshot = { id: "pi-tasks", title: "Real plan", summary: "1 of 3 done · 1 blocked",
    rows: [{ text: "● Working · Current step", tone: "accent" }, { text: "! Needs approval · waiting for a decision", tone: "warning" }] };
  const saved = structuredClone(snapshot);
  const dockView = createDock({ terminal: { rows: 40 } }, () => ctx, workspace, new Map([["pi-tasks", snapshot]]), () => true);
  const text = dockView.render(100).map(plain).join("\n");
  assert.match(text, /╭ Real plan .*1 of 3 done · 1 blocked/);
  assert.match(text, /● Working · Current step/);
  assert.match(text, /Needs approval/);
  assert.doesNotMatch(text, /Done step|Tasks/);
  assert.deepEqual(dockView.render(100).map(plain), text.split("\n"), "a steady dock does not reorder or rewrite rows");
  assert.deepEqual(snapshot, saved);
});
