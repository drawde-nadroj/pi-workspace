import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = process.env.PI_FRAME_HOST_MODULES || process.env.PI_WORKSPACE_HOST_MODULES || process.env.PI_HOME_HOST_MODULES || process.env.PI_ASK_HOST_MODULES || (() => {
  const install = join(homedir(), ".pi/agent/install");
  try { return join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules"); }
  catch { throw new Error("Pi test host unavailable. Set PI_FRAME_HOST_MODULES (or PI_WORKSPACE_HOST_MODULES / PI_ASK_HOST_MODULES) to a compatible host node_modules directory."); }
})();
const { createJiti } = await import(pathToFileURL(join(root, 'jiti/lib/jiti.mjs')));
const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-tui': join(root, '@earendil-works/pi-tui/dist/index.js') } });
const { createFrameController, framePresentationDefaults, readFramePresentation, presentationRows, FRAME_POSITIONS } = await jiti.import(fileURLToPath(new URL('../index.js', import.meta.url)));
const { visibleWidth, parseColor, colorToRgb } = await import(pathToFileURL(join(root, '@earendil-works/pi-tui/dist/index.js')));
const plain = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const theme = appearance => ({ appearance, colors: { accent: parseColor('#a78bfa'), text: parseColor('#ccddee'), muted: parseColor('#8899aa'), error: parseColor('#dd2233'), warning: parseColor('#ddaa22'), success: parseColor('#22aa55') },
  style(text, { fg, bold }) { const { r, g, b } = colorToRgb(fg); return `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m${text}\x1b[0m`; } });
function fakeClock() {
  let time = 0, id = 0, requests = 0;
  const timers = new Map();
  const c = createFrameController({ automatic: true, now: () => time, requestRender: () => requests++,
    schedule(fn, ms) { const key = ++id; timers.set(key, { fn, due: time + ms }); return key; }, cancel: key => timers.delete(key) });
  return { c, timers, get requests() { return requests; }, advance(ms) {
    const end = time + ms;
    for (let safety = 0; safety < 10000; safety++) {
      const next = [...timers].sort((a,b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > end) break;
      time = next[1].due; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  } };
}
test('defaults and validation are independent, bounded and ignore unrecognized keys', () => {
  const a = framePresentationDefaults(), b = framePresentationDefaults(); a.positions.title = 'bottomCenter';
  assert.equal(b.positions.title, 'topLeft');
  const p = readFramePresentation({ version: 1, periodMs: 0, intensity: 8, borderColor: 'shell command', states: { working: { motion: 'repeat', textColor: '#123456' }, stranger: { motion: 'repeat' } }, positions: { title: 'nowhere' } });
  assert.equal(p.periodMs, 1200); assert.equal(p.intensity, 1); assert.equal(p.borderColor, 'accent'); assert.equal(p.positions.title, 'topLeft');
  assert.deepEqual(p.states.working, { motion: 'repeat', textColor: '#123456' }); assert.equal(p.states.stranger, undefined);
  assert.deepEqual(readFramePresentation({ version: 99 }), b);
});
test('external clocks have no timers; state facts select rules and safety gates always win', () => {
  let schedules = 0;
  const c = createFrameController({ schedule() { schedules++; } });
  const p = framePresentationDefaults();
  assert.equal(c.update({ state: 'idle', revision: 'a' }, p, 0).active, false);
  assert.equal(c.update({ state: 'working', revision: 'a' }, p, 100).active, true);
  assert.equal(c.sample(600).elapsed, 500);
  assert.equal(c.update({ state: 'working', revision: 'a', suspended: true }, p, 700).active, false);
  assert.equal(c.update({ state: 'working', revision: 'b', suspended: true }, p, 800).active, false);
  assert.equal(c.update({ state: 'waiting', revision: 'b' }, p, 900).active, false);
  p.states.idle = { motion: 'repeat', textColor: '#abcdee' };
  assert.equal(c.update({ state: 'idle', revision: 'b' }, p, 1000).active, true);
  for (const gate of ['suspended', 'reducedMotion']) assert.equal(c.update({ state: 'idle', [gate]: true }, p, 1100).active, false);
  assert.equal(c.update({ state: 'idle', visible: false }, p, 1200).active, false);
  p.motion = 'off'; assert.equal(c.update({ state: 'idle' }, p, 1300).active, false);
  assert.equal(schedules, 0);
  c.dispose(); assert.equal(c.update({ state: 'working' }, framePresentationDefaults(), 1500).active, false);
});
test('one sweep is finite, never replays initial history, and managed timers stop on every exit', () => {
  const f = fakeClock(), p = framePresentationDefaults(); p.motion = 'changes'; p.periodMs = 1200;
  assert.equal(f.c.update({ state: 'idle', revision: 1 }, p).active, false); assert.equal(f.timers.size, 0);
  f.c.update({ state: 'idle', revision: 2 }, p); assert.equal(f.timers.size, 1);
  f.advance(600); assert.ok(f.requests > 0); assert.equal(f.timers.size, 1);
  f.advance(700); assert.equal(f.c.active, false); assert.equal(f.timers.size, 0);
  const count = f.requests; f.advance(10000); assert.equal(f.requests, count);
  f.c.update({ state: 'idle', revision: 3 }, p); f.c.update({ state: 'idle', revision: 3, suspended: true }, p); assert.equal(f.timers.size, 0);
  f.c.update({ state: 'idle', revision: 3 }, p); assert.equal(f.timers.size, 0, 'suppressed changes do not replay');
  f.c.update({ state: 'idle', revision: 4 }, p); f.c.reset(); assert.equal(f.timers.size, 0);
  f.c.update({ state: 'working' }, framePresentationDefaults()); assert.equal(f.timers.size, 1);
  f.c.dispose(); f.c.dispose(); assert.equal(f.timers.size, 0);
});
test('progress sweep returns to repeating work, but waiting settles immediately', () => {
  const f = fakeClock(), p = framePresentationDefaults(); p.periodMs = 1200;
  f.c.update({ state: 'working', revision: 1 }, p); f.advance(100);
  f.c.update({ state: 'working', revision: 2 }, p); f.advance(1300);
  assert.equal(f.c.active, true); assert.equal(f.timers.size, 1);
  f.c.update({ state: 'waiting', revision: 2 }, p); assert.equal(f.c.active, false); assert.equal(f.timers.size, 0);
});
test('border and opt-in text effects preserve cells/content in both themes and every rail position', () => {
  for (const appearance of ['light', 'dark']) for (const width of [4, 16, 24, 40, 90, 140]) for (const position of FRAME_POSITIONS) {
    const p = framePresentationDefaults(); p.positions.title = position; p.textEffect = 'both';
    const rows = [{ text: '▸ Work 界面 é', role: 'active' }, { text: '! approval', role: 'warning' }];
    const render = elapsed => presentationRows({ theme: theme(appearance), width, rows, title: 'Tasks 界', summary: '3/7 done', presentation: p, frame: { active: true, elapsed, state: 'working' } });
    const a = render(0), b = render(1000);
    assert.ok(a.every(row => visibleWidth(row) === width)); assert.deepEqual(a.map(plain), b.map(plain));
    if (width >= 24) assert.notDeepEqual(a, b);
    assert.deepEqual(rows, [{ text: '▸ Work 界面 é', role: 'active' }, { text: '! approval', role: 'warning' }]);
  }
});
test('effects, direction and intensity are configurable; inactive output is stable', () => {
  const p = framePresentationDefaults(), base = { theme: theme('dark'), width: 60, rows: [{ text: 'Actual content', role: 'active' }], title: 'Tasks', summary: '1/4 done', presentation: p };
  const render = (active, elapsed) => presentationRows({ ...base, frame: { state: 'working', active, elapsed } });
  assert.deepEqual(render(false, 10), render(false, 9999));
  const clockwise = render(true, 900); p.direction = 'counterclockwise'; assert.notDeepEqual(clockwise, render(true, 900));
  p.effect = 'pulse'; assert.notDeepEqual(clockwise, render(true, 900));
  p.intensity = 0; assert.deepEqual(render(true, 0), render(true, 1000));
});
