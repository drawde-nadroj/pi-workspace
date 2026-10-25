import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain } from "./host.mjs";
const { installFrameAwareCopy, rememberCopyFrame, forgetCopyFrame } = await jiti.import(join(source, "copy-selection.ts"));
const { SentMessageFrames } = await jiti.import(join(source, "sent-messages.ts"));
const { ActivityBlocks } = await jiti.import(join(source, "activity-blocks.ts"));
const { frameRows } = await jiti.import(join(source, "../../lib/frame.ts"));
const { Container, ScrollView, Text, TuiAltScreen, TuiMainScreen } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { UserMessageComponent, ToolExecutionComponent, createEditToolDefinition } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/index.js")));
const { createInteractiveTuiReference } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/tui-renderer.js")));
function fixture() {
  const copied = [];
  const terminal = { columns: 60, rows: 12, write() {}, hideCursor() {}, showCursor() {}, start() {}, stop() {}, clearScreen() {}, moveBy() {}, clearLine() {}, clearFromCursor() {}, setTitle() {}, setProgress() {} };
  const tui = new TuiAltScreen(terminal, false, undefined, { copySelection: text => { copied.push(text); return true; } });
  const chat = new Container(), document = new Container(); document.addChild(chat);
  const scroll = new ScrollView(document, { primary: true, scrollbar: "hidden", follow: "end" });
  tui.setLayoutRoot(scroll);
  const original = tui.getActiveSelectionText;
  const cleanup = installFrameAwareCopy(createInteractiveTuiReference(() => tui));
  tui.start();
  return { tui, chat, copied, scroll, original, cleanup,
    paint() { tui.renderNow(true); },
    select(startRow, startCol, endRow, endCol, reverse = false) {
      const a = { row: startRow, col: startCol, scrollView: scroll }, b = { row: endRow, col: endCol, scrollView: scroll, boundary: true };
      tui.selectionAnchor = reverse ? b : a; tui.selectionFocus = reverse ? a : b;
      return tui.getActiveSelectionText();
    },
    stop() { cleanup(); tui.stop(); },
  };
}
test("real native chat selection omits owned rails/padding, retains pipes, Unicode and indentation, and uses native clipboard success path", async () => {
  const f = fixture(), messages = new SentMessageFrames();
  try {
    const message = new UserMessageComponent("alpha | beta │ 界面 🧭\n  indented\n╭──literal──╮");
    f.chat.addChild(message); messages.sync(f.chat, () => theme);
    f.paint();
    const rows = f.tui.currentLayout.root.scrollContentLines;
    assert.match(rows.map(plain).join("\n"), /│/);
    assert.equal(f.select(0, 0, rows.length - 1, 60), " alpha | beta │ 界面 🧭\n   indented\n ╭──literal──╮");
    assert.equal(f.select(0, 0, rows.length - 1, 60, true), " alpha | beta │ 界面 🧭\n   indented\n ╭──literal──╮");
    await f.tui.copyActiveSelectionToClipboard();
    assert.deepEqual(f.copied, [" alpha | beta │ 界面 🧭\n   indented\n ╭──literal──╮"]);
    assert.equal(f.tui.flashes.entries.at(-1).message, "Copied!");
    assert.equal(f.select(2, 2, 2, 7), "alpha");
    assert.equal(f.select(2, 0, 2, 1), undefined, "border-only selection has no content");
    assert.equal(f.select(0, 0, 0, 60), undefined, "rail-only selection has no content");
    const retained = f.tui.getActiveSelectionText;
    f.cleanup(); f.cleanup();
    assert.equal(f.tui.getActiveSelectionText, f.original);
    assert.equal(retained(), f.original.call(f.tui));
  } finally { messages.dispose(); f.stop(); }
});
test("unowned lookalikes and literal pipes stay intact across components, scroll and resize", () => {
  const f = fixture();
  let content = ["first | │", "", "  code | x", "╰────────╯"];
  const owner = { render(width) { return rememberCopyFrame(this, width, frameRows({ theme, width, rows: content })); } };
  const literal = new Text("╭────────╮\n│ literal│\n╰────────╯", 0, 0);
  try {
    f.chat.addChild(owner); f.chat.addChild(literal);
    for (const width of [24, 90]) {
      f.tui.terminal.columns = width; f.paint();
      const rows = f.tui.currentLayout.root.scrollContentLines;
      assert.equal(f.select(0, 0, rows.length - 1, width), content.join("\n") + "\n╭────────╮\n│ literal│\n╰────────╯");
    }
    content = Array.from({ length: 30 }, (_, i) => `line ${i} | │`); f.paint();
    assert.ok(f.scroll.scrollTop > 0);
    assert.equal(f.select(20, 0, 24, 90), content.slice(19, 24).join("\n"));
    forgetCopyFrame(owner);
    assert.equal(f.tui.getActiveSelectionText(), f.original.call(f.tui));
  } finally { f.stop(); }
});
test("real tool frame records cached and expanded render provenance", () => {
  const f = fixture(), blocks = new ActivityBlocks(() => theme, () => {});
  try {
    const tool = new ToolExecutionComponent("edit", "e1", { path: "a.ts", oldText: "a | b", newText: "x │ y" }, { showImages: false }, createEditToolDefinition("/tmp"), f.tui, "/tmp");
    tool.updateResult({ content: [{ type: "text", text: "literal | │" }], details: {}, isError: false });
    f.chat.addChild(tool); blocks.sync(f.chat);
    for (const expanded of [false, true, true]) {
      tool.setExpanded(expanded); f.paint();
      const rows = f.tui.currentLayout.root.scrollContentLines;
      const selected = f.select(0, 0, rows.length - 1, 60);
      assert.ok(selected.includes("literal | │"));
      assert.ok(!selected.includes("╭") && !selected.includes("╰"));
      assert.ok(!selected.split("\n").some(line => line.startsWith("│")));
      assert.ok(selected.split("\n").includes("literal | │"), "literal trailing pipe remains");
    }
  } finally { blocks.dispose(); f.stop(); }
});
test("unsupported modes, stale render provenance, extraction drift and later owners fall back safely", () => {
  assert.doesNotThrow(() => installFrameAwareCopy({})());
  assert.doesNotThrow(() => installFrameAwareCopy(undefined)());
  assert.equal(typeof TuiMainScreen.prototype.getActiveSelectionText, "undefined");
  const f = fixture();
  const owner = { render(width) { return rememberCopyFrame(this, width, frameRows({ theme, width, rows: ["a | b"] })); } };
  try {
    f.chat.addChild(owner); f.paint(); f.select(0, 0, 2, 60);
    rememberCopyFrame(owner, 40, ["stale"]);
    assert.equal(f.tui.getActiveSelectionText(), f.original.call(f.tui));
    const later = () => "other owner";
    f.tui.getActiveSelectionText = later; f.cleanup(); assert.equal(f.tui.getActiveSelectionText, later);
  } finally { f.stop(); }
});
