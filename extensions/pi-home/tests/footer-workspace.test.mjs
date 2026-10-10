import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, initTheme, plain, kb, visibleWidth, CURSOR_MARKER } from "./host.mjs";
const { chooseFooter } = await jiti.import(join(source, "footer-settings.ts"));
const { FOOTER_DEFAULTS, footerPrefs } = await jiti.import(join(source, "footer-state.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "state.ts"));
const { appearanceDefaults, POSITIONS, STATES } = await jiti.import(join(source, "appearance.ts"));
const { appearanceRow, appearanceBorder } = await jiti.import(join(source, "appearance-render.ts"));
const { HomeEditor } = await jiti.import(join(source, "ui.ts"));
const { getEditorTheme } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js")));
import { workspace } from "./workspace-harness.mjs";

test("visual layout migration is optional, validates nested data and never mutates old preferences", () => {
  const old = { ...FOOTER_DEFAULTS, railTitle: "off", composerContext: "off" };
  assert.equal(footerPrefs(old).appearance, undefined);
  const appearance = appearanceDefaults(old);
  assert.equal(appearance.elements.context.visible, false);
  assert.equal(appearance.elements.session.position, "footer1Left");
  appearance.elements.model.text = "\x1b[31mModel\n{value}\u202e";
  appearance.elements.model.position = "not-a-position";
  appearance.elements.model.color = "\x1b[31m";
  appearance.states.done = { text: "Ready\nnow", frameColor: "#123abc", color: "red" };
  const parsed = footerPrefs({ ...old, appearance });
  assert.equal(parsed.appearance.elements.model.text, "Model {value} ");
  assert.equal(parsed.appearance.elements.model.position, "bottomRight");
  assert.equal(parsed.appearance.elements.model.color, "quiet");
  assert.equal(parsed.appearance.states.done.text, "Ready now");
  assert.deepEqual(footerPrefs(JSON.parse(JSON.stringify(parsed))), parsed);
  assert.equal(footerPrefs({ ...old, appearance: { version: 999 } }).appearance, undefined);
  assert.equal(old.appearance, undefined);
});

test("native full-width preview, disabled elements and synced direct/list selection", async () => {
  const h = workspace();
  assert.equal(h.options.overlayOptions.width, "100%");
  assert.match(h.rows().join("\n"), /Unsent native draft 界面/);
  assert.match(h.rows().join("\n"), /Context usage · Off/);
  assert.doesNotMatch(h.rows().join("\n"), /37%|42%|thinking high|Live preview|Waiting for you/);
  const titleY = h.rows().findIndex(row => row.includes("Actual chat 界面"));
  const hit = h.home.appearanceHits.find(hit => hit.id === "session");
  h.clickAt(hit.x, titleY);
  assert.equal(h.home.appearancePreview.selected, "session");
  assert.match(h.rows().join("\n"), /• Chat title/);
  assert.match(h.rows().join("\n"), /› Show this element/);
  h.click("Show this element");
  assert.equal(h.latest.appearance.elements.session.visible, false);
  assert.doesNotMatch(h.rows().join("\n"), /Actual chat 界面/);
  h.click("[Undo]");
  assert.match(h.rows().join("\n"), /Actual chat 界面/);
  assert.equal(h.editor.getText(), "Unsent native draft 界面");
  assert.equal(await h.discard(), undefined);
});

test("change your turn wording, color and frame; state demonstration never changes clocks", async () => {
  const h = workspace(), before = JSON.stringify(h.home.clock);
  h.click("Assistant status"); h.click("Preview appearance"); h.pick("When the assistant finishes");
  h.click("Text for this state"); h.text("Your turn 界面");
  assert.match(h.rows().join("\n"), /Your turn 界面/);
  assert.equal(h.latest.appearance.states.done.text, "Your turn 界面");
  h.click("Text color"); h.pick("Green");
  h.click("Frame color for this state"); h.pick("Blue");
  assert.equal(h.latest.appearance.states.done.color, "green");
  assert.equal(h.latest.appearance.states.done.frameColor, "blue");
  assert.equal(JSON.stringify(h.home.clock), before);
  h.click("Preview appearance"); h.pick("While waiting for your answer");
  assert.match(h.rows().join("\n"), /Waiting for you/);
  assert.equal(h.home.clock.active, false);
  h.click("[Save]");
  const saved = await h.pending;
  assert.equal(saved.appearance.states.done.text, "Your turn 界面");
  assert.equal(h.home.appearancePreview.state, undefined, "simulation is not saved");
  assert.equal(saved.appearance.states.waiting, undefined);
});

test("move model to footer; edit text; keep thinking level without a thinking prefix", async () => {
  const h = workspace();
  h.click("Model name"); h.click("Position"); h.pick("Footer row 2 · right");
  const rows = h.rows(), modelAt = rows.findIndex(row => row.includes("Model Name")), bottom = rows.findIndex(row => row.startsWith("╰") && row.includes("high"));
  assert.ok(modelAt > bottom);
  h.click("Label before value"); h.text("Using ");
  assert.match(h.rows().join("\n"), /Using Model Name/);
  assert.doesNotMatch(h.rows().join("\n"), /thinking high/);
  h.click("[Save]");
  const saved = await h.pending;
  assert.equal(saved.appearance.elements.model.position, "footer2Right");
  assert.equal(saved.appearance.elements.model.text, "Using {value}");
});

test("invalid custom color stays editable; Escape cancels a field; Discard needs confirmation", async () => {
  const h = workspace();
  h.click("Input box border"); h.click("Frame color"); h.pick("More color options"); h.text("nonsense");
  assert.match(h.rows().join("\n"), /Use # followed by six digits/);
  h.panel.handleInput("\x1b");
  assert.equal(h.latest.appearance.frameColor, "accent");
  h.click("Frame color"); h.pick("Red");
  h.click("[Discard]"); assert.match(h.rows().join("\n"), /Discard all unsaved changes/);
  h.click("[Keep editing]"); assert.equal(h.latest.appearance.frameColor, "red");
  assert.equal(await h.discard(), undefined);
});

test("keyboard search finds hidden fields and editing inputs keep a single IME marker", async () => {
  const h = workspace();
  h.panel.handleInput("/"); h.text("context");
  assert.match(h.rows().join("\n"), /Context usage · Off/);
  h.panel.handleInput("\r"); h.panel.handleInput("\r");
  assert.equal(h.latest.appearance.elements.context.visible, true);
  assert.match(h.rows().join("\n"), /37%/);
  h.click("Label before value");
  assert.equal(h.panel.render(120).join("").split(CURSOR_MARKER).length - 1, 1);
  h.panel.handleInput("\x1b"); await h.discard();
});

test("all placements, light/dark colors and wide Unicode respect width and native scroll priority", async () => {
  const h = workspace();
  for (const name of ["dark", "light"]) {
    initTheme(name, false);
    for (const position of Object.keys(POSITIONS)) {
      h.home.layout.appearance.elements.session.position = position;
      h.home.layout.appearance.elements.session.text = "界面 🌈 é {value}";
      for (const width of [1, 4, 8, 20, 42, 65, 100, 160]) for (const row of ["top", "bottom", "footer1", "footer2"]) {
        const line = appearanceRow(theme, width, h.home, row, 3000);
        assert.ok(visibleWidth(line) <= width, `${row}/${position}/${width}: ${plain(line)}`);
        assert.ok(h.home.appearanceHits.every(hit => hit.x >= 0 && hit.width >= 0));
      }
    }
    for (const state of Object.keys(STATES)) {
      h.home.appearancePreview.state = state;
      assert.ok(appearanceBorder(theme, h.home));
    }
    assert.match(plain(appearanceRow(theme, 100, h.home, "top", 3000, "↑ 4 more")), /↑ 4 more/);
  }
  initTheme("dark", false); await h.discard();
});

test("short/narrow workspaces keep Save, Discard and keyboard navigation; one native draft after resize", async () => {
  const h = workspace();
  for (const [width, height] of [[120, 40], [60, 18], [48, 12], [100, 40], [8, 10], [1, 5]]) {
    h.tui.terminal.columns = width; h.tui.terminal.rows = height;
    const rows = h.panel.render(width);
    assert.equal(rows.length, height);
    assert.ok(rows.every(row => visibleWidth(row) <= width));
    if (width >= 48 && height >= 12) {
      assert.match(rows.map(plain).join("\n"), /\[Discard\].*\[Save\]/);
      assert.ok(rows.map(plain).filter(row => row.includes("Unsent native")).length <= 1);
    }
  }
  h.panel.handleInput("\x13"); await h.pending;
  assert.equal(h.editor.getText(), "Unsent native draft 界面");
});

test("temporary Composer preview dresses disabled pi-vim without changing its draft, mode, undo or padding", async () => {
  const { ModalEditor } = await jiti.import(join(source, "../../node_modules/pi-vim/index.ts"));
  const { dressComposerEditor } = await jiti.import(join(source, "composer-editor.ts"));
  const h = workspace();
  h.home.prefs.enabled = false; // Preview temporarily dresses the disabled native editor.
  const vim = new ModalEditor(h.tui, getEditorTheme(), kb); vim.setClipboardMirrorPolicy("never");
  vim.setText("one two 界面"); vim.handleInput("\x1b"); vim.handleInput("0"); vim.handleInput("x");
  const draft = vim.getText(), cursor = vim.getCursor(), padding = vim.getPaddingX(), original = vim.render;
  const cleanup = dressComposerEditor(vim, () => ({ ui: { theme }, sessionManager: { getSessionName: () => "Vim preview" } }), h.home, () => 3000, () => h.tui.terminal.rows);
  try {
    for (const width of [60, 120]) {
      const lines = vim.render(width).map(plain);
      assert.match(lines.join("\n"), /NORMAL/);
      assert.match(lines.join("\n"), /ne two 界面/);
      assert.ok(lines.every(line => visibleWidth(line) <= width));
    }
    assert.equal(vim.getText(), draft); assert.deepEqual(vim.getCursor(), cursor);
  } finally { cleanup(); }
  assert.equal(vim.render, original); assert.equal(vim.getPaddingX(), padding);
  vim.handleInput("u"); assert.equal(vim.getText(), "one two 界面");
  await h.discard();
});
test("live activity strip stays above the input and preview label clicks retain correct coordinates", async () => {
  const h = workspace(), render = h.surface.render;
  h.surface.render = width => ({ ...render(width), above: ["Real activity strip"] });
  const rows = h.rows(), strip = rows.findIndex(line => line.includes("Real activity strip"));
  const title = rows.findIndex(line => line.includes("Actual chat 界面"));
  assert.ok(strip > 0 && strip < title);
  const hit = h.home.appearanceHits.find(hit => hit.id === "session");
  h.clickAt(hit.x, title);
  assert.equal(h.home.appearancePreview.selected, "session");
  await h.discard();
});
