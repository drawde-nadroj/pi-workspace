import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { root, plain } from "./host.mjs";
import { workspace } from "./workspace-harness.mjs";
const { TuiAltScreen, TuiMainScreen, Container, Text } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
function terminal() {
  return { columns: 100, rows: 40, kittyProtocolActive: false, start() {}, stop() {}, async drainInput() {},
    write() {}, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {},
    clearScreen() {}, setTitle() {}, setProgress() {} };
}
for (const Renderer of [TuiAltScreen, TuiMainScreen]) for (const history of [0, 80]) test(`${Renderer.name}: workspace owns its whole rectangle with ${history} transcript lines, including resize`, async () => {
  const h = workspace(), term = terminal(), tui = new Renderer(term, true), transcript = new Container();
  transcript.addChild(new Text(Array.from({ length: history }, () => "TRANSCRIPT-MUST-NOT-LEAK").join("\n"), 0, 0));
  tui.addChild(transcript); tui.addChild(h.editor); tui.start();
  const handle = tui.showOverlay(h.panel, h.options.overlayOptions);
  try {
    for (const [columns, rows] of [[100, 40], [62, 18], [48, 12], [110, 48]]) {
      term.columns = h.tui.terminal.columns = columns; term.rows = h.tui.terminal.rows = rows;
      tui.renderNow(true);
      const screen = (Renderer === TuiAltScreen ? tui.previousScreen : tui.previousLines.slice(-rows)).map(plain);
      assert.equal(screen.length, rows);
      assert.doesNotMatch(screen.join("\n"), /TRANSCRIPT-MUST-NOT-LEAK/);
      assert.match(screen.join("\n"), /\[Discard\].*\[Save\]/);
      assert.equal(screen.filter(line => line.includes("Unsent native")).length, 1, "one visible native draft, not a duplicate sample");
      const note = screen.findIndex(line => line.includes("Your live input"));
      const draft = screen.findIndex(line => line.includes("Unsent native"));
      assert.ok(note > 0 && draft > note && draft - note <= 3);
      assert.equal(handle.getBounds().col, 0); assert.equal(handle.getBounds().row, 0);
      assert.equal(handle.getBounds().width, columns); assert.equal(handle.getBounds().height, rows);
      if (process.env.PI_FOOTER_SNAPSHOTS) writeFileSync(`/tmp/pi-footer-workspace-${columns}x${rows}.txt`, screen.join("\n") + "\n");
    }
  } finally {
    h.panel.handleInput("\x13"); await h.pending; handle.hide(); tui.stop();
  }
});
