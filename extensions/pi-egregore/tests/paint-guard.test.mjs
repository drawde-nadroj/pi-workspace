import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain, kb, CURSOR_MARKER, visibleWidth } from "./host.mjs";
const { installPaintGuard } = await jiti.import(join(source, "paint-guard.ts"));
const { SentMessageFrames } = await jiti.import(join(source, "sent-messages.ts"));
const { ActivityBlocks } = await jiti.import(join(source, "activity-blocks.ts"));
const { UserMessageComponent, ToolExecutionComponent, createEditToolDefinition } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/index.js")));
const { Container, TuiMainScreen, TuiAltScreen } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { createInteractiveTuiReference } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/tui-renderer.js")));
for (const Renderer of [TuiMainScreen, TuiAltScreen]) test(`${Renderer.name}: first paint decorates new content and hides cursor before repaint writes`, () => {
  const writes = [];
  const terminal = { columns: 90, rows: 40, kittyProtocolActive: false, start() {}, stop() {}, async drainInput() {}, write(s) { writes.push(s); }, moveBy() {}, hideCursor() { writes.push("HIDE"); }, showCursor() { writes.push("SHOW"); }, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  const tui = new Renderer(terminal, false), chat = new Container(), messages = new SentMessageFrames(), blocks = new ActivityBlocks(() => theme, () => {});
  tui.addChild(chat);
  const original = tui.doRender, cleanup = installPaintGuard(tui, () => { blocks.sync(tui); messages.sync(tui, () => theme); }, () => true);
  try {
    tui.start(); tui.renderNow(true); writes.length = 0;
    chat.addChild(new UserMessageComponent("Newly submitted message"));
    chat.addChild(new ToolExecutionComponent("read", "read-1", { path: "file.ts" }, { showImages: false }, undefined, tui, "/tmp"));
    const edit = new ToolExecutionComponent("edit", "edit-real", { path: "/tmp/example.md" }, { showImages: false }, createEditToolDefinition("/tmp"), tui, "/tmp");
    edit.updateResult({ content: [{ type: "text", text: "Replaced text" }], details: { diff: "-1 old\n+1 new" }, isError: false });
    chat.addChild(edit);
    tui.renderNow(true);
    assert.match(writes.map(plain).join(""), /╭ ✓ Edit/);
    assert.match(writes.map(plain).join(""), /\+1 −1 lines/);
    assert.ok(writes[0].startsWith("\x1b[?2026h\x1b[?25l"));
    assert.equal(writes.length, 1, "ordinary repaint and cursor restore are one write");
    assert.ok(writes[0].endsWith("\x1b[?2026l"));
    assert.match(writes.join(""), /jordan/); assert.match(writes.join(""), /Read/);
    assert.match(tui.render(90).map(plain).join("\n"), /file.ts/);
    cleanup(); assert.equal(tui.doRender, original);
  } finally { cleanup(); blocks.dispose(); messages.dispose(); tui.stop(); }
});

const { ModalEditor } = await jiti.import(join(source, "../../node_modules/pi-vim/index.ts"));
const { dressComposerEditor } = await jiti.import(join(source, "composer-editor.ts"));
const { RunClock, DEFAULTS } = await jiti.import(join(source, "state.ts"));
const { getEditorTheme } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js")));
const { Input, Text } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
function terminalHarness() {
  const writes = [];
  const terminal = { columns: 90, rows: 40, kittyProtocolActive: false, start() {}, stop() {}, async drainInput() {}, write(s) { writes.push(s); }, moveBy() {}, hideCursor() { this.write("\x1b[?25l"); }, showCursor() { this.write("\x1b[?25h"); }, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  return { writes, terminal };
}
for (const Renderer of [TuiMainScreen, TuiAltScreen]) test(`${Renderer.name}: real Vim caret stays inside input throughout animated paints, resize and question restoration`, () => {
  const { writes, terminal } = terminalHarness();
  const tui = new Renderer(terminal, true), editor = new ModalEditor(tui, getEditorTheme(), kb);
  const workspace = { prefs: { ...DEFAULTS, look: "composer" }, clock: new RunClock(), tools: new Map(), phase: "working", promptDepth: 0, compacting: false, lastInputAt: 0 };
  const ctx = { ui: { theme }, sessionManager: { getSessionId: () => "render-test" } };
  let now = 10000;
  const undress = dressComposerEditor(editor, () => ctx, workspace, () => now, () => terminal.rows);
  const cleanup = installPaintGuard(tui, () => {}, () => true);
  tui.addChild(editor); tui.setFocus(editor); tui.setShowHardwareCursor(true);
  editor.setClipboardMirrorPolicy("never"); editor.setText("one 🧭 界面"); workspace.clock.begin(1000);
  function checkPaint(component, shouldShow = true) {
    writes.length = 0; tui.renderNow();
    const frames = writes.filter(s => s.startsWith("\x1b[?2026h"));
    assert.equal(frames.length, 1);
    const frame = frames[0];
    assert.equal(frame.split("\x1b[?2026h").length - 1, 1);
    assert.equal(frame.split("\x1b[?2026l").length - 1, 1);
    assert.ok(frame.startsWith("\x1b[?2026h\x1b[?25l"));
    assert.ok(frame.endsWith((shouldShow ? "\x1b[?25h" : "\x1b[?25l") + "\x1b[?2026l"));
    for (const output of writes.filter(s => !frames.includes(s))) assert.match(output, /^\x1b\[\d+ q$/, "only Vim cursor-shape control can be outside paint");
    if (!shouldShow) return;
    const lines = Renderer === TuiAltScreen ? tui.currentLayout.lines : component.render(terminal.columns);
    const row = lines.findIndex(line => line.includes(CURSOR_MARKER));
    assert.ok(row >= 0);
    const col = visibleWidth(lines[row].slice(0, lines[row].indexOf(CURSOR_MARKER)));
    if (Renderer === TuiMainScreen) {
      assert.equal(tui.hardwareCursorRow, row);
      assert.equal(Number([...frame.matchAll(/\x1b\[(\d+)G/g)].at(-1)?.[1]), col + 1);
    } else {
      const match = [...frame.matchAll(/\x1b\[(\d+);(\d+)H/g)].at(-1);
      assert.deepEqual([Number(match?.[1]), Number(match?.[2])], [row + 1, col + 1]);
    }
    const native = component.render(terminal.columns);
    const markerRow = native.findIndex(line => line.includes(CURSOR_MARKER));
    assert.ok(markerRow >= 0);
    if (component === editor) assert.ok(markerRow > 0 && markerRow < native.length - 1, "caret is not on a message rail");
  }
  try {
    tui.start();
    for (const width of [90, 38, 12, 90]) {
      terminal.columns = width;
      for (let frame = 0; frame < 8; frame++) { now += 100; checkPaint(editor); }
    }
    editor.handleInput("\x1b"); checkPaint(editor);
    editor.handleInput("i"); checkPaint(editor);
    const draft = editor.getText(), cursor = editor.getCursor();
    const question = new Input(); question.setValue("answer");
    tui.removeChild(editor); tui.addChild(question); tui.setFocus(question); checkPaint(question);
    tui.removeChild(question); const noInput = new Text("Waiting without an input marker", 0, 0); tui.addChild(noInput); tui.setFocus(noInput); checkPaint(noInput, false);
    tui.removeChild(noInput); tui.addChild(editor); tui.setFocus(editor); checkPaint(editor);
    assert.equal(editor.getText(), draft); assert.deepEqual(editor.getCursor(), cursor);
    tui.stop(); writes.length = 0; tui.renderNow(); assert.deepEqual(writes, [], "stopped renderer must not hide the shell cursor");
  } finally { cleanup(); undress(); tui.stop(); }
});

for (const Renderer of [TuiMainScreen, TuiAltScreen]) test(`${Renderer.name}: forwarding TUI reference restores the actual renderer on repeated session mounts`, () => {
  const { terminal } = terminalHarness();
  let renderer = new Renderer(terminal, false);
  const reference = createInteractiveTuiReference(() => renderer);
  try {
    for (let cycle = 0; cycle < 5; cycle++) {
      const originalRender = renderer.render, originalPaint = renderer.doRender;
      const symbols = Object.getOwnPropertySymbols(renderer);
      let prepares = 0;
      const cleanup = installPaintGuard(reference, () => prepares++, () => true);
      assert.deepEqual(Object.getOwnPropertySymbols(renderer), symbols, "receiver probe leaves no fields behind");
      reference.render(90);
      assert.equal(prepares, 1, "exactly one active guard, not a stack of prior-session wrappers");
      cleanup(); cleanup();
      assert.equal(renderer.render, originalRender);
      assert.equal(renderer.doRender, originalPaint);
      reference.render(90); assert.equal(prepares, 1);
      if (cycle === 2) { renderer.stop(); renderer = new Renderer(terminal, false); }
    }
  } finally { renderer.stop(); }
});

test("a retained native-editor wrapper falls back safely after disposal without reading old session context", () => {
  const { terminal } = terminalHarness();
  const tui = new TuiMainScreen(terminal, false), editor = new ModalEditor(tui, getEditorTheme(), kb);
  const state = { prefs: { ...DEFAULTS }, clock: new RunClock(), tools: new Map(), phase: "working", promptDepth: 0, compacting: false, lastInputAt: 0 };
  let live = true;
  const cleanup = dressComposerEditor(editor, () => {
    if (!live) throw new Error("inactive session");
    return { ui: { theme }, sessionManager: { getSessionName: () => "fixture" } };
  }, state);
  editor.setText("Retained draft 界面");
  const queuedRender = editor.render, queuedInput = editor.handleInput;
  cleanup(); cleanup(); live = false;
  assert.deepEqual(queuedRender(90), editor.render(90));
  const inputAt = state.lastInputAt;
  queuedInput("i"); assert.equal(state.lastInputAt, inputAt);
  assert.equal(editor.getText(), "Retained draft 界面i", "retained input still delegates to the native editor, without stale Egregore bookkeeping");
  tui.stop();
});

test("paint guard restores terminal methods on errors and batches large Unicode output without nested sync boundaries", () => {
  const { writes, terminal } = terminalHarness();
  const originalWrite = terminal.write, originalHide = terminal.hideCursor, originalShow = terminal.showCursor;
  const large = "x".repeat(32766) + "🧭" + "y".repeat(200000);
  let fail = false;
  const host = { terminal, render: () => [], doRender() {
    terminal.write("\x1b[?202"); terminal.write("6h"); terminal.write(large);
    terminal.write("\x1b[?2026"); terminal.write("l");
    if (fail) throw new Error("paint error");
    terminal.write("\x1b[3;4H"); terminal.showCursor();
  } };
  const originalPaint = host.doRender;
  const cleanup = installPaintGuard(host, () => {}, () => true);
  try {
    host.doRender();
    const all = writes.join("");
    assert.equal(all, "\x1b[?2026h\x1b[?25l" + large + "\x1b[3;4H\x1b[?25h\x1b[?2026l");
    assert.equal(Buffer.concat(writes.map(s => Buffer.from(s))).toString(), all, "no split Unicode surrogate becomes replacement characters");
    assert.ok(writes.every(s => s.length < 100000), "large paints remain bounded");
    assert.equal(terminal.write, originalWrite); assert.equal(terminal.hideCursor, originalHide); assert.equal(terminal.showCursor, originalShow);
    writes.length = 0; fail = true;
    assert.throws(() => host.doRender(), /paint error/);
    assert.ok(writes.at(-1).endsWith("\x1b[?2026l"));
    assert.equal(terminal.write, originalWrite); assert.equal(terminal.hideCursor, originalHide); assert.equal(terminal.showCursor, originalShow);
  } finally { cleanup(); cleanup(); }
  assert.equal(host.doRender, originalPaint);
});
