import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const root = process.env.PI_FRAME_HOST_MODULES || process.env.PI_WORKSPACE_HOST_MODULES || process.env.PI_HOME_HOST_MODULES || process.env.PI_ASK_HOST_MODULES || (() => {
  const install = join(homedir(), ".pi/agent/install");
  try { return join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules"); }
  catch { throw new Error("Pi test host unavailable. Set PI_FRAME_HOST_MODULES (or PI_WORKSPACE_HOST_MODULES / PI_ASK_HOST_MODULES) to a compatible host node_modules directory."); }
})();
const { createJiti } = await import(pathToFileURL(join(root, "jiti/lib/jiti.mjs")));
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-tui": join(root, "@earendil-works/pi-tui/dist/index.js") } });
const { frameRail, frameRows, paintFramePerimeter, statusPreset } = await jiti.import(fileURLToPath(new URL("../index.js", import.meta.url)));
const { visibleWidth, CURSOR_MARKER } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const theme = { style: (text, { fg }) => `\x1b[38;2;100;120;180m${text}\x1b[39m` };
const plain = text => text.replace(/\x1b\[[0-9;]*m/g, "");

test("dedicated primitive entry preserves the public root API and ships its declarations", async () => {
  const direct = await jiti.import("pi-embeddable-frame/primitives");
  for (const [name, fn] of Object.entries({ frameRail, frameRows, paintFramePerimeter, statusPreset })) assert.equal(direct[name], fn);
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const entry = manifest.exports["./primitives"];
  assert.equal(entry.types, "./primitives.d.ts");
  assert.equal(entry.default, "./primitives.js");
  for (const path of Object.values(entry)) {
    assert.ok(manifest.files.includes(path.replace(/^\.\//, "")));
    assert.ok(readFileSync(new URL(`../${path}`, import.meta.url), "utf8").length);
  }
});

test("four independent optional corners, ANSI labels, CJK and input cursor", () => {
  for (const width of [4, 8, 24, 60]) {
    const rows = frameRows({ theme, width, rows: [`hello 界面${CURSOR_MARKER}界`], color: "#445566", inset: 1,
      corners: { topLeft: " one ", topRight: " two ", bottomLeft: " three ", bottomRight: " four " } });
    assert.equal(rows.length, 3);
    assert.ok(rows.every(row => visibleWidth(row) === width));
    assert.equal(rows.join("").split(CURSOR_MARKER).length - 1, width >= 24 ? 1 : 0);
    if (width >= 60) for (const label of ["one", "two", "three", "four"]) assert.match(plain(rows.join("")), new RegExp(label));
  }
  assert.match(plain(frameRows({ width: 10, rows: ["body"] })[1]), /^│body\s+│$/);
  assert.equal(plain(frameRail({ width: 9, left: " much-too-long ", right: " x " })).length, 9);
});

test("center labels stay centered and optional side labels yield at narrow widths", () => {
  for (const width of [8, 17, 42, 70]) {
    const row = frameRail({ width, left: " state ", center: " 聊天 ", right: " Next: tests " });
    const content = plain(row);
    assert.equal(visibleWidth(row), width);
    const start = content.indexOf("聊天");
    assert.ok(start >= 0);
    // The center is anchored by terminal cells, not by unequal side labels.
    const before = visibleWidth(content.slice(0, start));
    assert.ok(Math.abs(before + visibleWidth("聊天") / 2 - width / 2) <= 1);
    if (width >= 42) assert.match(content, /state.*聊天.*Next: tests/);
  }
  const rows = frameRows({ width: 36, rows: ["body"], corners: { topCenter: " Name ", bottomCenter: " NORMAL " } });
  assert.match(rows[0], /Name/); assert.match(rows.at(-1), /NORMAL/);
  assert.ok(rows.every(row => visibleWidth(row) === 36));
});

test("status preset is pure, optional and allows independent color, icon and label overrides", () => {
  const markers = { preparing: "·", running: "◉", returned: "✓", failed: "×", cancelled: "■", observed: "·" };
  for (const appearance of ["dark", "light"]) for (const [state, marker] of Object.entries(markers)) {
    const result = statusPreset({ state, appearance });
    assert.equal(result.marker, marker);
    assert.match(result.color, /^#[0-9a-f]{6}$/i);
    assert.equal(result.label, state);
  }
  assert.equal(statusPreset({ state: "returned", attention: true }).marker, "!");
  assert.equal(statusPreset({ state: "failed", attention: true }).marker, "×");
  assert.deepEqual(statusPreset({ state: "running", markers: { running: "↻" }, colors: { running: "#123456" }, labels: { running: "working" } }),
    { marker: "↻", color: "#123456", label: "working" });
  const decorated = statusPreset({ state: "returned" });
  const row = frameRows({ width: 28, rows: ["unchanged"], corners: { topLeft: ` ${decorated.marker} Task ` } });
  assert.match(plain(row[0]), /✓ Task/);
  assert.match(plain(row[1]), /unchanged/);
});

test("narrow fallback never produces overflowing rows", () => {
  for (const width of [0, 1, 2, 3, 7]) {
    const rows = frameRows({ width, rows: ["wide 界面 input"], minWidth: 8 });
    assert.equal(rows.length, 1);
    assert.ok(visibleWidth(rows[0]) <= width);
  }
});

test("perimeter paint preserves styled border-shaped labels, ANSI context and unknown rails", () => {
  const label = "\x1b[1;38;2;234;127;129mA─╭界面🌈B\x1b[0m";
  for (const position of ["topLeft", "topCenter", "topRight", "bottomLeft", "bottomCenter", "bottomRight"]) {
    const fixed = frameRows({ width: 52, rows: ["body"], corners: { [position]: label }, color: "#333333" });
    const moving = paintFramePerimeter(fixed, { theme, width: 52, color: "#333333", accent: "#ffffff", active: true, now: 500 });
    assert.ok(moving.join("").includes(label));
    assert.deepEqual(moving.map(plain), fixed.map(plain)); assert.deepEqual(moving.map(visibleWidth), fixed.map(visibleWidth));
  }
  const unknown = ["╭ " + label + " ───────────╮", "│body│", "╰────────────────╯"];
  const width = visibleWidth(unknown[0]);
  const moving = paintFramePerimeter(unknown, { theme, width, accent: "#ffffff", active: true, now: 500 });
  assert.ok(moving[0].includes(label), "unknown rails do not guess ownership inside labels");
  const ambiguous = frameRail({ width: 20 });
  assert.equal(frameRail({ width: 20, left: "─" }), ambiguous);
  const painted = paintFramePerimeter([ambiguous, frameRail({ width: 20, side: "bottom" })],
    { theme, width: 20, accent: "#ffffff", active: true, now: 500 });
  assert.deepEqual(painted.map(plain), [ambiguous, frameRail({ width: 20, side: "bottom" })].map(plain));
});

test("motion is opt-in, stable in geometry and never paints content", () => {
  const fixed = frameRows({ width: 36, rows: ["editor content"], color: "#333333", corners: { topLeft: " Header " } });
  const moving = paintFramePerimeter(fixed, { theme, width: 36, bottom: 2, color: "#333333", accent: "#ffffff", active: true, now: 500 });
  assert.deepEqual(moving.map(visibleWidth), fixed.map(visibleWidth));
  assert.equal(moving[1].includes("editor content"), true);
  assert.equal(plain(moving[1]), plain(fixed[1]));
  assert.deepEqual(paintFramePerimeter(fixed, { theme, width: 36, active: false, accent: "#ffffff" }), fixed);
});
