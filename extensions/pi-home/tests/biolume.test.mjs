import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { jiti, root, source, theme, initTheme, visibleWidth, CURSOR_MARKER, plain } from './host.mjs';
const { ThemeLease, THEME_NAME, PINE, pineRow, pineRule, pineText, inheritColors } = await jiti.import(source + '/biolume.ts');
const { getThemeByName, setThemeInstance } = await import(pathToFileURL(root + '/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js'));
const { backgroundAnsi, parseColor } = await import(pathToFileURL(root + '/@earendil-works/pi-tui/dist/index.js'));
const { canopy } = await jiti.import(source + '/canopy.ts');
const ctx = { ui: { theme, getTheme: getThemeByName, setTheme(t) { assert.equal(typeof t, 'object', 'never persist a theme name to settings'); setThemeInstance(t); return { success: true }; }, notify() {} } };

test('theme lease snapshots the live proxy, repairs only the known reload reset, and respects later manual changes', () => {
  initTheme('dark', false);
  const original = theme.fg('accent', 'test');
  const lease = new ThemeLease();
  lease.apply(ctx); assert.equal(theme.name, THEME_NAME);
  lease.restore(ctx); assert.equal(theme.name, 'dark'); assert.equal(theme.fg('accent', 'test'), original);
  lease.apply(ctx); lease.expectReloadReset();
  initTheme('dark', false); // The host's real post-session_start reload behavior.
  lease.settleReload(ctx); assert.equal(theme.name, THEME_NAME); assert.equal(lease.awaitingReload, false);
  initTheme('light', false); lease.settleReload(ctx); lease.apply(ctx); lease.restore(ctx);
  assert.equal(theme.name, 'light', 'manual changes win once startup has settled');
  initTheme('dark', false);
});

test('inherited surfaces survive native cursor resets and label foreground resets without corrupting RGB or OSC', () => {
  const fg = '<fg>', bg = '<bg>';
  assert.equal(inheritColors('\x1b[0m', fg, bg), '\x1b[0m' + fg + bg);
  assert.equal(inheritColors('\x1b[39m', fg, bg), '\x1b[39m' + fg);
  assert.equal(inheritColors('\x1b[49m', fg, bg), '\x1b[49m' + bg);
  assert.equal(inheritColors('\x1b[0;38;2;0;39;49m', fg, bg), '\x1b[0;38;2;0;39;49m' + bg);
  for (const code of ['\x1b[38;2;0;39;49m', '\x1b[48;5;0m', '\x1b[38:2::0:39:49m']) assert.equal(inheritColors(code, fg, bg), code);
  assert.equal(inheritColors(CURSOR_MARKER, fg, bg), CURSOR_MARKER);
  const input = '  ' + CURSOR_MARKER + '\x1b[7m \x1b[0m';
  const row = pineRow(theme, 80, input, 'input', 0);
  const background = backgroundAnsi(parseColor(PINE.input), theme.getColorMode());
  assert.ok(row.includes(CURSOR_MARKER));
  assert.ok(row.slice(row.indexOf('\x1b[0m')).includes(background));
  assert.equal(visibleWidth(row), 80);
  const rule = pineRule(theme, 80, pineText(theme, ' Title '), pineText(theme, 'working'));
  assert.equal(visibleWidth(rule), 80);
  assert.match(plain(rule), /^├ Title ─+working┤$/);
});

test('original cat is complete, not a miniature replacement or vertically clipped portrait', () => {
  for (const width of [42, 58, 104]) {
    const lines = canopy(theme, width, 6, 1200, 'busy');
    assert.equal(lines.length, 6);
    for (const line of lines) assert.equal(visibleWidth(line), width);
    const fur = backgroundAnsi(parseColor(PINE.fur), theme.getColorMode()).slice(2);
    assert.ok(lines.join('').includes(fur), 'original multi-row apricot sprite is present');
    assert.deepEqual(canopy(theme, width, 6, 1200, 'busy'), lines);
  }
});
