import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { jiti, source, theme, initTheme, plain, visibleWidth } from './host.mjs';
const { sessionBadge } = await jiti.import(join(source, 'composer-title.ts'));
const { appearanceRow, appearanceColor } = await jiti.import(join(source, 'appearance-render.ts'));
const { appearanceDefaults, POSITIONS } = await jiti.import(join(source, 'appearance.ts'));
const { DEFAULTS, RunClock } = await jiti.import(join(source, 'state.ts'));
const { FOOTER_DEFAULTS } = await jiti.import(join(source, 'footer-state.ts'));
const withoutBackground = text => text.replace(/\x1b\[(?:48;(?:2;\d+;\d+;\d+|5;\d+)|49)m/g, '');

test('session badge is static, retains chosen foreground/weight and uses no extra cells', () => {
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    for (const value of ['accent', '#ffffff', '#000000', '#808080', '#cc5500']) for (const bold of [false, true]) {
      const color = appearanceColor(theme, value), text = ' Alchemy 界面 é ';
      const badge = sessionBadge(theme, text, color, bold);
      assert.equal(badge, sessionBadge(theme, text, color, bold));
      assert.match(badge, /\x1b\[48;/);
      assert.equal(withoutBackground(badge), theme.style(text, { fg: color, bold }));
      assert.equal(plain(badge), text); assert.equal(visibleWidth(badge), visibleWidth(text));
    }
  }
  initTheme('dark', false);
});

test('title badge follows configured positions and visibility without forcing bold metadata or mutating preferences', () => {
  const s = { prefs: { ...DEFAULTS }, clock: new RunClock(), tools: new Map(), phase: 'working', promptDepth: 0,
    compacting: false, lastInputAt: 0, layout: { ...FOOTER_DEFAULTS } };
  s.layout.appearance = appearanceDefaults(s.layout);
  s.appearanceData = () => ({ session: 'Alchemy 界面', model: 'Model', cwd: '/tmp', thinking: 'high' });
  for (const e of Object.values(s.layout.appearance.elements)) e.visible = false;
  const title = s.layout.appearance.elements.session;
  title.visible = true; title.color = '#cc5500';
  for (const position of Object.keys(POSITIONS)) {
    title.position = position;
    const row = position.startsWith('top') ? 'top' : position.startsWith('bottom') ? 'bottom' : position.startsWith('footer1') ? 'footer1' : 'footer2';
    for (const width of [1, 8, 20, 44, 90, 140]) {
      const before = JSON.stringify(s.layout), a = appearanceRow(theme, width, s, row, 1000), hits = structuredClone(s.appearanceHits);
      const b = appearanceRow(theme, width, s, row, 2000);
      assert.equal(a, b); assert.ok(visibleWidth(a) <= width); assert.deepEqual(s.appearanceHits, hits);
      assert.equal(JSON.stringify(s.layout), before);
      if (width >= 44) { assert.match(plain(a), /Alchemy/); assert.match(a, /\x1b\[48;/); }
    }
  }
  title.visible = false;
  assert.doesNotMatch(plain(appearanceRow(theme, 140, s, 'footer2', 1000)), /Alchemy/);
  const model = s.layout.appearance.elements.model;
  model.visible = true; model.position = 'bottomLeft'; model.bold = false;
  assert.doesNotMatch(appearanceRow(theme, 140, s, 'bottom', 1000), /\x1b\[1m/);
  model.bold = true;
  assert.match(appearanceRow(theme, 140, s, 'bottom', 1000), /\x1b\[1m/);
});
