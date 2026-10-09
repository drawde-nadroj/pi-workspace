import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jiti, source, theme, initTheme, plain, visibleWidth } from './host.mjs';
import { workspace } from './workspace-harness.mjs';
const { TaskPanel, taskPanelDefaults, readTaskPanel, taskPanelRows, taskDemo } = await jiti.import(join(source, 'task-presentation.ts'));
const { DEFAULTS, RunClock } = await jiti.import(join(source, 'state.ts'));
const { footerPrefs, FOOTER_DEFAULTS } = await jiti.import(join(source, 'footer-state.ts'));
const { taskOverview } = await jiti.import(join(source, '../pi-tasks/state.ts'));
const { isSnapshot } = await jiti.import(join(source, '../../lib/home-dock.ts'));
const state = () => ({ prefs: { ...DEFAULTS, look: 'composer' }, clock: new RunClock(), phase: 'working', tools: new Map(), promptDepth: 0, compacting: false, lastInputAt: 0 });
const frame = (name, elapsed = 0) => ({ state: name, active: name === 'working', elapsed, progress: 0, once: false });

test('overview is derived without mutating authored task order or inferring active work', () => {
  const tasks = ['done', 'pending', 'blocked', 'active', 'cancelled'].map((status, i) => ({ id: `t${i+1}`, title: `Task ${i+1}`, status, reason: status === 'blocked' ? 'Approval' : '' }));
  const plan = { tasks, revision: 'r1' }, before = structuredClone(plan);
  const o = taskOverview(plan, true);
  assert.equal(o.total, 5); assert.equal(o.done, 1); assert.equal(o.blocked, 1); assert.equal(o.cancelled, 1);
  assert.equal(o.activeId, 't4'); assert.deepEqual(o.rows.map(r => r.tone), ['accent', 'warning', 'text']);
  assert.deepEqual(plan, before);
  assert.equal(taskOverview({ ...plan, tasks: tasks.filter(t => t.status !== 'active') }, false).activeId, undefined);
  const dock = { version: 1, id: 'pi-tasks', sessionId: 's', title: 'Plan', rows: o.rows, overview: o };
  assert.equal(isSnapshot(dock), true);
  assert.equal(isSnapshot({ ...dock, overview: { ...o, total: -1 } }), false);
  assert.equal(isSnapshot({ ...dock, overview: { ...o, done: 100 } }), false);
});
test('task panel preserves exact counts and bounded geometry, prioritizes open work, and stays still on pause', () => {
  const home = state(), panel = new TaskPanel(); home.clock.begin(2000);
  const dock = taskDemo('working'), before = structuredClone(dock);
  const render = time => panel.render(theme, 90, dock, home, time, true, 7);
  const a = render(3000), b = render(3500);
  assert.deepEqual(a.map(plain), b.map(plain)); assert.notDeepEqual(a, b);
  assert.match(a.map(plain).join('\n'), /3\/7 done/); assert.match(a.map(plain).join('\n'), /\+ 1 open/);
  home.promptDepth = 1; const paused = render(4000); assert.deepEqual(paused, render(4500)); assert.equal(panel.tick(home, 4600, true), false);
  home.promptDepth = 0; home.lastInputAt = 4700; render(4700); assert.equal(panel.tick(home, 4800, true), false);
  home.lastInputAt = 0; home.prefs.motion = 'off'; render(6000); assert.equal(panel.tick(home, 6500, true), false);
  home.prefs.motion = 'work'; home.footerPickerOpen = true; render(7000); assert.equal(panel.tick(home, 7500, true), false);
  home.footerPickerOpen = false; render(8000); panel.setVisible(false); assert.equal(panel.tick(home, 8500, true), false);
  assert.deepEqual(dock, before);
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    for (const width of [1, 12, 16, 24, 40, 90, 140]) for (const budget of [3, 4, 5, 7, 9]) for (const name of ['idle', 'working', 'waiting', 'blocked', 'error', 'done']) {
      const rows = taskPanelRows(theme, width, taskDemo(name), taskPanelDefaults(), frame(name, 1000), budget);
      assert.ok(rows.length <= budget, `${name} ${width} ${budget}: ${rows.length}`);
      assert.ok(rows.every(row => visibleWidth(row) <= width), `${name} ${width}`);
    }
  }
  initTheme('dark', false);
});
test('changes-only motion ignores mount/history, plan switches and narrow unframed layouts', () => {
  const home = state(), panel = new TaskPanel(); home.layout = { ...FOOTER_DEFAULTS, tasks: taskPanelDefaults() }; home.layout.tasks.presentation.motion = 'changes';
  const dock = taskDemo('idle'); dock.overview.planId = 'p1';
  panel.render(theme, 90, dock, home, 3000, true, 7); assert.equal(panel.tick(home, 3100, true), false);
  const next = structuredClone(dock); next.overview.revision = 'next';
  panel.render(theme, 90, next, home, 3200, true, 7); assert.equal(panel.tick(home, 3300, true), true);
  panel.tick(home, 8000, true); assert.equal(panel.tick(home, 9000, true), false);
  next.overview.planId = 'p2'; next.overview.revision = 'new-plan';
  panel.render(theme, 90, next, home, 10000, true, 7); assert.equal(panel.tick(home, 10100, true), false);
  next.overview.revision = 'changed'; panel.render(theme, 12, next, home, 11000, true, 7); assert.equal(panel.tick(home, 11100, true), false);
});
test('settings validation preserves old fields and bounds new data', () => {
  const p = footerPrefs({ ...FOOTER_DEFAULTS, tasks: { version: 1, title: '\x1b[31mTasks\n', rows: 999, presentation: { version: 1, intensity: -1, periodMs: Infinity } } });
  assert.equal(p.tasks.title, 'Tasks '); assert.equal(p.tasks.rows, 5); assert.equal(p.tasks.presentation.intensity, 0);
  assert.equal(p.tasks.presentation.periodMs, 4000); assert.equal(p.selectionShimmer, FOOTER_DEFAULTS.selectionShimmer);
  assert.equal(readTaskPanel({ version: 2 }).title, 'Tasks');
});
test('Tasks settings preview supports keyboard, colors, undo, save and untouched native draft', async () => {
  const h = workspace();
  h.click('[Tasks]');
  assert.match(h.rows().join('\n'), /Demo Tasks · working · display only/);
  assert.match(h.rows().join('\n'), /3\/7 done/);
  h.click('Motion'); h.pick('changes'); assert.equal(h.latest.tasks.presentation.motion, 'changes');
  h.click('[Undo]'); assert.equal(h.latest.tasks.presentation.motion, 'work');
  h.click('Border effect'); h.pick('pulse'); assert.equal(h.latest.tasks.presentation.effect, 'pulse');
  h.pick('Border color'); h.pick('custom'); h.text('#aabbcc'); assert.equal(h.latest.tasks.presentation.borderColor, '#aabbcc');
  h.pick('Visible tasks'); h.pick('5'); assert.equal(h.latest.tasks.rows, 5);
  h.pick('Panel title'); h.text('Work 界面'); assert.equal(h.latest.tasks.title, 'Work 界面');
  for (const width of [24, 40, 90, 140]) { h.tui.terminal.columns = width; assert.ok(h.panel.render(width).every(row => visibleWidth(row) <= width)); }
  h.panel.handleInput('\x13'); const saved = await h.pending;
  assert.equal(saved.tasks.title, 'Work 界面'); assert.equal(saved.tasks.presentation.effect, 'pulse');
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');
  assert.equal(footerPrefs(saved).tasks.presentation.borderColor, '#aabbcc');
});
test('demo state is not persisted; discard, focus loss, abort and disposal are safe', async () => {
  const abort = new AbortController(), h = workspace(undefined, 120, 40, abort.signal);
  h.panel.handleInput('\t'); h.panel.handleInput('\t'); h.panel.handleInput('\t');
  assert.match(h.rows().join('\n'), /Demo Tasks/);
  h.click('Demo state'); h.pick('blocked'); assert.match(h.rows().join('\n'), /1 blocked/);
  assert.equal(h.home.clock.active, false); assert.equal(h.home.tools.size, 0);
  h.panel.focused = false; h.panel.render(120); h.panel.focused = true; h.panel.invalidate(); h.panel.render(120);
  abort.abort(); assert.equal(await h.pending, undefined); h.panel.dispose();
  const h2 = workspace(); h2.click('[Tasks]'); h2.click('Border effect'); h2.pick('pulse');
  assert.equal(await h2.discard(), undefined); assert.equal(h2.editor.getText(), 'Unsent native draft 界面');
});
test('representative task panel captures show real hierarchy at narrow/wide widths and both themes', () => {
  const captures = [];
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    for (const width of [24, 40, 90, 140]) for (const name of ['working', 'waiting', 'blocked', 'done']) {
      captures.push(`${appearance} · ${width} columns · ${name}`, ...taskPanelRows(theme, width, taskDemo(name), taskPanelDefaults(), frame(name, 1000), 7), '');
    }
  }
  writeFileSync('/tmp/pi-task-presentation-captures.ansi', captures.join('\n'));
  writeFileSync('/tmp/pi-task-presentation-captures.txt', captures.map(plain).join('\n'));
  initTheme('dark', false);
});
