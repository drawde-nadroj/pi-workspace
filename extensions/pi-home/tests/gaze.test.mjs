import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { jiti, root, source, theme, kb, visibleWidth, CURSOR_MARKER } from './host.mjs';
const { GazeTracker, PointerReports, observePointer } = await jiti.import(source + '/gaze.ts');
const { drawCat } = await jiti.import(source + '/lab/sprites.ts');
const { HomeEditor } = await jiti.import(source + '/ui.ts');
const { DEFAULTS, RunClock, preferencesFrom } = await jiti.import(source + '/state.ts');
const { getEditorTheme } = await import(pathToFileURL(root + '/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js'));

function setup() {
  let now = 1000;
  const gaze = new GazeTracker(() => {}, () => now);
  gaze.setScene({ width: 80, terminalRows: 40, rows: 12, eye: { x: 25, y: 3.25 } });
  gaze.setCaret({ x: 70, y: 2 }, 5); gaze.setFooterRows(2);
  const settle = (mode = 'both') => { gaze.advance(mode, true); for (let i = 0; i < 13; i++) { now += 32; gaze.advance(mode, true); } return gaze.eyes; };
  return { gaze, settle, advance: (ms) => now += ms, now: () => now };
}

test('latest mouse/typing input wins, gaze moves on the first frame and eases back after inactivity', () => {
  const { gaze, settle, advance } = setup();
  gaze.pointer(3, 1);
  assert.equal(gaze.advance('both', true).soon, true); assert.deepEqual(gaze.eyes, { x: 0, y: 0 });
  advance(16); gaze.advance('both', true);
  assert.ok(gaze.eyes.x < 0 && gaze.eyes.x > -1, 'fractional movement without the former dwell');
  assert.deepEqual(settle(), { x: -1, y: -1 });
  gaze.typed(); assert.deepEqual(settle(), { x: 1, y: 1 });
  gaze.pointer(50, 1); assert.deepEqual(settle(), { x: 1, y: -1 });
  advance(4501); assert.equal(gaze.advance('both', true).soon, true);
  assert.deepEqual(gaze.eyes, { x: 1, y: -1 }, 'return starts at current pose, without snapping');
  assert.equal(settle(), undefined);
});

test('explicit modes, focus loss, scene hiding and reduced motion prevent tracking', () => {
  const { gaze, settle } = setup();
  gaze.typed(); gaze.pointer(3, 1);
  assert.deepEqual(settle('typing'), { x: 1, y: 1 });
  assert.deepEqual(settle('mouse'), { x: -1, y: -1 });
  gaze.advance('off', true); assert.equal(gaze.eyes, undefined);
  settle(); gaze.advance('both', false); assert.equal(gaze.eyes, undefined);
  gaze.focus(false); gaze.pointer(30, 5); settle(); assert.equal(gaze.eyes, undefined);
  gaze.focus(true); gaze.setScene(undefined); settle(); assert.equal(gaze.eyes, undefined);
  assert.equal(preferencesFrom({ gaze: 'invalid' }).gaze, 'both');
  assert.equal(preferencesFrom({ gaze: 'off' }).gaze, 'off');
});

test('pixel hysteresis prevents boundary flutter; normalized calibration includes extra widgets', () => {
  const { gaze, settle } = setup();
  gaze.pointer(30, 24); assert.equal(settle().x, 1);
  gaze.pointer(28, 24); assert.equal(settle().x, 1, 'retain direction inside hysteresis band');
  gaze.pointer(26, 24); assert.equal(settle().x, 0);
  // Estimated origin is 21. Another widget placed below Home has moved it up 5 rows.
  gaze.calibrate(10, 16, 10, 0);
  gaze.pointer(25, 21); assert.equal(settle().y, 1, 'actual normalized location wins over estimate');
  gaze.setScene({ width: 100, terminalRows: 44, rows: 12, eye: { x: 35, y: 3.25 } });
  gaze.pointer(35, 28); assert.deepEqual(settle(), { x: 0, y: 0 }, 'resize discards stale calibration');
});

test('smoothing is frame-rate independent, monotonic toward a fixed goal, and settles without a perpetual animation loop', () => {
  const finals = [];
  for (const frame of [8, 16, 32, 64]) {
    const { gaze, advance } = setup(); gaze.pointer(3, 1); gaze.advance('both', true);
    let last = 0;
    for (let time = 0; time < 192; time += frame) {
      advance(frame); gaze.advance('both', true);
      assert.ok(gaze.eyes.x < last && gaze.eyes.x >= -1); last = gaze.eyes.x;
    }
    finals.push(gaze.eyes.x);
    advance(400); assert.equal(gaze.advance('both', true).soon, false);
    assert.deepEqual(gaze.eyes, { x: -1, y: -1 });
    assert.deepEqual(gaze.advance('both', true), { changed: false, soon: false });
  }
  for (const value of finals) assert.ok(Math.abs(value - finals[0]) < 1e-10);
});

test('retargeting preserves continuity and frequent input cannot postpone motion; release eases to the real idle expression', () => {
  const { gaze, advance, settle } = setup();
  gaze.pointer(3, 1); gaze.advance('both', true);
  for (let i = 0; i < 10; i++) {
    advance(16); gaze.pointer(2 + i % 2, 1); gaze.advance('both', true);
  }
  assert.ok(gaze.eyes.x < -0.9, 'repeated events do not restart a dwell/easing tween');
  const previous = { ...gaze.eyes };
  gaze.typed(); gaze.advance('both', true);
  assert.deepEqual(gaze.eyes, previous, 'mouse/caret handoff does not teleport the eyes');
  for (let i = 0; i < 30; i++) {
    advance(16); gaze.advance('both', true);
    assert.ok(Math.abs(gaze.eyes.x) <= 1 && Math.abs(gaze.eyes.y) <= 1);
  }
  assert.deepEqual(gaze.eyes, { x: 1, y: 1 });
  gaze.typed(false); gaze.advance('both', true);
  assert.deepEqual(gaze.eyes, { x: 1, y: 1 });
  assert.equal(settle(), undefined);
  // Busy expression is naturally looking right; returning to it must not end with a one-pixel jump.
  gaze.pointer(3, 1); settle(); advance(4501);
  gaze.advance('both', true, undefined, { x: 1, y: 0 });
  advance(120); gaze.advance('both', true, undefined, { x: 1, y: 0 });
  assert.ok(gaze.eyes.x > 0 && gaze.eyes.x < 1 && gaze.eyes.y < 0);
  advance(400); gaze.advance('both', true, undefined, { x: 1, y: 0 }); assert.equal(gaze.eyes, undefined);
});

test('pointer observer handles fragmented/coalesced reports but ignores keys, paste, drags, wheels and protocol strings', () => {
  const points = [], focus = [];
  const reports = new PointerReports((x, y) => points.push([x, y]), (f) => focus.push(f));
  for (const chunk of ['hello\x1b', '[<35;12;', '7M\x1b[<35;20;9M']) reports.feed(chunk);
  assert.deepEqual(points, [[11, 6], [19, 8]]);
  for (const code of [0, 32, 64, 65, 163]) reports.feed(`\x1b[<${code};30;20M`);
  reports.feed('\x1b[<35;30;20m');
  reports.feed('\x1b[200~\x1b[<35;1;1M\x1b]unterminated pasted string\x1b[201~');
  reports.feed('\x1b]clipboard \x1b[<35;1;1M\x07');
  reports.feed('\x1bPresponse \x1b[<35;1;1M\x1b\\');
  reports.feed('\x1b[O\x1b[I');
  reports.feed('\x1b[<' + '9'.repeat(10000));
  assert.deepEqual(focus, [false, true]);
  assert.equal(points.length, 2);
  assert.ok(reports.sequence.length <= 64);
  reports.feed('\x1b[<35;40;20M'); assert.deepEqual(points.at(-1), [39, 19]);
});

test('passive input observation never consumes native input and cleanup is idempotent', () => {
  const input = new EventEmitter();
  let nativeCalls = 0, moves = 0;
  const native = () => nativeCalls++;
  input.on('data', native);
  const off = observePointer(() => moves++, () => {}, input);
  input.emit('data', '\x1b[<35;12;7M'); assert.equal(nativeCalls, 1); assert.equal(moves, 1);
  off(); off(); assert.deepEqual(input.listeners('data'), [native]);
  input.emit('data', '\x1b[<35;15;8M'); assert.equal(nativeCalls, 2); assert.equal(moves, 1);
});

function pixels(offset, blink = false) {
  const image = Array.from({ length: 12 }, () => Array(15));
  drawCat({ halfBlocks(x, y, top, bottom) { image[y * 2][x] = top; image[y * 2 + 1][x] = bottom; } }, 0, 0, 6, 15, blink, false, false, offset);
  return image;
}
test('all nine gazes modify only the original two eye pixels and their destinations, never the face, mouth or silhouette', () => {
  const original = pixels();
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
    const changed = pixels({ x, y });
    const allowed = new Set(['4,4', '10,4', `${4 + x},${4 + y}`, `${10 + x},${4 + y}`]);
    for (let row = 0; row < 12; row++) for (let col = 0; col < 15; col++) {
      if (!allowed.has(`${col},${row}`)) assert.equal(changed[row][col], original[row][col], `unexpected change at ${col},${row}`);
    }
    assert.equal(changed[4 + y][4 + x], 'ink'); assert.equal(changed[4 + y][10 + x], 'ink');
  }
  assert.deepEqual(pixels({ x: 0, y: 0 }), original);
});

test('fractional eye coverage preserves mass, blink colors and all non-eye pixels; settled poses stay crisp', async () => {
  const { makePalette, Canvas } = await jiti.import(source + '/lab/design.ts');
  const palette = makePalette('glasshouse', false, 'biolume');
  const mass = (token) => token === 'ink' ? 1 : /^eye\d+$/.test(token ?? '') ? Number(token.slice(3)) / 64 : 0;
  const original = pixels();
  for (const x of [-1, -.85, -.5, -.125, 0, .125, .5, .85, 1]) for (const y of [-1, -.75, -.25, 0, .25, .75, 1]) {
    const image = pixels({ x, y }), lids = pixels({ x, y }, true);
    for (const center of [4, 10]) {
      let sum = 0, mx = 0, my = 0;
      for (let row = 3; row <= 5; row++) for (let col = center - 1; col <= center + 1; col++) {
        const m = mass(image[row][col]); sum += m; mx += col * m; my += row * m;
        assert.ok(palette[image[row][col]], 'every coverage token has a cached color');
        if (image[row][col].startsWith('eye')) assert.equal(lids[row][col], 'lid' + image[row][col].slice(3));
      }
      assert.ok(Math.abs(sum - 1) <= 2 / 64);
      assert.ok(Math.abs(mx / sum - center - x) < .04); assert.ok(Math.abs(my / sum - 4 - y) < .04);
    }
    for (let row = 0; row < 12; row++) for (let col = 0; col < 15; col++) {
      if (!(row >= 3 && row <= 5 && (col >= 3 && col <= 5 || col >= 9 && col <= 11))) {
        assert.equal(image[row][col], original[row][col]);
      }
    }
    for (const width of [1, 8, 15]) {
      const c = new Canvas(width, 6, theme, palette);
      drawCat(c, 0, 0, 6, 15, false, false, false, { x, y });
      for (const line of c.render()) assert.equal(visibleWidth(line), width);
    }
  }
  assert.deepEqual(pixels({ x: NaN, y: Infinity }), original);
});

test('caret tracking reads the actual rendered marker after Unicode wrapping and preserves native editing', () => {
  let reported, typed = 0;
  const gaze = { typed() { typed++; }, setCaret(p, rows) { reported = { p, rows }; } };
  const state = { prefs: { ...DEFAULTS }, gaze, clock: new RunClock(), phase: 'working', tools: new Map(), promptDepth: 0, compacting: false, lastInputAt: 0 };
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const ctx = { ui: { theme }, model: { id: 'test' }, getContextUsage: () => ({ percent: 5 }) };
  const editor = new HomeEditor(tui, getEditorTheme(), kb, () => ctx, state, () => 'high'); editor.focused = true;
  editor.handleInput('\x1b[200~界面 🐈 e\u0301 '.repeat(1) + 'words '.repeat(30) + '\nsecond line\x1b[201~');
  assert.equal(typed, 1);
  for (const width of [48, 64, 110]) {
    const lines = editor.render(width);
    const y = lines.findIndex((s) => s.includes(CURSOR_MARKER));
    assert.deepEqual(reported, { p: { x: visibleWidth(lines[y].split(CURSOR_MARKER)[0]), y }, rows: lines.length });
    assert.equal(lines.join('').split(CURSOR_MARKER).length - 1, 1);
  }
  const text = editor.getText(); editor.handleInput('\x1b[D'); editor.render(64);
  assert.equal(editor.getText(), text); assert.equal(typed, 2);
});
