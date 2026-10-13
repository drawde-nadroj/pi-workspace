import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspace } from './workspace-harness.mjs';
import { jiti, source, visibleWidth } from './host.mjs';
import { join } from 'node:path';
const { footerPrefs } = await jiti.import(join(source, 'footer-state.ts'));

test('Ask room selects real shell preview labels and retains native input through Undo/Discard', async () => {
  const h = workspace();
  const original = h.editor.getText();
  h.click('[Ask]');
  assert.match(h.rows().join('\n'), /Example question · no real answer changes/);
  h.click('Which option suits this sample?');
  assert.match(h.rows().join('\n'), /Workspace · Ask · Question text/);
  h.click('Question emphasis'); h.pick('normal');
  assert.equal(h.latest.ask.questionText, 'normal');
  assert.equal(h.editor.getText(), original);
  h.panel.handleInput('\x1a'); // Ctrl+Z is the workspace Undo, not editor Undo.
  assert.equal(h.latest.ask, undefined);
  h.click('Question progress');
  h.click('Progress position'); h.pick('bottomRight');
  assert.equal(h.latest.ask.progressPosition, 'bottomRight');
  assert.match(h.rows().join('\n'), /2 of 3/);
  await h.discard();
  assert.equal(h.editor.getText(), original);
});

test('Ask room saves only validated visual settings, preserves future versions and keeps a narrow keyboard path', async () => {
  const h = workspace(undefined, 120, 40);
  h.click('[Ask]'); h.click('Question title');
  h.click('Title text'); h.text('Questions 界面');
  assert.equal(h.latest.ask.title, 'Questions 界面');
  h.click('Title position'); h.pick('topCenter');
  h.click('Action hints'); h.click('Hint tone'); h.pick('muted');
  for (const width of [16, 24, 40, 120]) {
    h.tui.terminal.columns = width;
    assert.ok(h.panel.render(width).every(row => visibleWidth(row) <= width));
  }
  h.panel.handleInput('\x13'); // Ctrl+S
  const saved = await h.pending;
  assert.equal(saved.ask.version, 1);
  assert.equal(saved.ask.titlePosition, 'topCenter');
  assert.equal(saved.ask.hints, 'muted');
  assert.equal(saved.questionLabels, 'matched'); // Legacy field remains a fallback, not a second authority.
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');

  const future = { version: 2, newField: { unknown: true } };
  const unknown = workspace(footerPrefs({ ask: future }));
  unknown.click('[Ask]');
  assert.match(unknown.rows().join('\n'), /Ask settings unavailable or newer version/);
  unknown.panel.handleInput('\x13');
  assert.match(unknown.rows().join('\n'), /Save is blocked to preserve it/);
  await unknown.discard();
  assert.deepEqual(footerPrefs({ ask: future }).ask, future);
});
