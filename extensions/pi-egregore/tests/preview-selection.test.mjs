import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, initTheme, plain, visibleWidth } from "./host.mjs";
import { workspace } from "./workspace-harness.mjs";
const { connectPreview } = await jiti.import(join(source, "preview-selection.ts"));
const { taskPanelPreview, taskDemo, taskPanelDefaults } = await jiti.import(join(source, "task-presentation.ts"));
const { questionPreview } = await jiti.import(join(source, "../../packages/pi-ask/extensions/ask-user-question/question-preview.ts"));
const { askAppearanceDefaults } = await jiti.import(join(source, "../../packages/pi-ask/extensions/ask-user-question/appearance.ts"));
const { transcriptPreview, transcriptDefaults } = await jiti.import(join(source, "transcript-presentation.ts"));
const { FOOTER_DEFAULTS } = await jiti.import(join(source, "footer-state.ts"));
const { colorToRgb, indexedColor } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const background = /\x1b\[48;(?:2;\d+;\d+;\d+|5;\d+)m/;

// Read emitted styles, not wrapper strings: selection must preserve real colors,
// especially user-red and failed-tool status, while making the background readable.
function cells(text) {
  let fg, bg, bold = false, underline = false;
  const result = [];
  for (const token of text.split(/(\x1b\[[0-9;]*m)/)) {
    if (!token.startsWith("\x1b[")) {
      for (const char of token) result.push({ char, fg, bg, bold, underline });
      continue;
    }
    const p = token.slice(2, -1).split(";").map(Number);
    for (let i = 0; i < p.length; i++) {
      if (p[i] === 0) { fg = bg = undefined; bold = underline = false; }
      else if (p[i] === 39) fg = undefined;
      else if (p[i] === 49) bg = undefined;
      else if (p[i] === 1) bold = true;
      else if (p[i] === 22) bold = false;
      else if (p[i] === 4) underline = true;
      else if (p[i] === 24) underline = false;
      else if (p[i] === 38 || p[i] === 48) {
        const target = p[i], mode = p[++i];
        const color = mode === 2 ? { kind: "rgb", r: p[++i], g: p[++i], b: p[++i] } : indexedColor(p[++i]);
        if (target === 38) fg = colorToRgb(color); else bg = colorToRgb(color);
      }
    }
  }
  return result;
}
const content = rows => rows.map(row => cells(row).map(({ char, fg, bold }) => ({ char, fg, bold })));
const luminance = rgb => {
  const f = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  return .2126 * f(rgb.r) + .7152 * f(rgb.g) + .0722 * f(rgb.b);
};
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const frame = { state: "working", active: false, phase: 0, sweep: 0, intensity: 0 };
const factories = [
  ["Tasks", width => taskPanelPreview(theme, width, taskDemo("working"), taskPanelDefaults(), frame, 7), "frame", ["frame", "title", "summary", "hint", "body", "active"]],
  ["Ask", width => questionPreview(theme, width, askAppearanceDefaults()), "frame", ["frame", "title", "progress", "body", "hint"]],
  ["Chat", width => transcriptPreview(theme, width, transcriptDefaults(), "chat"), "chatFrame", ["chatFrame", "chatIdentity", "chatSent"]],
  ["Tools", width => transcriptPreview(theme, width, transcriptDefaults(), "tools"), "toolFrame", ["toolFrame", "toolIdentity", "toolStatus"]],
];

for (const [name, make, frameId, ids] of factories) test(`${name}: target linkage preserves content, styles and bounded geometry across themes and widths`, () => {
  try {
    for (const appearance of ["dark", "light"]) {
      initTheme(appearance, false);
      for (const width of [0, 1, 8, 12, 16, 24, 40, 120]) {
        const original = make(width), before = JSON.stringify(original);
        for (const selected of ids) for (const phase of [undefined, .5]) {
          const linked = connectPreview(theme, original, selected, { frameId, phase });
          assert.equal(JSON.stringify(original), before, "view and hit records remain untouched");
          assert.deepEqual(linked.rows.map(plain), original.rows.map(plain));
          assert.deepEqual(content(linked.rows), content(original.rows), `${appearance}/${width}/${selected}: foreground/weight must not change`);
          assert.ok(linked.rows.every(row => visibleWidth(row) <= width));
          assert.ok(linked.hits.every(hit => hit.x >= 0 && hit.width > 0 && hit.x + hit.width <= width && hit.y < linked.rows.length));
          const visible = linked.hits.some(hit => hit.id === selected && hit.affected !== false);
          const backgrounds = rows => rows.map(row => cells(row).map(cell => cell.bg));
          assert.equal(JSON.stringify(backgrounds(linked.rows)) !== JSON.stringify(backgrounds(original.rows)), visible,
            `${appearance}/${width}/${selected}: only visible targets change their background`);
          for (const row of linked.rows) for (const cell of cells(row)) {
            if (cell.bg && cell.fg) assert.ok(contrast(cell.fg, cell.bg) >= 4.48, `${appearance}/${width}/${selected}: ${JSON.stringify(cell)}`);
          }
        }
      }
    }
  } finally { initTheme("dark", false); }
});

test("perimeter linkage excludes labels; body linkage can include its active row", () => {
  const view = taskPanelPreview(theme, 120, taskDemo("working"), taskPanelDefaults(), frame, 7);
  const perimeter = connectPreview(theme, view, "frame", { frameId: "frame" });
  for (const hit of view.hits.filter(hit => hit.y === 0)) {
    assert.ok(!cells(perimeter.rows[0]).slice(hit.x, hit.x + hit.width).some(cell => cell.bg), "labels are not part of a frame-color target");
  }
  const body = connectPreview(theme, view, "body", { frameId: "frame", related: ["active"] });
  assert.ok(background.test(body.rows[1]), "all overview rows are affected by body layout settings");
  assert.ok(!background.test(body.rows[0]));
});

function move(h, label, last = false) {
  const lines = h.rows(), indices = lines.flatMap((line, i) => line.includes(label) ? [i] : []), y = last ? indices.at(-1) : indices[0];
  assert.notEqual(y, undefined, `${label} is not visible`);
  const x = visibleWidth(lines[y].slice(0, lines[y].indexOf(label)));
  return h.panel.handleMouse({ type: "move", button: "none", x, y, screenX: x, screenY: y, width: h.tui.terminal.columns, height: h.tui.terminal.rows, shift: false, alt: false, ctrl: false });
}
const rendered = h => h.panel.render(h.tui.terminal.columns);
const previewRows = h => { const rows = rendered(h); return rows.slice(rows.findIndex(row => /^(?:Your live input|Example)/.test(plain(row))) + 1); };

for (const [room, selected, target, scope] of [
  ["Input", "Assistant status", "Chat title", "Actual chat 界面"],
  ["Tasks", "Border and motion", "Progress", "3 of 6 done · 1 blocked"],
  ["Ask", "Question title", "Question text", "Which option suits this sample?"],
  ["Transcript", "Chat identity", "Sourced Sent time", "9:41:05 AM"],
]) test(`${room}: hover inspects without selection, edits or native-state mutation; keyboard restores selection`, async () => {
  const h = workspace({ ...FOOTER_DEFAULTS, motion: "off", selectionShimmer: "off" });
  try {
    h.click(`[${room}]`);
    const draft = JSON.stringify(h.latest), clock = JSON.stringify(h.workspace.clock), native = h.editor.getText(), cursor = h.editor.getCursor();
    assert.match(h.rows().join("\n"), new RegExp(`Selected: ${selected}`));
    move(h, target);
    assert.match(h.rows().join("\n"), new RegExp(`Inspecting: ${target}`));
    assert.ok(previewRows(h).some(row => plain(row).includes(scope) && background.test(row)));
    assert.match(h.rows().join("\n"), new RegExp(`Egregore · (?:Input & footer|${room})(?: · ${selected})?`));
    assert.equal(JSON.stringify(h.latest), draft); assert.equal(JSON.stringify(h.workspace.clock), clock);
    assert.equal(h.editor.getText(), native); assert.deepEqual(h.editor.getCursor(), cursor);
    assert.equal(move(h, target).render, false, "the same hover does not keep requesting frames");
    h.panel.handleInput("\x1b[D");
    assert.match(h.rows().join("\n"), new RegExp(`Selected: ${selected}`));
    assert.doesNotMatch(h.rows().join("\n"), /Inspecting:/);
    assert.equal(JSON.stringify(h.latest), draft);
  } finally { await h.discard(); }
});

test("preview target clicks retain geometry after highlighting and property edits", async () => {
  const h = workspace({ ...FOOTER_DEFAULTS, motion: "off", selectionShimmer: "off" });
  try {
    h.click("[Tasks]"); h.click("3 of 6 done · 1 blocked");
    assert.match(h.rows().join("\n"), /Selected: Progress · Top right/);
    h.click("Count position"); h.pick("bottomCenter");
    const lines = h.rows(), y = lines.findIndex(row => row.startsWith("╰") && row.includes("3 of 6 done"));
    h.clickAt(visibleWidth(lines[y].split("3 of 6 done · 1 blocked")[0]), y);
    assert.match(h.rows().join("\n"), /Selected: Progress · Bottom center/);
    assert.ok(background.test(previewRows(h).find(row => plain(row).startsWith("╰") && plain(row).includes("3 of 6 done"))));
    h.click("[Ask]"); h.click("Question frame");
    assert.match(h.rows().join("\n"), /Pi theme accent/); assert.doesNotMatch(h.rows().join("\n"), /orange/i);
    h.click("Question progress"); h.click("Progress position"); h.pick("bottomRight");
    h.click("2 of 3"); assert.match(h.rows().join("\n"), /Selected: Question progress · Bottom right/);
    h.click("[Transcript]"); h.click("Tool status"); h.click("failed");
    const failure = previewRows(h).find(row => plain(row).includes("failed"));
    const failedCells = cells(failure).filter(cell => cell.underline);
    assert.equal(failedCells.length, 0, "successful-status control never marks failure as an editable target");
    assert.match(plain(failure), /× failed/);
    assert.ok(background.test(previewRows(h).find(row => plain(row).includes("returned"))));
  } finally { await h.discard(); }
});

test("unavailable targets explain hidden settings, inactive states, clipping and absent overflow", async () => {
  const h = workspace({ ...FOOTER_DEFAULTS, motion: "off", selectionShimmer: "off" });
  try {
    h.click("[Transcript]"); h.click("Sourced Sent time"); h.click("Show sourced Sent time");
    h.panel.handleInput("\x1b[D"); // Clear the edit acknowledgement so persistent availability is visible.
    assert.match(h.rows().join("\n"), /Off: sourced Sent time is hidden/);
    h.click("[Tasks]"); h.click("Demo state"); h.pick("idle"); h.click("Active task");
    assert.match(h.rows().join("\n"), /No active row in this example state/);
    h.panel.handleInput("\x1b[D"); // Keyboard path back into the element list.
    for (let i = 0; i < 5; i++) h.panel.handleInput("\x1b[A"); // Up to the frame element.
    h.panel.handleInput("\x1b[C");
    h.click("Demo state"); h.pick("done");
    h.click("Task rows"); h.click("Visible tasks"); h.pick("5"); h.click("More hint");
    assert.match(h.rows().join("\n"), /Selected: More hint/);
    assert.doesNotMatch(previewRows(h).map(plain).join("\n"), /\+ \d+ more/);
    assert.match(previewRows(h).map(plain).join("\n"), /\/tasks/, "the /tasks route stays on the rail");
    h.click("[Ask]"); h.click("Question progress"); h.tui.terminal.rows = 16;
    assert.match(h.rows().join("\n"), /Not visible now/);
    assert.ok(h.panel.render(120).length <= 16);
  } finally { h.tui.terminal.rows = 40; await h.discard(); }
});

test("a status-specific border control identifies the perimeter without changing the selected status or run", async () => {
  const h = workspace({ ...FOOTER_DEFAULTS, motion: "off", selectionShimmer: "off" });
  try {
    const clock = JSON.stringify(h.workspace.clock), native = h.editor.getText();
    h.click("Assistant status"); h.click("Preview appearance"); h.pick("When the assistant finishes");
    const before = JSON.stringify(h.latest);
    move(h, "State border color");
    assert.match(h.rows().join("\n"), /Inspecting: Input box border · Input perimeter/);
    assert.equal(h.workspace.appearancePreview.selected, "frame");
    assert.equal(JSON.stringify(h.latest), before);
    h.click("Frame color for this state");
    assert.match(h.rows().join("\n"), /Affects: Input box border · Input perimeter/);
    h.panel.handleInput("\x1b");
    assert.match(h.rows().join("\n"), /• Assistant status/);
    const rail = previewRows(h).find(row => plain(row).startsWith("╭"));
    assert.ok(background.test(rail));
    const plainRail = plain(rail), status = plainRail.indexOf("your turn");
    assert.ok(status >= 0);
    assert.ok(!cells(rail).slice(status, status + "your turn".length).some(cell => cell.bg), "the status text is not a frame-color target");
    assert.equal(JSON.stringify(h.workspace.clock), clock); assert.equal(h.editor.getText(), native);
  } finally { await h.discard(); }
});

for (const action of ["blur", "resize", "invalidate", "abort"]) test(`hover clears on ${action} without saving or altering the native draft`, async () => {
  const abort = new AbortController(), h = workspace({ ...FOOTER_DEFAULTS, motion: "off", selectionShimmer: "off" }, 120, 40, abort.signal);
  h.rows(); move(h, "Chat title"); assert.equal(h.workspace.appearancePreview.selected, "session");
  if (action === "blur") h.panel.focused = false;
  if (action === "resize") { h.tui.terminal.columns = 60; h.rows(); }
  if (action === "invalidate") h.panel.invalidate();
  if (action === "abort") abort.abort();
  assert.equal(h.workspace.appearancePreview.selected, "status");
  assert.equal(h.editor.getText(), "Unsent native draft 界面");
  if (action === "abort") { assert.equal(await h.pending, undefined); h.panel.dispose(); }
  else { h.panel.focused = true; h.tui.terminal.columns = 120; await h.discard(); }
});
