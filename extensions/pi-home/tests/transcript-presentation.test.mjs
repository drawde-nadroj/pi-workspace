import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { workspace } from './workspace-harness.mjs';
import { jiti, source, root, theme, initTheme, plain, visibleWidth } from './host.mjs';
const { footerPrefs } = await jiti.import(join(source, 'footer-state.ts'));
const { ActivityBlocks } = await jiti.import(join(source, 'activity-blocks.ts'));
const { ToolExecutionComponent, createReadToolDefinition } = await import(pathToFileURL(join(root, '@earendil-works/pi-coding-agent/dist/index.js')));
const { Container } = await import(pathToFileURL(join(root, '@earendil-works/pi-tui/dist/index.js')));
const { readTranscript, transcriptDefaults, transcriptPreview } = await jiti.import(join(source, 'transcript-presentation.ts'));

test('versioned transcript settings migrate old controls and preserve unknown versions', () => {
  assert.deepEqual(readTranscript(undefined, footerPrefs({ messageTime: 'off', toolLabels: 'matched' })), {
    version: 1, chat: { assistantLabel: 'matched', showSent: false, sentPosition: 'bottomRight' },
    tools: { identity: 'quiet', status: 'matched' },
  });
  assert.equal(readTranscript({ version: 2, chat: { showSent: true } }), undefined);
  const future = { version: 2, newValue: { nested: true } };
  assert.deepEqual(footerPrefs({ transcript: future }).transcript, future);
  const parsed = readTranscript({ version: 1, chat: { showSent: 'yes', sentPosition: 'topLeft' }, tools: { status: 'error' } });
  assert.deepEqual(parsed, transcriptDefaults());
});

test('transcript list and synthetic preview select only visible labels; Undo/Discard preserve native draft', async () => {
  const h = workspace();
  h.click('[Transcript]');
  assert.match(h.rows().join('\n'), /Demo chat \/ tool · display only/);
  h.click('Sent 9:41 AM');
  assert.match(h.rows().join('\n'), /Workspace · Transcript · Sourced Sent time/);
  h.click('Sent position'); h.pick('bottomLeft');
  assert.equal(h.latest.transcript.chat.sentPosition, 'bottomLeft');
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');
  h.panel.handleInput('\x1a');
  assert.equal(h.latest.transcript, undefined);
  h.click('Tool identity');
  assert.match(h.rows().join('\n'), /Read  sample.txt/);
  h.click('Tool identity  quiet'); h.pick('matched');
  assert.equal(h.latest.transcript.tools.identity, 'matched');
  h.click('failed');
  assert.match(h.rows().join('\n'), /Workspace · Transcript · Tool status/);
  await h.discard();
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');
});

test('transcript appearance saves through shared transaction, keeps keyboard path and rejects future version', async () => {
  const h = workspace();
  h.click('[Transcript]'); h.click('Sourced Sent time');
  h.click('Show sourced Sent time');
  assert.equal(h.latest.transcript.chat.showSent, false);
  h.click('Tool status'); h.click('Successful status tone'); h.pick('matched');
  assert.equal(h.latest.transcript.tools.status, 'matched');
  for (const width of [12, 24, 40, 120]) {
    h.tui.terminal.columns = width;
    assert.ok(h.panel.render(width).every(line => visibleWidth(line) <= width));
  }
  h.panel.handleInput('\x1b[D');
  h.panel.handleInput('\x1b[A');
  h.panel.handleInput('\x1b[C');
  h.panel.handleInput('\x13');
  const saved = await h.pending;
  assert.equal(saved.transcript.version, 1);
  assert.equal(saved.transcript.chat.showSent, false);
  assert.equal(saved.messageTime, 'on'); // Legacy field remains a read-only fallback.
  assert.equal(h.editor.getText(), 'Unsent native draft 界面');

  const future = { version: 3, fields: ['unknown'] };
  const unknown = workspace(footerPrefs({ transcript: future }));
  unknown.click('[Transcript]');
  assert.match(unknown.rows().join('\n'), /settings unavailable or newer version/);
  unknown.panel.handleInput('\x13');
  assert.match(unknown.rows().join('\n'), /Save is blocked to preserve it/);
  await unknown.discard();
  assert.deepEqual(footerPrefs({ transcript: future }).transcript, future);
});

test('ordinary tool rail changes with appearance while status and native fallback remain truthful', () => {
  const definition = createReadToolDefinition('/tmp'), original = { content: [{ type: 'text', text: 'line one' }], isError: false };
  const node = new ToolExecutionComponent('read', 'transcript-sample', { path: '/tmp/sample.txt' }, { showImages: false }, definition, { requestRender() {} }, '/tmp');
  const parent = new Container(); parent.addChild(node);
  let style = transcriptDefaults();
  const blocks = new ActivityBlocks(() => theme, () => {}, () => 'semantic', () => false, () => style);
  try {
    node.updateResult(original); blocks.sync(parent);
    const first = node.render(90)[0];
    assert.match(plain(first), /Read  sample.txt/);
    assert.match(plain(first), /✓/); // Compact success intentionally omits the redundant status word.
    style = { ...style, tools: { identity: 'matched', status: 'matched' } };
    const second = node.render(90)[0];
    assert.notEqual(second, first, 'appearance changes invalidate the cached header');
    assert.equal(node.result, original);
    node.updateResult({ content: [{ type: 'text', text: 'Permission denied' }], isError: true });
    assert.match(plain(node.render(90)[0]), /×.*failed/);
    assert.match(node.render(90).map(plain).join('\n'), /Permission denied/);
    node.toolDefinition = { renderShell: 'self', renderCall: () => ({ render: () => ['CUSTOM'] }) };
    assert.doesNotMatch(node.render(90).map(plain).join('\n'), /╭.*Read/, 'self-rendering overrides stay native');
  } finally { blocks.dispose(); }
});

test('preview derives bounded hits from rendered labels in light/dark and never invents tool failure success', () => {
  for (const appearance of ['light', 'dark']) for (const width of [10, 24, 40, 90]) {
    initTheme(appearance, false);
    for (const group of ['chat', 'tools']) {
      const { rows, hits } = transcriptPreview(theme, width, transcriptDefaults(), group);
      assert.ok(rows.every(row => visibleWidth(row) <= width));
      for (const hit of hits) {
        assert.ok(hit.x >= 0 && hit.y >= 0 && hit.width > 0 && hit.x + hit.width <= width && hit.y < rows.length);
        if (!hit.id.endsWith('Frame')) assert.ok(plain(rows[hit.y]).slice(hit.x, hit.x + hit.width).trim());
      }
      if (group === 'tools' && width >= 24) assert.match(rows.map(plain).join('\n'), /failed/);
    }
  }
});
