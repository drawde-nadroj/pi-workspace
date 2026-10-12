import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, initTheme, visibleWidth, plain, CURSOR_MARKER } from "./host.mjs";
import { workspace } from "./workspace-harness.mjs";
const { SelectionPulse, selectionHighlight, selectionRow, SELECTION_SHIMMER_MS } = await jiti.import(join(source, "footer-selection.ts"));
const { FOOTER_DEFAULTS, footerPrefs } = await jiti.import(join(source, "footer-state.ts"));
const { appearanceColor } = await jiti.import(join(source, "appearance-render.ts"));
const { parseColor, colorToRgb, foregroundAnsi, indexedColor } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));

function clock(t) {
  let now = 1000;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(performance, "now", () => now);
  return ms => { for (let left = ms; left > 0;) { const step = Math.min(left, 40); now += step; t.mock.timers.tick(step); left -= step; } };
}
const withoutHighlight = s => s.replace(/\x1b\[(?:48;(?:2;\d+;\d+;\d+|5;\d+)|49|4|24)m/g, "");
const rows = h => h.panel.render(h.tui.terminal.columns);

// Interpret emitted SGRs rather than assume nested ANSI wrappers preserve colors.
function cells(text) {
  let fg, bg, bold = false, result = [];
  for (const token of text.split(/(\x1b\[[0-9;]*m)/)) {
    if (token.startsWith("\x1b[")) {
      const p = token.slice(2, -1).split(";").map(Number);
      for (let i = 0; i < p.length; i++) {
        if (p[i] === 0) { fg = bg = undefined; bold = false; }
        else if (p[i] === 39) fg = undefined;
        else if (p[i] === 49) bg = undefined;
        else if (p[i] === 1) bold = true;
        else if (p[i] === 22) bold = false;
        else if (p[i] === 38 || p[i] === 48) {
          const target = p[i], mode = p[++i];
          const color = mode === 2 ? { kind: "rgb", r: p[++i], g: p[++i], b: p[++i] } : indexedColor(p[++i]);
          if (target === 38) fg = colorToRgb(color); else bg = colorToRgb(color);
        }
      }
    } else for (const char of token) result.push({ char, fg, bg, bold });
  }
  return result;
}
const luminance = rgb => {
  const f = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  return .2126 * f(rgb.r) + .7152 * f(rgb.g) + .0722 * f(rgb.b);
};
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

test("pulse has one pending timeout, restarts only on interaction and settles permanently", t => {
  const advance = clock(t); let renders = 0;
  const pulse = new SelectionPulse(() => renders++);
  assert.equal(pulse.phase, undefined);
  pulse.start("element"); assert.equal(pulse.phase, 0);
  advance(160); assert.ok(pulse.phase > 0 && pulse.phase < 1);
  pulse.start("focus"); assert.equal(pulse.phase, 0); assert.equal(pulse.kind, "focus");
  advance(SELECTION_SHIMMER_MS); assert.equal(pulse.phase, undefined); assert.equal(pulse.kind, undefined);
  assert.equal(renders, 16, "restart cancels the first chain rather than layering another one");
  advance(3000); assert.equal(renders, 16);
  pulse.start("element"); pulse.stop(); pulse.stop(); advance(1000); assert.equal(renders, 16);
});

test("light/dark and 256-color/truecolor highlights preserve glyphs, width, foreground and weight", () => {
  for (const name of ["dark", "light"]) {
    initTheme(name, false);
    for (const mode of ["truecolor", "256color"]) {
      const th = { colors: theme.colors, getColorMode: () => mode };
      const text = `${foregroundAnsi(appearanceColor(theme, "red"), mode)}Sent 界面 é 👩‍💻\x1b[39m / \x1b[1m${foregroundAnsi(theme.colors.accent, mode)}Model\x1b[22;39m`;
      for (const phase of [undefined, 0, .2, .5, .8, 1]) {
        const painted = selectionHighlight(th, text, { phase, underline: true });
        assert.equal(plain(painted), plain(text)); assert.equal(visibleWidth(painted), visibleWidth(text));
        assert.deepEqual(cells(painted).map(({ char, fg, bold }) => ({ char, fg, bold })), cells(text).map(({ char, fg, bold }) => ({ char, fg, bold })));
        assert.equal(withoutHighlight(painted), text, "only background and underline escapes are added");
      }
      for (const color of [theme.colors.text, theme.colors.accent, appearanceColor(theme, "red"), parseColor("#777777"), parseColor("#123456")]) {
        for (const phase of [undefined, .5]) {
          const styled = foregroundAnsi(color, mode) + "Readable selection" + "\x1b[39m";
          const painted = selectionHighlight(th, styled, { phase, foreground: color });
          for (const cell of cells(painted)) assert.ok(contrast(cell.fg, cell.bg) >= 4.48, `${name}/${mode}: ${JSON.stringify(cell)}`);
        }
      }
    }
    for (const width of [0, 1, 3, 8, 16, 60]) {
      const text = selectionRow(theme, "界面 é 👩‍💻 selected", width, { selected: true, focused: true, phase: .5 });
      assert.ok(visibleWidth(text) <= width);
    }
  }
  initTheme("dark", false);
});

test("transparent Composer backgrounds still produce a visible steady tint and shimmer", async () => {
  const { composerThemeColors } = await jiti.import(join(source, "composer-style.ts"));
  for (const light of [false, true]) {
    const colors = Object.fromEntries(Object.entries(composerThemeColors(light)).map(([k, v]) => [k, parseColor(v || (light ? "#ffffff" : "#000000"))]));
    const th = { colors, getColorMode: () => "truecolor" };
    const text = foregroundAnsi(colors.text, "truecolor") + "Visible selection" + "\x1b[39m";
    const still = cells(selectionHighlight(th, text)), moving = cells(selectionHighlight(th, text, { phase: .5 }));
    const base = colorToRgb(colors.selectedBg), tinted = still[0].bg;
    assert.ok(Math.max(...["r", "g", "b"].map(k => Math.abs(base[k] - tinted[k]))) >= 30, "not an invisible near-black/white tint");
    assert.notDeepEqual(still.map(c => c.bg), moving.map(c => c.bg));
    for (const cell of [...still, ...moving]) assert.ok(contrast(cell.fg, cell.bg) >= 4.48);
  }
});

test("element and preview shimmer together; steady selected and keyboard-focused markers remain distinct", async t => {
  const advance = clock(t), h = workspace();
  rows(h); h.panel.handleInput("\x1b[B");
  const first = rows(h); assert.equal(h.home.appearancePreview.shimmer, 0);
  advance(200); const moving = rows(h);
  assert.notDeepEqual(moving, first);
  assert.deepEqual(moving.map(plain), first.map(plain));
  const title = moving.findIndex(line => plain(line).includes("Actual chat 界面"));
  assert.notEqual(moving[title], first[title], "linked native preview receives the same pulse");
  assert.equal(withoutHighlight(moving[title]), withoutHighlight(first[title]));
  h.panel.handleInput("\r"); const properties = rows(h).map(plain).join("\n");
  assert.match(properties, /• Chat title/); assert.match(properties, /› Visible/);
  assert.equal(h.home.appearancePreview.shimmer, undefined, "property focus no longer animates the selected element");
  h.click("Text color"); const menu = h.rows().join("\n");
  assert.match(menu, /› .*Match the frame.*✓/); h.panel.handleInput("\x1b[B");
  assert.match(h.rows().join("\n"), /• .*Match the frame.*✓/);
  assert.match(h.rows().join("\n"), /› .*Quieter frame color/);
  h.panel.handleInput("\x1b"); advance(600);
  const staticRows = rows(h); advance(2000); assert.deepEqual(rows(h), staticRows);
  await h.discard();
});

test("unchanged selection does not start motion; direct preview selection matches keyboard selection", async t => {
  const advance = clock(t), h = workspace();
  rows(h); h.panel.handleInput("\x1b[A"); const steady = rows(h); advance(160); assert.deepEqual(rows(h), steady);
  const title = h.rows().findIndex(line => line.includes("Actual chat 界面"));
  const hit = h.home.appearanceHits.find(hit => hit.id === "session");
  h.clickAt(hit.x, title); rows(h); assert.equal(h.home.appearancePreview.shimmer, 0);
  advance(200); assert.equal(h.home.appearancePreview.shimmer, 0); // phase is sampled only at paint
  rows(h); assert.ok(h.home.appearancePreview.shimmer > 0);
  assert.match(h.rows().join("\n"), /• Chat title/);
  await h.discard();
});

test("selecting the input border preserves its labels, colors and geometry at narrow widths", async () => {
  const { appearanceRow } = await jiti.import(join(source, "appearance-render.ts"));
  const h = workspace();
  for (const name of ["dark", "light"]) {
    initTheme(name, false);
    for (const width of [1, 4, 8, 20, 48, 100, 160]) for (const row of ["top", "bottom"]) {
      h.home.appearancePreview = {};
      const original = appearanceRow(theme, width, h.home, row, 3000);
      h.home.appearancePreview = { selected: "frame", shimmer: .4 };
      const selected = appearanceRow(theme, width, h.home, row, 3000);
      assert.equal(plain(selected), plain(original)); assert.ok(visibleWidth(selected) <= width);
      assert.deepEqual(cells(selected).map(({ char, fg, bold }) => ({ char, fg, bold })), cells(original).map(({ char, fg, bold }) => ({ char, fg, bold })));
    }
  }
  initTheme("dark", false); await h.discard();
});

test("typing and discard confirmation stop all pulses; native draft, undo state and IME are not animation targets", async t => {
  const advance = clock(t), h = workspace(); let renders = 0; h.tui.requestRender = () => renders++;
  const draft = h.editor.getText(), cursor = h.editor.getCursor();
  h.click("Model name"); advance(80);
  h.click("Label before value"); rows(h); const count = renders;
  advance(2000); assert.equal(renders, count);
  h.panel.handleInput("Typing 界面"); assert.equal(rows(h).join("").split(CURSOR_MARKER).length - 1, 1);
  advance(1000); assert.equal(h.editor.getText(), draft); assert.deepEqual(h.editor.getCursor(), cursor);
  h.panel.handleInput("\x1b"); h.click("Show this element"); h.click("Chat title");
  h.click("[Discard]"); assert.match(h.rows().join("\n"), /Discard all unsaved/);
  const confirmed = renders; advance(2000); assert.equal(renders, confirmed);
  h.click("[Discard changes]"); await h.pending;
});

for (const action of ["blur", "resize", "invalidate", "dispose", "abort", "save"]) test(`${action} cancels pending animation; closing blocks stale input`, async t => {
  const advance = clock(t), abort = new AbortController(), h = workspace(FOOTER_DEFAULTS, 120, 40, abort.signal);
  let renders = 0; h.tui.requestRender = () => renders++;
  rows(h); h.panel.handleInput("\x1b[B"); advance(80);
  if (action === "blur") h.panel.focused = false;
  if (action === "resize") { h.tui.terminal.columns = 60; rows(h); }
  if (action === "invalidate") h.panel.invalidate();
  if (action === "dispose") h.panel.dispose();
  if (action === "abort") abort.abort();
  if (action === "save") h.panel.handleInput("\x13");
  const count = renders; advance(2000); assert.equal(renders, count);
  if (["dispose", "abort", "save"].includes(action)) {
    h.panel.handleInput("\x1b[B"); advance(600); assert.equal(renders, count);
  }
  if (action === "save" || action === "abort") await h.pending;
  else if (action !== "dispose") { h.panel.focused = true; await h.discard(); }
});

test("shimmer preference defaults on, switches off immediately, participates in Undo, Save and Discard", async t => {
  const advance = clock(t);
  assert.equal(footerPrefs({}).selectionShimmer, "on");
  assert.equal(footerPrefs({ selectionShimmer: "unknown" }).selectionShimmer, "on");
  const h = workspace(); h.click("[Other options]"); h.click("Selection shimmer"); h.pick("off");
  assert.equal(h.latest.selectionShimmer, "off");
  h.click("[Elements]"); h.panel.handleInput("\x1b[B"); const steady = rows(h); advance(1000); assert.deepEqual(rows(h), steady);
  h.click("[Undo]"); assert.equal(h.latest.selectionShimmer, "on");
  h.click("[Other options]"); h.click("Selection shimmer"); h.pick("off"); h.click("[Save]");
  const saved = await h.pending; assert.equal(footerPrefs(JSON.parse(JSON.stringify(saved))).selectionShimmer, "off");
  const again = workspace(saved); again.click("[Other options]"); again.click("Selection shimmer"); again.pick("on");
  await again.discard(); assert.equal(saved.selectionShimmer, "off");
});
