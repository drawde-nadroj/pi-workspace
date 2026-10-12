import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { workspace } from "./workspace-harness.mjs";
import { jiti, source, plain, visibleWidth } from "./host.mjs";
const { FOOTER_DEFAULTS } = await jiti.import(join(source, "footer-state.ts"));
const { settingName, settingValue } = await jiti.import(join(source, "workspace-setting-layout.ts"));
const { LABELS } = await jiti.import(join(source, "footer-option-info.ts"));
const { OTHER_OPTIONS, PREFERENCE_GROUPS, preferenceGroup } = await jiti.import(join(source, "workspace-preference-rooms.ts"));
const quiet = { ...FOOTER_DEFAULTS, motion: "off", selectionShimmer: "off" };
function hover(h, label) {
  const rows = h.rows(), y = rows.findIndex(row => row.startsWith("│") && row.includes(label));
  assert.ok(y >= 0, `${label} not visible:\n${rows.join("\n")}`);
  const x = visibleWidth(rows[y].slice(0, rows[y].indexOf(label)));
  return h.panel.handleMouse({ type: "move", button: "none", x, y, screenX: x, screenY: y, width: h.tui.terminal.columns, height: h.tui.terminal.rows, ctrl: false, alt: false, shift: false });
}
const leave = h => h.panel.handleMouse({ type: "move", button: "none", x: h.tui.terminal.columns - 1, y: 0, screenX: 0, screenY: 0, width: h.tui.terminal.columns, height: h.tui.terminal.rows, ctrl: false, alt: false, shift: false });
function snapshot(h) { return JSON.stringify({ text: h.editor.getText(), clock: h.home.clock, phase: h.home.phase, data: h.data, promptDepth: h.home.promptDepth }); }

test("Composer state hover is reversible, does not select a mode, edit prefs, create Undo or change native facts", async () => {
  const h = workspace(quiet), facts = snapshot(h), prefs = JSON.stringify(h.latest);
  try {
    h.click("Assistant status"); h.click("Preview appearance");
    hover(h, "Waiting for you"); assert.equal(h.home.appearancePreview.state, "waiting");
    assert.match(h.rows().join("\n"), /hover or keyboard preview/);
    hover(h, "Finished"); assert.equal(h.home.appearancePreview.state, "done");
    assert.equal(JSON.stringify(h.latest), prefs); assert.doesNotMatch(h.rows().join("\n"), /Unsaved changes/);
    leave(h); assert.equal(h.home.appearancePreview.state, undefined);
    h.panel.handleInput("\r"); // The keyboard still owns Live state, not hovered Finished.
    assert.equal(h.home.appearancePreview.state, undefined);
    h.panel.handleInput("\x1a"); assert.match(h.rows().join("\n"), /No changes to undo/);
    assert.equal(snapshot(h), facts);
  } finally { await h.discard(); }
});

test("keyboard mode audition is equivalent; Escape restores the pinned demonstration", async () => {
  const h = workspace(quiet);
  try {
    h.click("Assistant status"); h.click("Preview appearance"); h.pick("When the assistant finishes");
    h.click("Preview appearance"); h.panel.handleInput("\x1b[A");
    assert.notEqual(h.home.appearancePreview.state, "done");
    h.panel.handleInput("\x1b"); assert.equal(h.home.appearancePreview.state, "done");
    assert.doesNotMatch(h.rows().join("\n"), /Unsaved changes/);
  } finally { await h.discard(); }
});

for (const boundary of ["blur", "resize", "invalidate", "dispose", "abort"]) test(`active candidate audition restores on ${boundary}`, async () => {
  const controller = new AbortController(), h = workspace(quiet, 120, 40, controller.signal), prefs = JSON.stringify(h.latest), facts = snapshot(h);
  h.click("Chat title"); h.click("Text color"); hover(h, "Red");
  assert.equal(h.latest.appearance.elements.session.color, "red");
  if (boundary === "blur") h.panel.focused = false;
  else if (boundary === "resize") { h.tui.terminal.columns = 62; h.rows(); }
  else if (boundary === "invalidate") h.panel.invalidate();
  else if (boundary === "dispose") h.panel.dispose();
  else controller.abort();
  assert.equal(JSON.stringify(h.latest), prefs); assert.equal(snapshot(h), facts);
  if (boundary === "abort") await h.pending;
  else if (boundary === "dispose") { controller.abort(); } // Already disposed; no promise assertion.
  else { h.panel.focused = true; h.panel.handleInput("\x1b"); await h.discard(); }
});

test("candidate colors/positions across Input, Tasks, Ask and Transcript preview without acceptance; one click creates one Undo", async () => {
  const cases = [
    { room: "Input", part: "Chat title", control: "Position", value: "Input box · bottom left", inspect: p => p.appearance.elements.session.position, expected: "bottomLeft" },
    { room: "Tasks", part: "Title", control: "Title position", value: "Bottom right", inspect: p => p.tasks.presentation.positions.title, expected: "bottomRight" },
    { room: "Ask", part: "Question progress", control: "Progress position", value: "Bottom right", inspect: p => p.ask.progressPosition, expected: "bottomRight" },
    { room: "Transcript", part: "Sourced Sent time", control: "Sent position", value: "Bottom left", inspect: p => p.transcript.chat.sentPosition, expected: "bottomLeft" },
  ];
  for (const item of cases) {
    const h = workspace(quiet), before = JSON.stringify(h.latest), facts = snapshot(h);
    try {
      if (item.room !== "Input") h.click(`[${item.room}]`);
      h.click(item.part); h.click(item.control); hover(h, item.value);
      assert.equal(item.inspect(h.latest), item.expected); assert.doesNotMatch(h.rows().join("\n"), /Unsaved changes/);
      leave(h); assert.equal(JSON.stringify(h.latest), before);
      hover(h, item.value); h.click(item.value);
      assert.equal(item.inspect(h.latest), item.expected); assert.match(h.rows().join("\n"), /Unsaved changes/);
      h.panel.handleInput("\x1a"); assert.equal(JSON.stringify(h.latest), before);
      assert.equal(snapshot(h), facts);
    } finally { await h.discard(); }
  }
});

test("Task mode hover remains a static example and never edits a plan/preferences", async () => {
  const h = workspace(quiet), before = JSON.stringify(h.latest), facts = snapshot(h);
  try {
    h.click("[Tasks]"); h.click("Demo state"); hover(h, "waiting");
    assert.match(h.rows().join("\n"), /Example Tasks.*waiting.*hover or keyboard preview/);
    leave(h); assert.match(h.rows().join("\n"), /Example Tasks.*working/);
    h.panel.handleInput("\x1b"); assert.equal(JSON.stringify(h.latest), before); assert.equal(snapshot(h), facts);
  } finally { await h.discard(); }
});

test("all advanced settings remain reachable in coherent, view-only groups", async () => {
  const seen = new Set();
  for (const [id, label] of Object.entries(PREFERENCE_GROUPS)) {
    if (id === "all") continue;
    const h = workspace(quiet);
    try {
      const before = JSON.stringify(h.latest);
      h.click("[More settings]"); h.click("Advanced settings"); h.click("Settings group"); h.pick(label);
      assert.equal(JSON.stringify(h.latest), before); assert.doesNotMatch(h.rows().join("\n"), /Unsaved changes/);
      const count = OTHER_OPTIONS.filter(option => preferenceGroup(option) === id).length;
      for (let n = 0; n <= count; n++) {
        for (const option of OTHER_OPTIONS) if (preferenceGroup(option) === id && h.rows().some(row => row.startsWith("│") && row.includes(settingName(LABELS[option])))) seen.add(option);
        h.panel.handleInput("\x1b[B");
      }
    } finally { await h.discard(); }
  }
  assert.equal(seen.size, OTHER_OPTIONS.length);
});

test("General demonstrates the real name preference and spacing, without submitting sample messages", async () => {
  const h = workspace(quiet), facts = snapshot(h);
  try {
    h.click("[General]"); h.click("Your display name"); h.text("Alex 界面");
    assert.match(h.rows().join("\n"), /╭ Alex 界面/);
    const before = JSON.stringify(h.latest), spaced = h.panel.render(120).slice(h.rows().findIndex(row => row.includes("Example messages")));
    h.click("Workspace density"); hover(h, "Compact");
    assert.equal(h.latest.density, "compact"); assert.doesNotMatch(h.rows().join("\n"), /Unsent native draft/);
    leave(h); assert.equal(JSON.stringify(h.latest), before);
    h.panel.handleInput("\x1b"); assert.deepEqual(h.panel.render(120).slice(h.rows().findIndex(row => row.includes("Example messages"))).map(plain), spaced.map(plain));
    assert.equal(snapshot(h), facts);
  } finally { await h.discard(); }
});

test("audition that changes preview height leaves every menu row and Save at the same coordinates", async () => {
  const h = workspace(quiet, 62, 24);
  try {
    h.panel.handleInput("\x1b[Z"); h.click("Workspace density");
    const geometry = () => h.rows().flatMap((row, y) => ["Spaced", "Compact", "[Save]"].filter(label => row.includes(label)).map(label => [label, row.indexOf(label), y]));
    const before = geometry(); hover(h, "Compact"); assert.deepEqual(geometry(), before);
    leave(h); assert.deepEqual(geometry(), before);
    h.panel.handleInput("\x1b");
  } finally { await h.discard(); }
});

test("Save during hover retains accepted settings, not the unaccepted candidate", async () => {
  const h = workspace(quiet), before = JSON.stringify(h.latest);
  h.click("Chat title"); h.click("Text color"); hover(h, "Red");
  assert.equal(h.latest.appearance.elements.session.color, "red");
  h.panel.handleInput("\x13"); const saved = await h.pending;
  assert.equal(saved.appearance.elements.session.color, "frame");
  assert.equal(JSON.stringify(saved), before);
});

test("setting headings, empty values and help are bounded and aligned across all sections", async () => {
  for (const width of [1, 12, 40, 62, 92, 120, 220]) {
    const h = workspace(quiet, width, 40);
    try {
      for (let section = 0; section < 6; section++) {
        const rows = h.rows(); assert.equal(rows.length, 40);
        for (const row of h.panel.render(width)) assert.ok(visibleWidth(row) <= width);
        if (width >= 92) {
          assert.match(rows.join("\n"), /Setting\s+Value/);
          assert.match(rows.join("\n"), /\[Undo\].*\[Discard\].*\[Save\]/);
        }
        h.panel.handleInput("\t");
      }
    } finally { h.panel.handleInput("\x13"); await h.pending; }
  }
});
