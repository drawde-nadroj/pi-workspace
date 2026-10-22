import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { jiti, source, theme, initTheme, plain, visibleWidth } from './host.mjs';
const { emberMarker, emberStatus } = await jiti.import(join(source, 'composer-ember.ts'));
const { appearanceRow } = await jiti.import(join(source, 'appearance-render.ts'));
const { appearanceDefaults } = await jiti.import(join(source, 'appearance.ts'));
const { DEFAULTS, RunClock } = await jiti.import(join(source, 'state.ts'));
const { FOOTER_DEFAULTS } = await jiti.import(join(source, 'footer-state.ts'));
const { TaskPanel, taskDemo, taskPanelDefaults } = await jiti.import(join(source, 'task-presentation.ts'));
const state = () => ({ prefs: { ...DEFAULTS }, clock: new RunClock(), phase: 'thinking', tools: new Map(), promptDepth: 0,
  compacting: false, lastInputAt: 0, layout: { ...FOOTER_DEFAULTS }, editorFocused: () => true });

test('ember is bounded, deterministic, expressive, and unchanged by ordinary typing', () => {
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    const s = state(); s.clock.begin(1000);
    for (const phase of ['thinking', 'tools', 'responding', 'compacting', 'working']) {
      const frames = Array.from({ length: 20 }, (_, i) => emberMarker(theme, phase, s, 1000 + i * 100, theme.colors.accent));
      assert.ok(frames.every(f => visibleWidth(f) === 5));
      assert.ok(new Set(frames.map(plain)).size > 8, 'shape changes, not only brightness');
      assert.ok(frames.every(f => /[\u2801-\u28ff]/u.test(plain(f))), 'never disappears entirely');
    }
    const normal = emberMarker(theme, 'thinking', s, 1400, theme.colors.accent);
    s.lastInputAt = 1399;
    assert.equal(emberMarker(theme, 'thinking', s, 1400, theme.colors.accent), normal);
    s.activityEventAt = 1100;
    assert.notEqual(emberMarker(theme, 'thinking', s, 1400, theme.colors.accent), normal, 'real event response');
    for (const mode of ['prompt', 'preferences', 'layout', 'picker']) {
      const gated = state(); gated.clock.begin(1000);
      if (mode === 'prompt') gated.promptDepth = 1;
      if (mode === 'preferences') gated.prefs.motion = 'off';
      if (mode === 'layout') gated.layout.motion = 'off';
      if (mode === 'picker') gated.footerPickerOpen = true;
      assert.equal(emberMarker(theme, 'thinking', gated, 1100, theme.colors.accent), emberMarker(theme, 'thinking', gated, 1400, theme.colors.accent));
    }
    for (const phase of ['waiting', 'done', 'error', 'stopped', 'interrupted', 'idle']) {
      assert.equal(emberMarker(theme, phase, s, 1100, theme.colors.accent), emberMarker(theme, phase, s, 1400, theme.colors.accent));
    }
    for (let budget = 0; budget < 40; budget++) assert.ok(visibleWidth(emberStatus(theme, 'Thinking · 12s', 'thinking', s, 1400, budget, theme.colors.accent)) <= budget);
  }
  initTheme('dark', false);
});

test('each working state has a distinct, deterministic grid choreography', () => {
  initTheme('dark', false);
  const s = state(); s.clock.begin(1000);
  const phases = ['thinking', 'responding', 'tools', 'compacting', 'working'];
  const signatures = phases.map(phase => Array.from({ length: 20 }, (_, i) =>
    plain(emberMarker(theme, phase, s, 1000 + i * 100, theme.colors.accent))).join('\n'));
  assert.equal(new Set(signatures).size, phases.length, 'every state has its own scene');
  for (const phase of phases) {
    const first = emberMarker(theme, phase, s, 2345, theme.colors.accent);
    assert.equal(emberMarker(theme, phase, s, 2345, theme.colors.accent), first, 'rendering is deterministic');
    assert.equal(visibleWidth(first), 5);
    assert.match(plain(first), /[\u2801-\u28ff]/u);
  }
});

test('real tool activity changes visible dots in every moving scene', () => {
  initTheme('dark', false);
  for (const phase of ['thinking', 'responding', 'tools', 'compacting', 'working']) {
    const s = state(); s.clock.begin(1000);
    const normal = emberMarker(theme, phase, s, 1400, theme.colors.accent);
    s.activityEventAt = 1100;
    assert.notEqual(plain(emberMarker(theme, phase, s, 1400, theme.colors.accent)), plain(normal), phase);
  }
});

test('scenes stay bounded and visible after a long run', () => {
  initTheme('dark', false);
  for (const phase of ['thinking', 'responding', 'tools', 'compacting', 'working']) {
    const s = state(); s.clock.begin(0);
    const frame = emberMarker(theme, phase, s, 86_400_000, theme.colors.accent);
    assert.equal(visibleWidth(frame), 5);
    assert.match(plain(frame), /[\u2801-\u28ff]/u);
  }
});

test('static marks centre in the same five cells the scenes fill', () => {
  initTheme('dark', false);
  const s = state(); s.clock.begin(1000); s.clock.settle(11000, 'done');
  for (const phase of ['done', 'error', 'stopped', 'interrupted', 'waiting', 'idle', 'thinking']) {
    const marker = plain(emberMarker(theme, phase, s, 12000, theme.colors.accent));
    assert.equal(visibleWidth(marker), 5, phase);
    assert.match(marker, /^ {2}\S {2}$/u, `${phase} must centre in the five-cell ember block`);
  }
  const status = plain(emberStatus(theme, 'your turn', 'done', s, 12000, 40, theme.colors.accent));
  assert.equal(status, '  ✓   your turn');
  s.clock.begin(12000);
  assert.equal(plain(emberStatus(theme, 'Thinking', 'thinking', s, 12100, 40, theme.colors.accent)).indexOf('Thinking'), 6,
    'moving and static labels begin in the same column');
});

test('live appearance keeps text and hit geometry steady beside the ember and prioritizes state over tool details', () => {
  const s = state(); s.clock.begin(1000); s.layout.appearance = appearanceDefaults(s.layout);
  s.railStatus = () => ({ state: 'tools', text: '2 tools running', tone: 'toolTitle' });
  s.railRunElapsed = () => 12000;
  s.tools.set('a', 'read'); s.tools.set('b', 'bash');
  s.appearanceData = () => ({ session: 'Alchemy', model: 'test', cwd: '/tmp', thinking: 'high' });
  const before = structuredClone(s.layout);
  for (const width of [1, 8, 20, 40, 60, 90, 140, 240]) {
    const a = appearanceRow(theme, width, s, 'top', 1100), hits = structuredClone(s.appearanceHits);
    const b = appearanceRow(theme, width, s, 'top', 1400);
    assert.ok(visibleWidth(a) <= width); assert.ok(visibleWidth(b) <= width);
    assert.deepEqual(s.appearanceHits, hits, 'motion never moves hit targets');
    if (width >= 60) assert.match(plain(a), /2 tools running/);
    if (width >= 140) assert.match(plain(a), /read, bash/);
  }
  assert.deepEqual(s.layout, before);
});

test('task feedback is brief, follows meaningful progress, survives typing, and does not replay on remount', () => {
  const s = state(); s.clock.begin(1000); s.layout.tasks = taskPanelDefaults();
  const panel = new TaskPanel(), dock = taskDemo('working'); dock.overview.planId = 'p1';
  const render = t => panel.render(theme, 90, dock, s, t, true, 7);
  const initial = render(1100); assert.deepEqual(initial, render(1400));
  dock.overview.revision = 'note edit'; render(1500); assert.equal(panel.tick(s, 1550, true), false);
  dock.overview.activeId = 't5'; dock.overview.revision = 'new focus';
  const atStart = render(1600); s.lastInputAt = 1750;
  const peak = render(2200); assert.notDeepEqual(atStart, peak); assert.deepEqual(atStart.map(plain), peak.map(plain));
  assert.equal(panel.tick(s, 2200, true), true);
  assert.equal(panel.tick(s, 2900, true), false);
  panel.setVisible(false); assert.equal(panel.tick(s, 3000, true), false);
  render(3100); assert.equal(panel.tick(s, 3200, true), false);
  s.promptDepth = 1; dock.overview.done++; render(3300); assert.equal(panel.tick(s, 3400, true), false);
});
