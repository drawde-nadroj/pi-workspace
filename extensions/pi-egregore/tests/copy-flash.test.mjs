import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, initTheme, plain, visibleWidth } from "./host.mjs";
const { installCopyFlashFrame } = await jiti.import(join(source, "copy-flash.ts"));
const { TuiAltScreen, TuiMainScreen } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { createInteractiveTuiReference } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/tui-renderer.js")));
function host(Renderer = TuiAltScreen) {
  const terminal = { columns: 90, rows: 24, write() {}, hideCursor() {}, showCursor() {}, start() {}, stop() {}, clearScreen() {}, moveBy() {}, clearLine() {}, clearFromCursor() {}, setTitle() {}, setProgress() {} };
  return new Renderer(terminal, false);
}
for (const appearance of ["light", "dark"]) test(`${appearance}: compact copy frame, native top-right composition, width and height fallbacks`, () => {
  initTheme(appearance, false);
  const tui = host();
  const original = tui.flashes.render;
  const cleanup = installCopyFlashFrame(createInteractiveTuiReference(() => tui), () => theme);
  try {
    tui.flash("Copied!");
    const entry = tui.flashes.entries[0], timer = entry.timer;
    for (const width of [11, 24, 90, 140]) {
      const rows = tui.flashes.render(width);
      assert.deepEqual(rows.map(plain), ["╭─────────╮", "│ Copied! │", "╰─────────╯"]);
      assert.ok(rows.every(row => visibleWidth(row) === 11));
      const gray = appearance === "light" ? 112 : 144;
      assert.ok(rows[0].includes(`\x1b[38;2;${gray};${gray};${gray}m`), "border is achromatic, not the blue accent");
      assert.ok(rows[1].includes(theme.fg("text", " Copied! ")), "label uses ordinary text, not success color");
    }
    assert.equal(tui.flashes.entries[0], entry); assert.equal(entry.timer, timer);
    for (const width of [1, 4, 10]) assert.deepEqual(tui.flashes.render(width), original.call(tui.flashes, width));
    tui.terminal.rows = 2;
    assert.deepEqual(tui.flashes.render(90), original.call(tui.flashes, 90));
    tui.terminal.rows = 24;
    // Native compositor keeps all three compact rows at the same right edge.
    const composed = tui.compositeFlashes(Array(24).fill(" ".repeat(90)), 90, 24);
    assert.deepEqual(composed.slice(0, 3).map(plain), ["╭─────────╮", "│ Copied! │", "╰─────────╯"].map(row => " ".repeat(79) + row));
    const retained = tui.flashes.render;
    cleanup(); cleanup();
    assert.equal(tui.flashes.render, original);
    assert.deepEqual(retained.call(tui.flashes, 90), original.call(tui.flashes, 90));
  } finally { cleanup(); tui.flashes.dispose(); }
});
test("errors, unrelated Unicode notices, timers and repeated mounts remain native", async () => {
  const tui = host();
  const original = tui.flashes.render;
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const cleanup = installCopyFlashFrame(tui, () => theme);
      tui.flash("Copy failed", 10000); tui.flash("界面 🧭", 10000); tui.flash("Copied!", 10);
      const native = original.call(tui.flashes, 90);
      assert.deepEqual(tui.flashes.render(90).slice(0, 2), native.slice(0, 2));
      assert.equal(tui.flashes.render(90).length, 5);
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.deepEqual(tui.flashes.render(90), native.slice(0, 2));
      cleanup(); assert.equal(tui.flashes.render, original); tui.flashes.dispose();
    }
  } finally { tui.flashes.dispose(); }
});
test("regular mode, unsupported hosts, theme failures and a later renderer keep their fallback", () => {
  for (const ui of [undefined, {}, host(TuiMainScreen), { flashes: {} }]) assert.doesNotThrow(() => installCopyFlashFrame(ui, () => theme)());
  const tui = host();
  const original = tui.flashes.render;
  const cleanup = installCopyFlashFrame(tui, () => { throw new Error("disposed context"); });
  tui.flash("Copied!");
  assert.deepEqual(tui.flashes.render(90), original.call(tui.flashes, 90));
  const later = () => ["other owner"];
  tui.flashes.render = later; cleanup(); assert.equal(tui.flashes.render, later);
  tui.flashes.dispose();
});
