import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, kb, theme, plain, visibleWidth, CURSOR_MARKER } from "./host.mjs";
const { ModalEditor } = await jiti.import(join(source, "../../node_modules/pi-vim/index.ts"));
const { dressComposerEditor } = await jiti.import(join(source, "composer-editor.ts"));
const { composerPadding, composerMessageRail, composerBottomRail, composerFrame, composerRail, composerSurface, composerThemeColors, composerThinkingBorder, userFrameColor } = await jiti.import(join(source, "composer-style.ts"));
const { HomeEditor } = await jiti.import(join(source, "ui.ts"));
const { COMPOSER_ICONS } = await jiti.import(join(source, "composer-icons.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "state.ts"));
const { FOOTER_DEFAULTS, ActivityClock } = await jiti.import(join(source, "footer-state.ts"));
const { composerStatus, composerStatusRows } = await jiti.import(join(source, "composer-live.ts"));
const { createWorkspace } = await jiti.import(join(source, "workspace.ts"));
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
  const home = state(); home.prefs.motion = "off"; home.thinkingLevel = () => level;
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const fullCtx = { ...ctx, cwd: "/tmp", model: { id: "test-model" }, getContextUsage: () => ({ percent: 24, contextWindow: 200000 }) };
  const native = new HomeEditor(tui, getEditorTheme(), kb, () => fullCtx, home, () => level, () => 10000);
  native.focused = true; native.setText("draft 界面");
  const vim = new ModalEditor(tui, getEditorTheme(), kb); vim.focused = true; vim.setText("draft 界面");
  const cleanup = dressComposerEditor(vim, () => fullCtx, home, () => 10000, () => 40);
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
    home.prefs.motion = "work"; home.clock.begin(1000); home.lastInputAt = 0;
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
  const tui = new Renderer(terminal, false), home = state();
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
    cleanup = dressComposerEditor(editor, () => ctx, home, () => now, () => terminal.rows);
    assert.deepEqual(editor.getCursor(), cursor);
    input("u"); assert.equal(editor.getText(), "one two 界面", "undo made before decoration survives");
    input("x"); const beforeQuestion = editor.getText(), beforeCursor = editor.getCursor();
    home.promptDepth++;
    // Exactly the native custom-screen restoration call, before ui_prompt_end.
    editor.setText(beforeQuestion);
    home.promptDepth--;
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
    home.clock.begin(1000); home.lastInputAt = 0; // agent_start clears the typing hold.
    const start = editor.render(100)[0];
    tui.renderNow(true); writes.length = 0;
    now += 420; // Sample across the glint bloom, not its intentionally quiet trough.
    const next = editor.render(100)[0];
    assert.notEqual(start, next, "actual decorated Vim rail moves, not just preview artwork");
    tui.renderNow(); assert.ok(writes.length > 0);
    assert.equal(editor.getText(), draft);
    home.prefs.motion = "off";
    const still = editor.render(100); now += 500;
    assert.deepEqual(editor.render(100).slice(1), still.slice(1), "draft and bottom rail stay still while elapsed status advances");
    home.prefs.motion = "work"; home.promptDepth = 1;
    const waiting = editor.render(100); now += 500;
    assert.deepEqual(editor.render(100).slice(1), waiting.slice(1), "dialog pauses motion, not the elapsed time label");
    cleanup(); cleanup();
    assert.equal(editor.render, original);
    assert.equal(editor.getText(), draft);
  } finally { cleanup?.(); tui.stop(); }
});

test("decorated Vim retains literal rules, scroll hints, large paste storage and mouse completion", async () => {
  const home = state(), tui = { terminal: { rows: 40 }, requestRender() {} };
  const editor = new ModalEditor(tui, getEditorTheme(), kb);
  editor.setClipboardMirrorPolicy("never"); editor.focused = true;
  const cleanup = dressComposerEditor(editor, () => ctx, home, () => 10000, () => tui.terminal.rows);
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
    home.promptDepth = 1; editor.setText(editor.getText()); home.promptDepth = 0;
    assert.equal(editor.getExpandedText(), paste);
    editor.setText("");
    editor.setAutocompleteProvider({ triggerCharacters: ["/"],
      async getSuggestions() { return { prefix: "/", items: [{ value: "/hello", label: "hello" }, { value: "/home", label: "home" }] }; },
      applyCompletion(_lines, _row, _col, item) { return { lines: [item.value], cursorLine: 0, cursorCol: item.value.length }; },
    });
    editor.handleInput("/"); await new Promise(resolve => setTimeout(resolve, 100));
    const lines = editor.render(90), bottom = lines.findIndex(row => plain(row).startsWith("╰"));
    const item = lines.findIndex((row, i) => i > bottom && plain(row).includes("home"));
    assert.ok(item > bottom);
    editor.handleMouse({ type: "click", button: "left", x: 6, y: item, screenX: 6, screenY: item, width: 90, height: lines.length, shift: false, alt: false, ctrl: false });
    assert.equal(editor.getText(), "/home");
  } finally { cleanup(); }
});

test("live status breathes during work and typing; pauses for dialogs/off; settles without fake progress", () => {
  const home = state(), clock = new ActivityClock();
  home.clock.begin(1000); clock.begin(1000);
  const render = time => composerStatusRows(home, clock, FOOTER_DEFAULTS, time, theme, 100);
  assert.notEqual(render(10000)[0], render(10400)[0]);
  home.editorFocused = () => false;
  assert.notEqual(render(10000)[0], render(10400)[0], "work is not coupled to editor/transcript focus");
  home.promptDepth = 1; assert.match(plain(render(10100)[0]), /Waiting for you/);
  home.tools.set("question", "ask_questions");
  assert.deepEqual(render(10100), [], "the question frame owns the only heading");
  home.tools.delete("question");
  assert.deepEqual(render(10000), render(10100));
  home.promptDepth = 0; home.lastInputAt = 9900;
  assert.notDeepEqual(render(10000), render(10400), "typing lowers pulse strength but does not freeze activity");
  home.lastInputAt = 0; home.prefs.motion = "off";
  assert.deepEqual(render(10000), render(10100));
  assert.equal(composerPadding(90, 40), 1);
  assert.equal(composerPadding(90, 24), 0);
  assert.equal(composerPadding(30, 40), 0);
  home.prefs.motion = "work"; home.clock.settle(11000, "done");
  const arrival = composerMessageRail(theme, 100, home, 11100, "a real session");
  assert.match(plain(arrival), /a real session/);
  assert.doesNotMatch(plain(arrival), /[✧✦⋆·]/);
  assert.notEqual(arrival, composerMessageRail(theme, 100, home, 11500, "a real session"));
  assert.equal(composerMessageRail(theme, 100, home, 12000, "a real session"), composerMessageRail(theme, 100, home, 13000, "a real session"));
  home.clock.begin(11100); home.clock.settle(11200, "error");
  const failed = composerMessageRail(theme, 100, home, 11200, "a real session");
  assert.equal(failed, composerMessageRail(theme, 100, home, 11400, "a real session"));
  assert.equal(COMPOSER_ICONS.context, "");
  assert.equal(new Set(Object.values(COMPOSER_ICONS)).size, Object.values(COMPOSER_ICONS).length);
});

test("bottom rail keeps thinking visible with a long model name and gives native scroll indicators priority", () => {
  const home = state(); home.layout = { ...FOOTER_DEFAULTS }; home.thinkingLevel = () => "xhigh";
  const context = { cwd: "/tmp/project", model: { name: "provider/model-with-an-exceptionally-long-name" } };
  const rail = composerBottomRail(theme, 58, home, context, "NORMAL");
  assert.ok(visibleWidth(rail) <= 58);
  assert.match(plain(rail), /\/tmp\/project/);
  assert.match(plain(rail), /NORMAL/);
  assert.match(plain(rail), /xhigh/);
  const scroll = composerBottomRail(theme, 58, home, context, "NORMAL", "↓ 3 more");
  assert.match(plain(scroll), /↓ 3 more/);
  assert.doesNotMatch(plain(scroll), /xhigh/);
});

test("session title remains centered at mid-width without displacing run state or native scroll", () => {
  const home = state(); home.prefs.motion = "off"; home.layout = { ...FOOTER_DEFAULTS };
  home.lastUserSentAt = () => new Date(2025, 4, 8, 12, 30).getTime();
  for (const width of [40, 42, 48, 50, 80]) {
    const row = plain(composerMessageRail(theme, width, home, home.lastUserSentAt() + 1000, "Alchemy"));
    assert.match(row, /What’s next/);
    assert.match(row, /Alch/, `title missing at ${width}: ${row}`);
    assert.ok(visibleWidth(row) <= width);
  }
  const scroll = plain(composerMessageRail(theme, 80, home, home.lastUserSentAt() + 1000, "Alchemy", "↑ 2 more"));
  assert.match(scroll, /Alchemy/);
  assert.match(scroll, /↑ 2 more/);
  home.layout.railTitle = "off";
  assert.doesNotMatch(plain(composerMessageRail(theme, 80, home, home.lastUserSentAt() + 1000, "Alchemy")), /Alchemy/);
});

test("composer top-right shows only a recorded user-send time in user red, with native scroll priority", () => {
  const home = state(); home.prefs.motion = "off"; home.layout = { ...FOOTER_DEFAULTS };
  home.nextHint = () => "review tests";
  const at = new Date(2025, 4, 8, 12, 30).getTime(), now = at + 60_000;
  assert.match(plain(composerMessageRail(theme, 100, home, now, "Alchemy")), /Next: review tests/);
  home.lastUserSentAt = () => at;
  const sent = composerMessageRail(theme, 100, home, now, "Alchemy");
  const seconds = new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  assert.ok(plain(sent).includes(`${COMPOSER_ICONS.sent} ${seconds}`));
  assert.ok(sent.includes(theme.style(` ${COMPOSER_ICONS.sent} ${seconds} `, { fg: userFrameColor(theme), bold: true })), "time uses the user frame red");
  assert.doesNotMatch(plain(sent), /Next: review tests/);
  assert.equal(sent, composerMessageRail(theme, 100, home, now + 20_000, "Alchemy"), "recorded time does not tick");
  assert.match(plain(composerMessageRail(theme, 100, home, now, "Alchemy", "↑ 3 more")), /↑ 3 more/);
  assert.doesNotMatch(plain(composerMessageRail(theme, 100, home, now, "Alchemy", "↑ 3 more")), /Sent/);
  assert.doesNotMatch(plain(composerMessageRail(theme, 38, home, now, "Alchemy")), /Sent/);
  home.lastUserSentAt = () => undefined;
  assert.doesNotMatch(plain(composerMessageRail(theme, 100, home, now, "Alchemy")), /Sent/);
});

test("border glint changes light, not symbols or layout, and obeys motion gates", () => {
  const home = state(); home.clock.begin(1000);
  for (const width of [1, 3, 8, 20, 44, 90, 160]) {
    for (const time of [7200, 7500, 7800, 8100, 8700, 9000]) {
      const frame = composerMessageRail(theme, width, home, time, "unused");
      assert.ok(visibleWidth(frame) <= width);
      assert.doesNotMatch(plain(frame), /[✧✦⋆·]/);
    }
  }
  const frame = time => composerFrame(theme, [composerMessageRail(theme, 90, home, time, "unused"),
    composerRail(theme, 90, "", "", false)], 90, home, time, 1)[0];
  const a = frame(7800);
  const b = frame(8100);
  assert.notEqual(a, b, "bloom changes its brightness");
  assert.equal(plain(a).replace(/\d+s/, "time"), plain(b).replace(/\d+s/, "time"), "no extra symbols or changing geometry apart from elapsed time");
  assert.match(plain(a), /─{8}/);
  for (const gate of ["off", "dialog"]) {
    home.prefs.motion = gate === "off" ? "off" : "work";
    home.lastInputAt = gate === "typing" ? 7700 : 0;
    home.promptDepth = gate === "dialog" ? 1 : 0;
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
  const home = state(); home.clock.begin(1000);
  const render = time => composerFrame(theme, [composerMessageRail(theme, 90, home, time, ""),
    composerRail(theme, 90, "", "", false)], 90, home, time, 1)[0];
  const start = render(1100), next = render(1400);
  assert.notEqual(start, next, "start sweep advances");
  assert.equal(plain(start), plain(next));
  assert.match(plain(start), /^╭.*╮$/);
  home.clock.settle(1400, "error");
  assert.equal(render(1400), render(1700), "failed run cancels motion immediately");
  home.clock.begin(1800); home.clock.settle(2000, "done");
  assert.notEqual(render(2100), render(2400), "settlement fades into the quiet frame");
  assert.equal(render(2800), render(3200), "completed transitions do not linger");
});

test("run state moves into the composer rail below Tasks and timing across widths and states", () => {
  const home = state(), clock = new ActivityClock(1000);
  home.railStatus = () => composerStatus(home, clock);
  home.activityRows = () => ["TIMING"];
  const dock = { id: "pi-tasks", title: "Plan", rows: [{ text: "Current task", tone: "accent" }] };
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const workspace = createWorkspace(tui, () => ctx, home, new Map([["pi-tasks", dock]]), () => false, () => 5000);
  const editor = new ModalEditor(tui, getEditorTheme(), kb);
  const cleanup = dressComposerEditor(editor, () => ctx, home, () => 5000, () => tui.terminal.rows);
  try {
    for (const width of [24, 38, 100]) for (const rows of [22, 40]) for (const details of [false, true]) {
      tui.terminal.rows = rows; home.prefs.details = details;
      for (const phase of ["ready", "thinking", "done", "error", "stopped"]) {
        clock.restore(undefined, 1000); home.clock.restore(undefined); home.phase = "thinking";
        if (phase !== "ready") { clock.begin(1000); home.clock.begin(1000); }
        if (["done", "error", "stopped"].includes(phase)) { clock.settle(4000, phase); home.clock.settle(4000, phase); }
        const raw = [...workspace.render(width), ...editor.render(width)];
        const lines = raw.map(plain);
        raw.forEach(line => assert.ok(visibleWidth(line) <= width));
        const composer = lines.findIndex((line, index) => index > lines.findIndex(row => /TIMING/.test(row)) && line.startsWith("╭"));
        assert.ok(composer > lines.findIndex(line => /TASKS/.test(line)));
        assert.ok(composer > lines.findIndex(line => /TIMING/.test(line)));
        assert.ok(lines[composer].includes(phase === "thinking" ? "Thinking" : phase === "ready" ? "What’s next?"
          : phase === "done" ? "your turn" : phase === "error" ? "Run failed" : "What happened?"));
        assert.equal(lines.slice(0, composer).filter(line => /your turn|Run failed|What happened\?|What’s next\?/.test(line)).length, 0);
      }
    }
  } finally { cleanup(); }
});

test("compact work summary prioritizes blocked work; details expand without changing task data", () => {
  const home = state();
  const snapshot = { id: "pi-tasks", title: "Real plan", summary: "1/3 done · 1 blocked", rows: [{ text: "Done step", tone: "muted" }, { text: "Current step", tone: "accent" }, { text: "Needs approval", tone: "warning" }] };
  const saved = structuredClone(snapshot);
  const workspace = createWorkspace({ terminal: { rows: 40 } }, () => ctx, home, new Map([["pi-tasks", snapshot]]), () => true);
  let text = workspace.render(100).map(plain).join("\n");
  assert.match(text, /╭ Tasks .*1\/3 done · 1 blocked/);
  assert.match(text, /Needs approval/);
  assert.doesNotMatch(text, /Done step/);
  home.prefs.details = true;
  text = workspace.render(100).map(plain).join("\n");
  assert.match(text, /Done step/); assert.match(text, /Current step/);
  assert.deepEqual(snapshot, saved);
});
