import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { jiti, source, kb, theme, initTheme, plain, visibleWidth, CURSOR_MARKER } from "./host.mjs";
const { ComposerPreview, PREVIEW_PHASES, registerComposerPreview } = await jiti.import(join(source, "composer-preview.ts"));

function setup(phase = "typing", options = {}) {
  let time = 0, renders = 0, closed = 0, id = 0;
  const timers = new Map();
  const clock = {
    now: () => time,
    set(callback, delay) { const key = ++id; timers.set(key, { callback, at: time + delay, delay }); return key; },
    clear(key) { timers.delete(key); },
  };
  const tui = { terminal: { columns: 116, rows: 30 }, requestRender() { renders++; } };
  const screen = new ComposerPreview(tui, () => theme, kb, () => closed++, phase, clock, options);
  screen.focused = true;
  return {
    screen, tui, timers,
    get closed() { return closed; }, get renders() { return renders; },
    setTime(value) { time = value; },
    tick(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      time = end;
    },
    text(width = 116) { return screen.render(width).map(plain); },
  };
}

test("all states and treatments fit narrow/tall/Unicode and light/dark viewports", () => {
  for (const appearance of ["dark", "light"]) {
    initTheme(appearance, false);
    for (const phase of PREVIEW_PHASES) {
      const h = setup(phase);
      try {
        for (let treatment = 0; treatment < 3; treatment++, h.screen.handleInput("v")) {
          for (const rows of [1, 8, 19, 22, 30, 60]) {
            h.tui.terminal.rows = rows;
            for (const width of [0, 1, 2, 12, 37, 38, 58, 75, 90, 116, 180]) {
              const lines = h.screen.render(width);
              assert.ok(lines.length <= Math.max(1, rows - 2));
              for (const line of lines) assert.equal(visibleWidth(line), width, `${phase}/${treatment}/${appearance}/${rows}/${width}: ${JSON.stringify(line)}`);
              if (width >= 38 && rows >= 22) {
                assert.match(lines.map(plain).join("\n"), /SIMULATED/);
                assert.match(lines.map(plain).join("\n"), /42%/);
              }
            }
          }
        }
      } finally { h.screen.dispose(); }
    }
  }
  initTheme("dark", false);
});

test("input and footer rows stay fixed across phases and detail expansion; directory is above model", () => {
  const h = setup();
  try {
    const initial = h.text();
    const inputRow = initial.findIndex(line => line.includes("Make the composer"));
    const dirRow = initial.findIndex(line => line.includes("~/work/composer"));
    const column = initial[dirRow].indexOf("~/work/composer");
    assert.ok(inputRow > 0);
    assert.equal(initial[dirRow + 1].indexOf("demo-model"), column);
    for (const [i, phase] of PREVIEW_PHASES.entries()) {
      h.screen.handleInput(String(i + 1));
      for (const expand of [false, true]) {
        if (expand) h.screen.handleInput("d");
        const lines = h.text();
        assert.equal(lines.findIndex(line => line.includes("Make the composer")), inputRow, phase);
        assert.equal(lines.findIndex(line => line.includes("~/work/composer")), dirRow, phase);
        assert.equal(lines[dirRow + 1].indexOf("demo-model"), column);
        assert.match(lines.slice(dirRow, dirRow + 2).join("\n"), /42%/);
      }
    }
  } finally { h.screen.dispose(); }
});

test("typing uses Pi input, retains Unicode and preview shortcuts as text, never sends", () => {
  const h = setup();
  try {
    h.screen.render(116);
    h.screen.handleInput("e");
    assert.equal(h.screen.isEditing, true);
    assert.equal(h.timers.size, 0);
    h.screen.handleInput("\x01"); // Ctrl+A
    h.screen.handleInput("\x0b"); // Ctrl+K
    h.screen.handleInput("\x1b[200~界面 🌱 123 emvi\x1b[201~");
    assert.match(h.screen.draft, /界面 🌱 123 emvi/);
    assert.equal(h.screen.selected, "typing");
    const lines = h.screen.render(116);
    assert.ok(lines.some(line => line.includes(CURSOR_MARKER)));
    for (const line of lines) assert.equal(visibleWidth(line), 116);
    h.screen.focused = false;
    assert.ok(!h.screen.render(116).some(line => line.includes(CURSOR_MARKER)));
    h.screen.focused = true;
    h.screen.handleInput("\r");
    assert.equal(h.screen.isEditing, false);
    assert.equal(h.closed, 0);
    assert.equal(h.screen.selected, "typing");
    assert.match(h.screen.draft, /123 emvi/);
    h.screen.handleInput("e");
    h.screen.handleInput("\x1b");
    assert.equal(h.closed, 0); // Esc leaves demo input first.
    h.screen.handleInput("\x1b");
    assert.equal(h.closed, 1);
    h.screen.handleInput("\x1b");
    assert.equal(h.closed, 1);
  } finally { h.screen.dispose(); }
});

test("motion animates only during work, preserves context occupancy and stops when waiting", () => {
  const h = setup("working");
  try {
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].delay, 100);
    const first = h.screen.render(116);
    h.tick(300);
    const next = h.screen.render(116);
    assert.notDeepEqual(first, next);
    const meter = lines => lines.map(plain).find(line => line.includes("42%"));
    assert.equal(meter(first), meter(next));
    h.screen.handleInput("m");
    assert.equal([...h.timers.values()][0].delay, 1000);
    const still = h.screen.render(116);
    h.tick(300);
    assert.deepEqual(h.screen.render(116), still);
    h.tick(1000);
    assert.notDeepEqual(h.screen.render(116), still); // Time continues with motion off.
    h.screen.handleInput("4");
    assert.equal(h.timers.size, 0);
    assert.match(h.text().join("\n"), /Your answer is needed/);
    assert.doesNotMatch(h.text().join("\n"), /total active/);
    const waiting = h.screen.render(116);
    h.tick(10000);
    assert.deepEqual(h.screen.render(116), waiting);
    h.screen.handleInput("5");
    assert.equal(h.timers.size, 0); // Motion remains off.
    assert.match(h.text().join("\n"), /last run 24s/);
    assert.match(h.text().join("\n"), /total active 2m 18s/);
  } finally { h.screen.dispose(); }
});

test("tour has explicit pause/resume, stops at last sample, and manual selection stops it", () => {
  const h = setup();
  try {
    assert.equal(h.timers.size, 0);
    h.screen.handleInput(" ");
    h.tick(4000);
    assert.equal(h.screen.selected, "working");
    h.tick(500);
    h.screen.handleInput(" ");
    assert.equal(h.timers.size, 0);
    const frozen = h.screen.render(116);
    h.tick(10000);
    assert.deepEqual(h.screen.render(116), frozen);
    h.screen.handleInput(" ");
    h.tick(3500);
    assert.equal(h.screen.selected, "tools");
    h.tick(16000);
    assert.equal(h.screen.selected, "error");
    assert.equal(h.timers.size, 0);
    h.screen.handleInput("r");
    assert.equal(h.screen.selected, "typing");
    h.screen.handleInput("\x1b[51u"); // Kitty 3
    assert.equal(h.screen.selected, "tools");
    assert.match(h.text().join("\n"), /tour manual/);
    h.screen.handleInput("\x1b[D");
    assert.equal(h.screen.selected, "working");
    h.screen.handleInput("\x03");
    assert.equal(h.closed, 1);
    assert.equal(h.timers.size, 0);
    const renders = h.renders;
    h.tick(10000);
    assert.equal(h.renders, renders);
  } finally { h.screen.dispose(); }
});

test("mouse state selection and input focus work; narrow preview and icons are local", () => {
  const h = setup();
  try {
    const lines = h.text();
    const x = lines[2].indexOf("3 Tools");
    assert.equal(h.screen.handleMouse({ type: "click", button: "left", x, y: 2 }).handled, true);
    assert.equal(h.screen.selected, "tools");
    h.screen.handleInput("i");
    assert.match(h.text().join("\n"), /sent 10:42/);
    h.screen.handleInput("n");
    assert.ok(h.screen.render(116).every(line => visibleWidth(line) === 58));
    const inputY = h.text().findIndex(line => line.includes("Make the composer"));
    assert.equal(h.screen.handleMouse({ type: "click", button: "left", x: 4, y: inputY, width: 58, height: 22 }).handled, true);
    assert.equal(h.screen.isEditing, true);
    assert.equal(h.screen.selected, "typing");
    h.screen.handleInput("\x04");
    assert.equal(h.closed, 1);
  } finally { h.screen.dispose(); }
});

test("command mounts only a temporary overlay, closes on shutdown, and releases after errors", async () => {
  const commands = new Map(), events = new Map();
  registerComposerPreview({ registerCommand: (name, command) => commands.set(name, command), on: (name, handler) => events.set(name, handler) }, () => ({ motion: false, icons: false }));
  const command = commands.get("composer-preview");
  const notices = [];
  const ctx = { mode: "rpc", ui: { notify: (...args) => notices.push(args) } };
  await command.handler("", ctx);
  assert.match(notices.at(-1)[0], /terminal UI/);
  ctx.mode = "tui";
  await command.handler("bad", ctx);
  assert.match(notices.at(-1)[0], /Usage/);
  assert.deepEqual(command.getArgumentCompletions("w").map(x => x.value), ["working", "waiting"]);
  let screen, mounts = 0;
  ctx.ui.theme = theme;
  ctx.ui.custom = (factory, options) => {
    mounts++;
    assert.equal(options.overlay, true);
    return new Promise(resolve => {
      screen = factory({ terminal: { rows: 30, columns: 110 }, requestRender() {} }, theme, kb, resolve);
      assert.ok(options.overlayOptions().width <= 110);
    });
  };
  const pending = command.handler("working", ctx);
  assert.match(screen.render(100).map(plain).join("\n"), /motion off/);
  await command.handler("", ctx);
  assert.equal(mounts, 1);
  assert.match(notices.at(-1)[0], /already open/);
  events.get("session_shutdown")();
  await pending;
  ctx.ui.custom = () => { throw new Error("mount failed"); };
  await assert.rejects(command.handler("", ctx), /mount failed/);
  await assert.rejects(command.handler("", ctx), /mount failed/); // Opening lock released.
});

test("completion settles after 800ms and idle scenes have no animation timer", () => {
  const h = setup("finished");
  try {
    const initial = h.screen.render(116);
    h.tick(400);
    assert.notDeepEqual(h.screen.render(116), initial);
    h.tick(400);
    assert.equal(h.timers.size, 0);
    const settled = h.screen.render(116);
    h.tick(10000);
    assert.deepEqual(h.screen.render(116), settled);
    h.screen.handleInput("1");
    assert.equal(h.timers.size, 0);
    h.screen.handleInput("6");
    assert.equal(h.timers.size, 0);
  } finally { h.screen.dispose(); }
});

test("resize preserves the draft and does not accept invisible typing", () => {
  const h = setup();
  try {
    h.screen.render(116);
    h.screen.handleInput("e");
    h.screen.handleInput("!");
    const draft = h.screen.draft;
    h.tui.terminal.rows = 10;
    assert.ok(!h.screen.render(25).some(line => line.includes(CURSOR_MARKER)));
    h.screen.handleInput("hidden");
    assert.equal(h.screen.draft, draft);
    h.screen.handleInput("\u001b");
    h.screen.handleInput("e");
    assert.equal(h.screen.isEditing, false);
    h.tui.terminal.rows = 30;
    h.screen.render(116);
    h.screen.handleInput("e");
    assert.equal(h.screen.isEditing, true);
    assert.equal(h.screen.draft, draft);
    h.screen.handleInput("\u0003");
    assert.equal(h.closed, 1);
  } finally { h.screen.dispose(); }
});
