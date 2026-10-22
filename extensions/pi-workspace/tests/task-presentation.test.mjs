import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeCapture } from './captures.mjs';
import { join } from 'node:path';
import { jiti, source, theme, initTheme, plain, visibleWidth } from './host.mjs';
import { workspace } from './workspace-harness.mjs';
const { TaskPanel, taskPanelDefaults, readTaskPanel, taskPanelRows, taskPanelPreview, taskDemo } = await jiti.import(join(source, 'task-presentation.ts'));
const { TASK_ELEMENTS, taskControlElement } = await jiti.import(join(source, 'task-settings.ts'));
const { DEFAULTS, RunClock } = await jiti.import(join(source, 'state.ts'));
const { footerPrefs, FOOTER_DEFAULTS } = await jiti.import(join(source, 'footer-state.ts'));
const { taskOverview } = await jiti.import(join(source, '../pi-tasks/state.ts'));
const { isSnapshot } = await jiti.import(join(source, '../../lib/workspace-dock.ts'));
const state = () => ({ prefs: { ...DEFAULTS, look: 'composer' }, clock: new RunClock(), phase: 'working', tools: new Map(), promptDepth: 0, compacting: false, lastInputAt: 0 });
const frame = (name, elapsed = 0) => ({ state: name, active: name === 'working', elapsed, progress: 0, once: false });

test('overview is derived without mutating authored task order or inferring active work', () => {
  const tasks = ['done', 'pending', 'blocked', 'active', 'cancelled'].map((status, i) => ({ id: `t${i+1}`, title: `Task ${i+1}`, status, reason: status === 'blocked' ? 'Approval' : '' }));
  const plan = { tasks, revision: 'r1' }, before = structuredClone(plan);
  const o = taskOverview(plan);
  assert.equal(o.total, 5); assert.equal(o.done, 1); assert.equal(o.blocked, 1); assert.equal(o.cancelled, 1);
  assert.equal(o.activeId, 't4'); assert.equal(o.activeTitle, 'Task 4');
  assert.deepEqual(plan, before);
  assert.equal(taskOverview({ ...plan, tasks: tasks.filter(t => t.status !== 'active') }).activeId, undefined);
  const dock = { version: 1, id: 'pi-tasks', sessionId: 's', title: 'Plan', rows: [], overview: o };
  assert.equal(isSnapshot(dock), true);
  assert.equal(isSnapshot({ ...dock, overview: { ...o, total: -1 } }), false);
  assert.equal(isSnapshot({ ...dock, overview: { ...o, done: 100 } }), false);
  assert.equal(isSnapshot({ ...dock, overview: { ...o, activeTitle: '' } }), false);
});
test('task panel preserves exact counts and bounded geometry, prioritizes open work, and stays still on pause', () => {
  const workspace = state(), panel = new TaskPanel(); workspace.clock.begin(2000);
  const dock = taskDemo('working'), before = structuredClone(dock);
  const render = time => panel.render(theme, 90, dock, workspace, time, true, 7);
  const a = render(3000), b = render(3500);
  assert.deepEqual(a, b, "steady emphasis does not animate continuously");
  assert.match(a.map(plain).join('\n'), /3 of 6 done · 1 blocked/); assert.match(a.map(plain).join('\n'), /\+ 1 more · \/tasks/);
  workspace.promptDepth = 1; const paused = render(4000); assert.deepEqual(paused, render(4500)); assert.equal(panel.tick(workspace, 4600, true), false);
  workspace.promptDepth = 0; workspace.lastInputAt = 4700; render(4700); assert.equal(panel.tick(workspace, 4800, true), false);
  workspace.lastInputAt = 0; workspace.prefs.motion = 'off'; render(6000); assert.equal(panel.tick(workspace, 6500, true), false);
  workspace.prefs.motion = 'work'; workspace.footerPickerOpen = true; render(7000); assert.equal(panel.tick(workspace, 7500, true), false);
  workspace.footerPickerOpen = false; render(8000); panel.setVisible(false); assert.equal(panel.tick(workspace, 8500, true), false);
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
test('Tasks title and counts share one frame; the count is muted and the plan name is the only title', () => {
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    const rows = taskPanelRows(theme, 90, taskDemo('working'), taskPanelDefaults(), frame('idle'), 7);
    assert.ok(rows[0].includes(theme.style(' Photos for Mom ', { fg: theme.colors.accent, bold: true })));
    assert.ok(rows[0].includes(theme.style(' 3 of 6 done · 1 blocked ', { fg: theme.colors.muted, bold: true })));
    assert.ok(rows.at(-1).includes(theme.style(' + 1 more · /tasks ', { fg: theme.colors.muted, bold: true })));
    const idleRows = taskPanelRows(theme, 90, taskDemo('idle'), taskPanelDefaults(), frame('idle'), 7);
    assert.ok(idleRows.slice(1, -1).some(row => !row.includes('\x1b[1m')), 'ordinary body text remains unbolded');
  }
  initTheme('dark', false);
});
test('the settings demo is shaped exactly like a real snapshot', () => {
  const demo = taskDemo('working'), before = structuredClone(demo);
  assert.equal(isSnapshot(demo), true);
  assert.equal(demo.title, 'Photos for Mom');
  assert.ok(demo.rows.some(row => row.text === '● Working · Print 4×6 copies' && row.tone === 'accent'));
  assert.ok(demo.rows.some(row => row.text === '! Choose the cover photo · waiting for your pick' && row.tone === 'warning'));
  assert.ok(demo.rows.some(row => row.text === '○ Mail the album' && row.tone === 'text'));
  assert.ok(!demo.rows.some(row => /^✓|^–/.test(row.text)), 'closed work never appears as a row');
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    for (const width of [90, 140]) {
      const rows = taskPanelRows(theme, width, demo, taskPanelDefaults(), frame('working'), 7);
      const text = rows.map(plain).join('\n');
      assert.match(text, /Photos for Mom/);
      assert.match(text, /3 of 6 done · 1 blocked/);
      assert.match(text, /● Working · Print 4×6 copies/);
      assert.ok(rows.every(row => visibleWidth(row) <= width));
    }
    for (const width of [1, 12, 16, 24]) assert.ok(taskPanelRows(theme, width, demo, taskPanelDefaults(), frame('working'), 7).every(row => visibleWidth(row) <= width));
  }
  assert.deepEqual(demo, before);
  initTheme('dark', false);
});
test('changes-only motion ignores mount/history, plan switches and narrow unframed layouts', () => {
  const workspace = state(), panel = new TaskPanel(); workspace.layout = { ...FOOTER_DEFAULTS, tasks: taskPanelDefaults() }; workspace.layout.tasks.presentation.motion = 'changes';
  const dock = taskDemo('idle'); dock.overview.planId = 'p1';
  panel.render(theme, 90, dock, workspace, 3000, true, 7); assert.equal(panel.tick(workspace, 3100, true), false);
  const next = structuredClone(dock); next.overview.revision = 'next'; next.overview.done++;
  panel.render(theme, 90, next, workspace, 3200, true, 7); assert.equal(panel.tick(workspace, 3300, true), true);
  panel.tick(workspace, 8000, true); assert.equal(panel.tick(workspace, 9000, true), false);
  next.overview.planId = 'p2'; next.overview.revision = 'new-plan';
  panel.render(theme, 90, next, workspace, 10000, true, 7); assert.equal(panel.tick(workspace, 10100, true), false);
  next.overview.revision = 'changed'; panel.render(theme, 12, next, workspace, 11000, true, 7); assert.equal(panel.tick(workspace, 11100, true), false);
});
test('settings validation preserves old fields and bounds new data', () => {
  const p = footerPrefs({ ...FOOTER_DEFAULTS, tasks: { version: 1, title: '\x1b[31mTasks\n', rows: 999, presentation: { version: 1, intensity: -1, periodMs: Infinity } } });
  assert.equal('title' in p.tasks, false, 'the retired panel title is read without being revived');
  assert.equal(p.tasks.rows, 5); assert.equal(p.tasks.presentation.intensity, 0);
  assert.equal(p.tasks.presentation.periodMs, 4000); assert.equal(p.tasks.presentation.metadataColor, 'muted');
  assert.equal(p.selectionShimmer, FOOTER_DEFAULTS.selectionShimmer);
  assert.equal('title' in readTaskPanel({ version: 2 }), false);
});
test('Tasks settings preview supports keyboard, colors, undo, save and untouched native draft', async () => {
  const h = workspace();
  h.click('[Tasks]');
  assert.match(h.rows().join('\n'), /Example Tasks · no real task changes · working/);
  assert.match(h.rows().join('\n'), /3 of 6 done · 1 blocked/);
  h.click('Motion'); h.pick('work'); assert.equal(h.latest.tasks.presentation.motion, 'work');
  h.click('[Undo]'); assert.equal(h.latest.tasks.presentation.motion, 'changes');
  h.click('Advanced settings'); h.click('Border effect'); h.pick('pulse'); assert.equal(h.latest.tasks.presentation.effect, 'pulse');
  h.pick('Border color'); h.pick('custom'); h.text('#aabbcc'); assert.equal(h.latest.tasks.presentation.borderColor, '#aabbcc');
  h.click('Task rows'); h.click('Visible tasks'); h.pick('5'); assert.equal(h.latest.tasks.rows, 5);
  h.click('Plan name'); assert.doesNotMatch(h.rows().join('\n'), /Panel title/, 'the plan name is the one title authority');
  for (const width of [24, 40, 90, 140]) { h.tui.terminal.columns = width; assert.ok(h.panel.render(width).every(row => visibleWidth(row) <= width)); }
  h.panel.handleInput('\x13'); const saved = await h.pending;
  assert.equal('title' in saved.tasks, false); assert.equal(saved.tasks.presentation.effect, 'pulse');
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');
  assert.equal(footerPrefs(saved).tasks.presentation.borderColor, '#aabbcc');
});
test('demo state is not persisted; discard, focus loss, abort and disposal are safe', async () => {
  const abort = new AbortController(), h = workspace(undefined, 120, 40, abort.signal);
  h.panel.handleInput('\t');
  assert.match(h.rows().join('\n'), /Example Tasks/);
  h.click('Demo state'); h.pick('blocked'); assert.match(h.rows().join('\n'), /! Choose the cover photo/);
  assert.equal(h.workspace.clock.active, false); assert.equal(h.workspace.tools.size, 0);
  h.panel.focused = false; h.panel.render(120); h.panel.focused = true; h.panel.invalidate(); h.panel.render(120);
  abort.abort(); assert.equal(await h.pending, undefined); h.panel.dispose();
  const h2 = workspace(); h2.click('[Tasks]'); h2.click('Advanced settings'); h2.click('Border effect'); h2.pick('pulse');
  assert.equal(await h2.discard(), undefined); assert.equal(h2.editor.getText(), 'Unsent native draft 界面');
});
test('Tasks room synchronizes list and rendered preview selection without editing a plan or native draft', async () => {
  const h = workspace();
  const before = JSON.stringify(h.workspace.clock);
  h.click('[Tasks]');
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Border and motion/);
  h.click('Progress');
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Progress/);
  assert.match(h.rows().join('\n'), /Example Tasks · no real task changes · working/);
  assert.match(h.rows().join('\n'), /› Count position/);
  h.click('Plan name');
  h.click('3 of 6 done · 1 blocked');
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Progress/);
  h.click('+ 1 more · /tasks');
  assert.match(h.rows().join('\n'), /Workspace · Tasks · More hint/);
  h.click('● Working · Print 4×6 copies');
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Active task/);
  h.click('○ Mail the album');
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Task rows/);
  h.clickAt(0, h.rows().findIndex(row => row.includes('╭ Photos for Mom')));
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Border and motion/);
  h.panel.handleInput('\x1b[D'); // Keyboard path into the element list.
  h.panel.handleInput('\x1b[B');
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Plan name/);
  h.panel.handleInput('\x1b[C');
  assert.match(h.rows().join('\n'), /› Title position/);
  assert.equal(JSON.stringify(h.workspace.clock), before);
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');
  assert.equal(await h.discard(), undefined);
});

test('Tasks positions keep clickable labels on all six rails; omitted narrow labels have no phantom targets', async () => {
  const p = taskPanelDefaults();
  const dock = { ...taskDemo('working'), title: 'Photos 界面' };
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    for (const position of ['topLeft', 'topCenter', 'topRight', 'bottomLeft', 'bottomCenter', 'bottomRight']) {
      p.presentation.positions = { title: position, summary: position, hint: position };
      const { rows, hits } = taskPanelPreview(theme, 120, dock, p, frame('working'), 7);
      for (const id of ['title', 'summary', 'hint']) assert.ok(hits.some(hit => hit.id === id), `${appearance} ${position} ${id}`);
      for (const hit of hits) {
        assert.ok(hit.x >= 0 && hit.x + hit.width <= 120 && hit.y >= 0 && hit.y < rows.length);
        assert.ok(visibleWidth(rows[hit.y]) <= 120);
      }
    }
    for (const width of [1, 12, 16, 24, 40]) {
      const { rows, hits } = taskPanelPreview(theme, width, dock, p, frame('working'), 7);
      assert.ok(rows.every(row => visibleWidth(row) <= width));
      assert.ok(hits.every(hit => hit.x >= 0 && hit.x + hit.width <= width && hit.y < rows.length));
      if (width < 16) assert.deepEqual(hits, []);
    }
    p.rows = 5; // Nothing overflows; the hint stays the plain /tasks route.
    const noOverflow = taskPanelPreview(theme, 120, { ...dock, more: 0 }, p, frame('working'), 9);
    assert.ok(noOverflow.hits.some(hit => hit.id === 'hint'));
    assert.doesNotMatch(noOverflow.rows.map(plain).join('\n'), /\+ \d+ more/);
    p.rows = 3;
  }
  initTheme('dark', false);
  assert.equal(taskControlElement({ label: 'Any display name', element: 'summary' }), 'summary');
  assert.equal(TASK_ELEMENTS.length, 6);
  const h = workspace(); h.click('[Tasks]'); h.click('Progress');
  h.click('Count position'); h.pick('bottomCenter');
  const countRow = h.rows().findIndex(row => row.startsWith('╰') && row.includes('3 of 6 done'));
  assert.ok(countRow > 0);
  h.clickAt(visibleWidth(h.rows()[countRow].split('3 of 6 done')[0]), countRow);
  assert.match(h.rows().join('\n'), /Workspace · Tasks · Progress/);
  await h.discard();
});

test('narrow Tasks room keeps a keyboard path and restores native input when returning to Elements', async () => {
  const h = workspace(undefined, 24, 22);
  assert.match(h.rows().join('\n'), /\[Rooms…\]/);
  h.click('[Tasks]'); h.panel.handleInput('\x1b[D');
  h.panel.handleInput('\x1b[B'); h.panel.handleInput('\x1b[B');
  h.panel.handleInput('\x1b[C');
  assert.match(h.rows().join('\n'), /Count position/);
  for (const width of [16, 24, 40, 90]) {
    h.tui.terminal.columns = width;
    assert.ok(h.panel.render(width).every(row => visibleWidth(row) <= width));
  }
  h.click('[Elements]');
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');
  await h.discard();
});

test('representative task panel captures show real hierarchy at narrow/wide widths and both themes', () => {
  const captures = [];
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    for (const width of [24, 40, 90, 140]) for (const name of ['working', 'waiting', 'blocked', 'done']) {
      captures.push(`${appearance} · ${width} columns · ${name}`, ...taskPanelRows(theme, width, taskDemo(name), taskPanelDefaults(), frame(name, 1000), 7), '');
    }
  }
  writeCapture('pi-task-presentation-captures.ansi', captures.join('\n'));
  writeCapture('pi-task-presentation-captures.txt', captures.map(plain).join('\n'));
  initTheme('dark', false);
});
