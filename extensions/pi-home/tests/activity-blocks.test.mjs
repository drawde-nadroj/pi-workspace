import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain, visibleWidth } from "./host.mjs";
const { ActivityBlocks, toolLocation } = await jiti.import(join(source, "activity-blocks.ts"));
const { composerFrame, composerRail, composerSurface } = await jiti.import(join(source, "composer-style.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "state.ts"));
const { ToolExecutionComponent } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/index.js")));
const { Container, Text, TuiMainScreen, TuiAltScreen, CURSOR_MARKER } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const ui = { requestRender() {} };
let id = 0;
function tool(name, args = {}, definition) { return new ToolExecutionComponent(name, `call-${++id}`, args, { showImages: false }, definition, ui, "/tmp"); }
function result(node, text, error = false, partial = false) { node.updateResult({ content: [{ type: "text", text }], isError: error }, partial); }
const text = rows => rows.map(plain).join("\n");
function click(node, rows, y = 0, x = 2, width = 90) { return node.handleMouse({ type: "click", button: "left", x, y, width, height: rows.length, screenX: x, screenY: y, shift: false, alt: false, ctrl: false }); }

test("tool cards keep identity and bounded output visible without grouping", () => {
  const root = new Container(), a = tool("read", { path: "a.ts" }), b = tool("edit", { path: "a.ts" });
  root.addChild(a); root.addChild(b);
  const original = [a.render, b.render], blocks = new ActivityBlocks(() => theme, () => {});
  try {
    a.markExecutionStarted(); b.markExecutionStarted();
    result(a, Array.from({ length: 20 }, (_, i) => "line " + i).join("\n")); result(b, "Exact edit result");
    blocks.sync(root);
    const rows = root.render(90);
    assert.match(text(rows), /Read  a.ts/); assert.match(text(rows), /Edit  a.ts/);
    assert.doesNotMatch(text(rows), /Working|operations|Click heading/);
    assert.match(text(rows), /20 returned lines/); assert.doesNotMatch(text(rows), /line 19/);
    assert.ok(a.render(90).length <= 4); assert.match(text(rows), /Exact edit result/);
    assert.equal(rows.filter(row => plain(row).startsWith("╭")).length, 2);
    assert.deepEqual(root.children, [a, b]); assert.ok(b.render(90).length);
    assert.equal(click(a, a.render(90))?.handled, true);
    assert.match(text(root.render(90)), /line 19/);
    result(b, "Updated streamed output", false, true);
    assert.match(text(root.render(90)), /Updated streamed output/); assert.match(text(b.render(90)), /running/);
    for (const width of [24, 38, 60, 90, 140]) for (const row of root.render(width)) assert.ok(visibleWidth(row) <= width);
    a.setExpanded(false); assert.doesNotMatch(text(a.render(90)), /line 19/);
    a.setExpanded(true); assert.match(text(a.render(90)), /line 19/, "native keyboard expansion works");
  } finally { blocks.dispose(); }
  assert.equal(a.render, original[0]); assert.equal(b.render, original[1]);
});

test("short output needs no expansion hint; full commands and Unicode targets survive expansion", () => {
  const root = new Container(), a = tool("read", { path: "/tmp/界面.ts", offset: 12, limit: 2 });
  root.addChild(a); result(a, "first\nsecond");
  const blocks = new ActivityBlocks(() => theme, () => {});
  try {
    blocks.sync(root);
    assert.match(text(a.render(90)), /Read  界面.ts:12–13/);
    assert.doesNotMatch(text(a.render(90)), /expand|operation/);
    for (const modifier of ["shift", "alt", "ctrl"]) {
      assert.equal(a.handleMouse({ type: "click", button: "left", x: 2, y: 1, width: 90, height: a.render(90).length, screenX: 2, screenY: 1, [modifier]: true }), undefined);
      assert.doesNotMatch(text(a.render(90)), /Arguments/);
    }
    assert.equal(click(a, a.render(90), 1)?.handled, true, "body click expands even a short card to show its arguments");
    assert.match(text(a.render(90)), /Arguments/);
    assert.equal(click(a, a.render(90), 1), undefined, "expanded body remains selectable");
    assert.equal(click(a, a.render(90))?.handled, true, "heading collapses");
    a.updateArgs({ path: "/tmp/" + "very-long-界面/".repeat(20) + "end.ts" });
    assert.match(text(a.render(40)), /…/);
    click(a, a.render(40), 0, 2, 40);
    assert.match(text(a.render(40)), /end.ts/);
    for (const w of [24, 30, 80, 140]) for (const row of a.render(w)) assert.ok(visibleWidth(row) <= w, `width ${w}: ${visibleWidth(row)}`);
  } finally { blocks.dispose(); }
  assert.equal(toolLocation("read", { path: "/tmp/a" }, "/tmp"), "Read  a");
});

test("nested observed calls retain names and states, not inferred activity labels", () => {
  const root = new Container(), a = tool("codemode", { code: "tools.read({ path: 'a' })" }), b = tool("bash", { command: "node --test a" });
  root.addChild(a); root.addChild(new Text("Assistant explanation")); root.addChild(b);
  const blocks = new ActivityBlocks(() => theme, () => {});
  try {
    blocks.record("read", { path: "a" }, a.toolCallId, "child-1"); blocks.sync(root);
    assert.match(text(root.render(90)), /1 call/);
    blocks.finish("child-1", a.toolCallId, false);
    a.setExpanded(true); assert.match(text(root.render(90)), /✓ Read  a/); a.setExpanded(false);
    for (let i = 0; i < 6; i++) { blocks.record("edit", { path: "file" + i }, a.toolCallId, "edit-" + i); blocks.finish("edit-" + i, a.toolCallId, i === 5); }
    assert.match(text(root.render(90)), /7 calls · 1 failed/);
    assert.match(text(root.render(90)), /Assistant explanation/);
    a.setExpanded(true); assert.match(text(a.render(90)), /Edit  file5 · failed/);
    const adapter = b.render; root.removeChild(b); blocks.sync(root); assert.notEqual(b.render, adapter);
  } finally { blocks.dispose(); }
});

test("error preview stays visible even after collapse; structured cancellation is not success", () => {
  const root = new Container(), a = tool("bash", { command: "false" }); root.addChild(a);
  const blocks = new ActivityBlocks(() => theme, () => {});
  try {
    a.markExecutionStarted(); result(a, "Exact error details\n" + "context\n".repeat(20), true); blocks.sync(root);
    assert.match(text(a.render(90)), /failed/); assert.match(text(a.render(90)), /Exact error details/);
    a.setExpanded(true); a.setExpanded(false); assert.match(text(a.render(90)), /Exact error details/);
    a.updateResult({ content: [{ type: "text", text: "Stopped" }], details: { cancelled: true }, isError: true });
    assert.match(text(a.render(90)), /cancelled/); assert.doesNotMatch(text(a.render(90)), /returned/);
  } finally { blocks.dispose(); }
});

test("custom interfaces, images, hidden tools, narrow views and later decorators retain native behavior", () => {
  const root = new Container(), a = tool("special", {}, { renderShell: "self", renderCall: () => new Text("╭ CUSTOM ╮") }), b = tool("read", { path: "image.png" });
  root.addChild(a); root.addChild(b);
  const blocks = new ActivityBlocks(() => theme, () => {});
  const nativeA = a.render(90), nativeB = b.render(20), nativeRender = b.render;
  try {
    blocks.sync(root); assert.deepEqual(a.render(90), nativeA); assert.deepEqual(b.render(20), nativeB);
    b.updateResult({ content: [{ type: "image", data: "AAAA", mimeType: "image/png" }] });
    assert.deepEqual(b.render(90), nativeRender.call(b, 90));
    blocks.dispose();
    b.render = () => ["\x1b_Ga=T;AAAA\x1b\\"];
    blocks.sync(root); assert.deepEqual(b.render(90), ["\x1b_Ga=T;AAAA\x1b\\"]);
    blocks.dispose(); b.render = () => []; blocks.sync(root); assert.deepEqual(b.render(90), []);
    const later = () => ["later decorator"]; b.render = later; blocks.dispose(); assert.equal(b.render, later);
  } finally { blocks.dispose(); }
});

test("full frame light reaches all four edges without changing draft, cursor, menu or dimensions", () => {
  const home = { prefs: { ...DEFAULTS, look: "composer" }, clock: new RunClock(), tools: new Map(), phase: "thinking", promptDepth: 0, compacting: false, lastInputAt: 0 };
  home.clock.begin(1000);
  for (const width of [8, 24, 90, 140]) {
    const rows = [composerRail(theme, width, " Composer "), composerSurface(theme, "│" + "x".repeat(width - 2) + "│", width), composerSurface(theme, "│" + CURSOR_MARKER + " ".repeat(width - 2) + "│", width), composerRail(theme, width, "", "", false), "completion menu"];
    const frames = Array.from({ length: 30 }, (_, i) => composerFrame(theme, rows, width, home, 4000 + i * 100, 3));
    assert.ok(new Set(frames.map(f => f[0])).size > 1); assert.ok(new Set(frames.map(f => f[3])).size > 1);
    assert.ok(new Set(frames.map(f => f[1])).size > 1, "side edges move too");
    for (const frame of frames) {
      assert.deepEqual(frame.map(plain), rows.map(plain)); assert.equal(frame[4], rows[4]);
      assert.equal(frame.join("").split(CURSOR_MARKER).length - 1, 1);
      for (const row of frame.slice(0, 4)) assert.equal(visibleWidth(row), width);
    }
    home.prefs.motion = "off";
    assert.deepEqual(composerFrame(theme, rows, width, home, 4100, 3), composerFrame(theme, rows, width, home, 4700, 3));
    home.prefs.motion = "work"; home.promptDepth = 1;
    assert.deepEqual(composerFrame(theme, rows, width, home, 4100, 3), composerFrame(theme, rows, width, home, 4700, 3));
    home.promptDepth = 0;
  }
});

for (const Renderer of [TuiMainScreen, TuiAltScreen]) test(`${Renderer.name}: native tool cards retain click routing and reversible cleanup`, () => {
  const terminal = { columns: 90, rows: 40, kittyProtocolActive: false, start() {}, stop() {}, async drainInput() {}, write() {}, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  const tui = new Renderer(terminal, false), root = new Container(), a = tool("read", { path: "a" }), b = tool("read", { path: "b" });
  const native = a.render;
  root.addChild(a); root.addChild(b); tui.addChild(root);
  const blocks = new ActivityBlocks(() => theme, () => tui.requestRender());
  try {
    result(a, "First exact result"); result(b, "Second exact result");
    tui.start(); blocks.sync(tui); tui.renderNow(true);
    const rows = tui.render(90); assert.match(text(rows), /Read  a/); assert.match(text(rows), /Read  b/);
    assert.equal(click(root, rows, 1)?.handled, true, "collapsed body click is routed to the card");
    tui.renderNow(true); assert.match(text(tui.render(90)), /First exact result/); assert.match(text(tui.render(90)), /Read  b/);
    blocks.dispose(); assert.equal(a.render, native); assert.ok(b.render(90).length);
  } finally { blocks.dispose(); tui.stop(); }
});
