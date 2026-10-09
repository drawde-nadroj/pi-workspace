import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { source, jiti, initTheme, theme, kb, visibleWidth, plain, colorToRgb, colorToOklch } from "./host.mjs";
const { DesignLab } = await jiti.import(join(source, "lab/screen.ts"));
const { Canvas, DIRECTIONS, MOODS, PHASE_STARTS, demoFrame, makePalette } = await jiti.import(join(source, "lab/design.ts"));
const factory = await jiti.import(join(source, "index.ts"), { default: true });
const { fireflyFrame, drawFireflies } = await jiti.import(join(source, "lab/fireflies.ts"));
const { drawGlasshouse } = await jiti.import(join(source, "lab/garden.ts"));

function setup(direction = "prism", rows = 40, mood = "biolume") {
  let time = 0, renders = 0, result, closed = 0;
  const tui = { terminal: { rows, columns: 110 }, requestRender() { renders++; } };
  const lab = new DesignLab(tui, () => theme, () => ({ session: "Reworking pi 界面 🌱", project: "~/work/pi-home", model: "demo-model" }), kb,
    (value) => { result = value; closed++; }, direction, () => time, mood);
  return { lab, tui, setTime: (value) => time = value, get renders() { return renders; }, get result() { return result; }, get closed() { return closed; } };
}

test("all four designs and garden moods fit widths, heights, Unicode identity, every phase, and light/dark", () => {
  const profiles = DIRECTIONS.flatMap((d) => d === "glasshouse" ? MOODS.map((m) => [d, m]) : [[d, "biolume"]]);
  for (const appearance of ["dark", "light"]) {
    initTheme(appearance, false);
    for (const [direction, mood] of profiles) {
      const h = setup(direction, 40, mood);
      try {
        for (const rows of [1, 8, 18, 24, 30, 40, 60]) {
          h.tui.terminal.rows = rows;
          for (const width of [0, 1, 2, 12, 27, 28, 32, 44, 75, 76, 100, 124]) {
            for (const time of [0, 1250, 4500, 8250, 11250, 14500, 17000, 25000]) {
              h.setTime(time);
              const lines = h.lab.render(width);
              assert.ok(lines.length <= Math.max(1, rows - 2));
              for (const line of lines) assert.equal(visibleWidth(line), width, `${appearance}/${direction}/${width}x${rows}: ${JSON.stringify(line)}`);
              if (width >= 76 && rows >= 24) assert.match(lines.map(plain).join("\n"), /Reworking pi 界面 🌱/);
            }
          }
        }
      } finally { h.lab.dispose(); }
    }
  }
  initTheme("dark", false);
});

test("designs have genuinely different compositions and decorations change over time", () => {
  const views = [];
  for (const direction of DIRECTIONS) {
    const h = setup(direction);
    try {
      h.setTime(1000);
      const first = h.lab.render(110);
      h.setTime(2000);
      const next = h.lab.render(110);
      assert.notDeepEqual(first, next);
      views.push(first.map(plain).join("\n"));
      assert.match(views.at(-1), /Simulated activity/);
      assert.match(views.at(-1), /sample plugin|sample/i);
    } finally { h.lab.dispose(); }
  }
  assert.match(views[0], /P R I S M/);
  assert.match(views[1], /the night desk/);
  assert.match(views[2], /DREAM UP/);
  assert.match(views[3], /Glasshouse \/ Bioluminescent/);
  assert.equal(new Set(views).size, DIRECTIONS.length);
});

test("replay, stepping, freeze, motion, error, navigation, and shortlist have explicit semantics", () => {
  const h = setup();
  try {
    h.setTime(1000);
    h.lab.handleInput(" ");
    const frozen = h.lab.render(110);
    h.setTime(2000);
    assert.deepEqual(h.lab.render(110), frozen);
    h.lab.handleInput("s");
    assert.match(h.lab.render(110).map(plain).join("\n"), /Reading · editing/);
    h.lab.handleInput("\x1b[51u"); // Kitty-encoded digit, not just legacy ASCII input.
    assert.equal(h.lab.selected, "arcade");
    h.lab.handleInput("\x1b[D");
    assert.equal(h.lab.selected, "terrarium");
    h.lab.handleInput("m");
    h.lab.handleInput("e");
    assert.match(h.lab.render(110).map(plain).join("\n"), /A check failed/);
    h.lab.handleInput("r");
    assert.match(h.lab.render(110).map(plain).join("\n"), /Finding the shape/);
    h.lab.handleInput("\r");
    assert.deepEqual(h.result, { direction: "terrarium" });
    h.lab.handleInput("\r");
    assert.equal(h.closed, 1);
  } finally { h.lab.dispose(); }
});

test("garden lighting cycles independently of the paused timeline and survives direction changes", () => {
  const h = setup("glasshouse");
  try {
    h.setTime(5200);
    h.lab.handleInput(" ");
    const frames = [];
    for (const mood of MOODS) {
      assert.equal(h.lab.selectedMood, mood);
      frames.push(h.lab.render(110));
      assert.match(frames.at(-1).map(plain).join("\n"), /working 5\.2s/);
      h.setTime(9500);
      h.lab.handleInput("g");
    }
    assert.equal(new Set(frames.map((lines) => lines.join("\n"))).size, 3);
    h.lab.handleInput("G");
    assert.equal(h.lab.selectedMood, "kaleido");
    h.lab.handleInput("1");
    h.lab.handleInput("\x1b[D");
    assert.equal(h.lab.selected, "glasshouse");
    assert.equal(h.lab.selectedMood, "kaleido");
    h.lab.handleInput("\x1b[C");
    assert.equal(h.lab.selected, "prism");
    h.lab.handleInput("\x1b[52u");
    assert.equal(h.lab.selected, "glasshouse");
    h.lab.handleInput("\r");
    assert.deepEqual(h.result, { direction: "glasshouse", mood: "kaleido" });
  } finally { h.lab.dispose(); }
});

test("garden motion-off freezes the art but not the clock, and narrow tabs remain clickable", () => {
  const h = setup("glasshouse", 40, "sunlit");
  try {
    const appearance = theme.appearance;
    h.setTime(5200);
    h.lab.handleInput("m");
    const first = h.lab.render(110);
    h.setTime(5700);
    const second = h.lab.render(110);
    assert.deepEqual(first.slice(7, 18), second.slice(7, 18));
    assert.notDeepEqual(first, second);
    assert.match(second.map(plain).join("\n"), /working 5\.7s/);
    assert.equal(theme.appearance, appearance);
    h.lab.handleInput("1");
    const narrow = h.lab.render(28).map(plain);
    assert.match(narrow[2], /4G/);
    const x = narrow[2].indexOf("4G");
    h.lab.handleMouse({ type: "click", button: "left", x, y: 2 });
    assert.equal(h.lab.selected, "glasshouse");
  } finally { h.lab.dispose(); }
});

test("canvas handles overwriting wide cells, clipping, and ANSI/control-bearing data", () => {
  const c = new Canvas(12, 4, theme, makePalette("prism"));
  c.text(0, 0, "界面hello");
  c.text(1, 0, "a");
  c.text(3, 0, "b");
  c.text(11, 0, "界");
  c.text(-1, 1, "abc");
  c.text(0, 2, "hello\x1b[31m\nname");
  c.text(4, 3, "界面");
  c.fill(5, 3, 1, 1, "panel");
  for (const line of c.render()) assert.equal(visibleWidth(line), 12);
  assert.match(c.render().map(plain).join(""), /hello name/);
});

test("evergreen pastels keep text contrast and use pi's cached perceptual gradients", () => {
  const p = makePalette("glasshouse", false, "biolume");
  const luminance = (color) => {
    const { r, g, b } = colorToRgb(color);
    const [a, c, d] = [r, g, b].map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return a * 0.2126 + c * 0.7152 + d * 0.0722;
  };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  for (const fg of ["text", "muted", "accent", "secondary", "success", "warning", "error"]) {
    for (const bg of ["base", "panel", "input"]) {
      assert.ok(contrast(luminance(p[fg]), luminance(p[bg])) >= 4.5, `${fg}/${bg}`);
    }
  }
  assert.ok(contrast(luminance(p.faint), luminance(p.panel)) >= 4.5);
  const pine = colorToRgb(p.base);
  assert.ok(pine.g > pine.r && pine.g > pine.b);
  for (let i = 0; i < 48; i++) {
    const color = colorToOklch(p[`aura${i}`]);
    assert.ok(color.l > 0.7 && color.c < 0.1, `pastel ${i}`);
    assert.ok(p[`echo${i}`]);
  }
});

test("half-block sprites preserve both transparent forest halves and clip safely", () => {
  const p = makePalette("glasshouse");
  const c = new Canvas(3, 1, theme, p), expected = new Canvas(3, 1, theme, p);
  c.text(0, 0, "▀", "leaf1", "leaf2");
  c.halfBlocks(0, 0, undefined, "fur");
  expected.text(0, 0, "▀", "leaf1", "fur");
  c.text(1, 0, "▄", "leaf3", "leaf4");
  c.halfBlocks(1, 0, "furShade");
  expected.text(1, 0, "▀", "furShade", "leaf3");
  c.halfBlocks(2, 0);
  c.halfBlocks(-1, 0, "fur");
  c.halfBlocks(3, 0, "fur");
  c.halfBlocks(0, 1, "fur");
  assert.deepEqual(c.render(), expected.render());
  c.text(0, 0, "界");
  c.halfBlocks(1, 0, "fur");
  assert.equal(visibleWidth(c.render()[0]), 3);
});

test("evergreen forest art is deterministic, differs from the garden, and obeys reduced motion", () => {
  const forest = setup("glasshouse", 40, "biolume"), garden = setup("glasshouse", 40, "sunlit");
  try {
    forest.setTime(5200); garden.setTime(5200);
    const first = forest.lab.render(110).slice(7, 18);
    assert.deepEqual(first, forest.lab.render(110).slice(7, 18));
    assert.notDeepEqual(first.map(plain), garden.lab.render(110).slice(7, 18).map(plain));
    forest.lab.handleInput("m");
    const frozenArt = forest.lab.render(110).slice(7, 18);
    forest.setTime(5700);
    assert.deepEqual(frozenArt, forest.lab.render(110).slice(7, 18));
    assert.match(forest.lab.render(110).map(plain).join("\n"), /working 5\.7s/);
  } finally { forest.lab.dispose(); garden.lab.dispose(); }
});

test("fireflies wander continuously, pulse independently, and stay bounded without mutable state", () => {
  for (const width of [0, 1, 12, 40, 140]) for (const height of [0, 1, 8, 20]) {
    for (const time of [0, 5200, 5699, 5701, 14500, 25999, 26001, 5e9]) {
      const flies = fireflyFrame(width, height, time);
      assert.deepEqual(flies, fireflyFrame(width, height, time));
      assert.ok(flies.length <= 9);
      if (!width || !height) assert.equal(flies.length, 0);
      const next = fireflyFrame(width, height, time + 50);
      for (const [i, fly] of flies.entries()) {
        assert.ok(fly.x >= 0 && fly.x <= width - 1 && fly.y >= 0 && fly.y <= height - 1);
        assert.ok(fly.light >= 0 && fly.light <= 15 && fly.color >= 0 && fly.color < 6);
        assert.ok(Math.abs(fly.x - next[i].x) <= width * 0.008 + 0.01);
        assert.ok(Math.abs(fly.y - next[i].y) <= height * 0.02 + 0.01);
        assert.ok(Math.abs(fly.light - next[i].light) <= 1);
      }
    }
  }
  const start = fireflyFrame(40, 8, 0), later = fireflyFrame(40, 8, 5200);
  assert.ok(new Set(later.map((fly) => fly.light)).size > 3);
  assert.notDeepEqual(start.map(({ x, y }) => [x, y]), later.map(({ x, y }) => [x, y]));
  const p = makePalette("glasshouse");
  for (const fly of later) assert.ok(p[`firefly${fly.color}_${fly.light}`]);
});

test("fireflies respect occlusion and replace only Biolume's orbit, including the completion burst", () => {
  const p = makePalette("glasshouse");
  const empty = new Canvas(45, 10, theme, p), blocked = new Canvas(45, 10, theme, p);
  drawFireflies(blocked, { x: 1, y: 1, width: 40, height: 8 }, 5200, () => true);
  assert.deepEqual(blocked.render(), empty.render());
  for (const mood of MOODS) {
    for (const time of [0, 5200, 9000, 14500, 17000]) {
      const c = new Canvas(110, 11, theme, makePalette("glasshouse", false, mood));
      const calls = [], text = c.text.bind(c);
      c.text = (...args) => { calls.push(args); text(...args); };
      drawGlasshouse(c, { x: 0, y: 0, width: 110, height: 11 }, demoFrame(time, time), mood);
      if (mood === "biolume") {
        assert.equal(calls.filter(([, , value]) => value === "◆" || value === "✧").length, 0);
        const motes = calls.filter(([, , , color]) => color?.startsWith("firefly"));
        assert.ok(motes.length <= 9);
        for (const [, , value] of motes) assert.match(value, /^[·•]$/);
        const core = calls.find(([, , value]) => ["‹π›", " ? ", " ✿ "].includes(value));
        assert.deepEqual(core.slice(0, 2), [69, 5]);
      } else assert.ok(calls.some(([, , value]) => value === "◆"));
      for (const line of c.render()) assert.equal(visibleWidth(line), 110);
    }
  }
});

test("sample clocks and state sequence are deterministic", () => {
  assert.deepEqual(PHASE_STARTS.map((t) => demoFrame(t, t).phase), ["thinking", "tools", "waiting", "responding", "complete", "idle"]);
  assert.equal(demoFrame(17000, 0).timing, "took 14.0s · idle 3s");
  assert.equal(demoFrame(4000, 0).done, 2);
  assert.equal(demoFrame(14500, 0).done, 5);
  assert.equal(demoFrame(26000, 0).phase, "thinking");
});

test("disposing or closing the lab stops animation resources", async () => {
  const h = setup();
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.ok(h.renders > 0);
  h.lab.handleInput("\x1b");
  assert.equal(h.closed, 1);
  assert.equal(h.result, undefined);
  const renders = h.renders;
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.equal(h.renders, renders);
  h.lab.dispose();
});

test("/home lab shortlists without modifying settings, session entries, tools, or active appearance", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-home-lab-test-"));
  const before = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  try {
    const commands = new Map();
    let message, overlays = 0;
    await factory({ events: { on() {}, emit() {} }, on() {}, registerEntryRenderer() {}, registerCommand(name, command) { commands.set(name, command); } });
    const ctx = {
      mode: "tui", cwd: directory, model: { id: "test-model" }, sessionManager: { getSessionName: () => "Test session" },
      ui: {
        theme, notify: (value) => message = value,
        async custom(create, options) {
          assert.equal(options.overlay, true);
          overlays++;
          return await new Promise((resolve) => {
            const view = create({ terminal: { rows: 40, columns: 110 }, requestRender() {} }, theme, kb, resolve);
            assert.match(view.render(100).map(plain).join("\n"), /Test session/);
            view.handleInput("\r");
          });
        },
      },
    };
    await commands.get("home").handler("lab terrarium", ctx);
    assert.match(message, /Terrarium shortlisted/);
    assert.equal(overlays, 1);
    await commands.get("home").handler("lab glasshouse sunlit", ctx);
    assert.match(message, /Glasshouse \/ Sunlit shortlisted/);
    await commands.get("home").handler("lab", ctx);
    assert.match(message, /Glasshouse \/ Sunlit shortlisted/);
    assert.equal(overlays, 3);
    for (const invalid of ["lab glasshouse typo", "lab prism sunlit", "lab glasshouse sunlit extra"]) {
      await commands.get("home").handler(invalid, ctx);
      assert.match(message, /Usage:/);
    }
    assert.equal(overlays, 3);
    assert.equal(commands.get("home").getArgumentCompletions("lab glasshouse ").length, 3);
    assert.equal(existsSync(join(directory, "pi-home.json")), false);
    // Intentionally supply no mutating APIs: accidental side effects would throw.
  } finally {
    if (before === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = before;
    rmSync(directory, { recursive: true, force: true });
  }
});
