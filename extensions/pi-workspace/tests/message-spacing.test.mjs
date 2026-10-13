import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { jiti, source, root, theme, plain, visibleWidth } from './host.mjs';
const { messageBodyRows } = await jiti.import(join(source, 'message-spacing.ts'));
const { generalPreview } = await jiti.import(join(source, 'workspace-general-preview.ts'));
const { transcriptPreview, transcriptDefaults } = await jiti.import(join(source, 'transcript-presentation.ts'));
const { SentMessageFrames } = await jiti.import(join(source, 'sent-messages.ts'));
const { AssistantMessageComponent, UserMessageComponent, initTheme } = await import(pathToFileURL(join(root, '@earendil-works/pi-coding-agent/dist/index.js')));
const { Container } = await import(pathToFileURL(join(root, '@earendil-works/pi-tui/dist/index.js')));
const interior = rows => rows.slice(1, -1).map(row => plain(row).slice(1, -1).trim());
const message = content => ({ role: 'assistant', content, stopReason: 'stop', model: 'test', provider: 'test', timestamp: 1 });

test('message padding keeps internal paragraph/code gaps, ANSI/OSC bytes and caller rows intact', () => {
  const rows = ['\x1b[31mFirst 界面\x1b[0m', '', '\x1b]8;;https://example.invalid\x07link\x1b]8;;\x07', '', 'Last'];
  const before = [...rows];
  assert.deepEqual(messageBodyRows(rows, 'compact'), rows);
  assert.deepEqual(messageBodyRows(rows, 'spaced'), ['', ...rows, '']);
  assert.deepEqual(rows, before);
  assert.deepEqual(messageBodyRows([], 'spaced'), []);
});

test('live user, text-first, thinking-first and failure messages use the same edge padding at narrow/wide widths', () => {
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    const nodes = [new UserMessageComponent('First 界面\n\nLast 👩‍💻'),
      new AssistantMessageComponent(message([{ type: 'text', text: 'First 界面\n\nLast 👩‍💻' }])),
      new AssistantMessageComponent(message([{ type: 'thinking', thinking: 'Thought' }, { type: 'text', text: 'Reply' }]), true),
      new AssistantMessageComponent({ ...message([]), stopReason: 'error', errorMessage: 'Failure' })];
    const root = new Container(), frames = new SentMessageFrames(), prefs = { density: 'spaced' };
    nodes.forEach(node => root.addChild(node));
    try {
      frames.sync(root, () => theme, () => 'Sol', undefined, () => ({ prefs }));
      for (const width of [12, 24, 70, 120]) for (const node of nodes) {
        prefs.density = 'compact'; const compact = node.render(width), compactBody = interior(compact);
        assert.ok(compactBody[0]); assert.ok(compactBody.at(-1));
        prefs.density = 'spaced'; const spaced = node.render(width);
        assert.deepEqual(interior(spaced), ['', ...compactBody, '']);
        assert.ok(spaced.every(row => visibleWidth(row) <= width));
        for (const zone of ['A', 'B', 'C']) assert.equal(spaced.join('').split(`\x1b]133;${zone}\x07`).length - 1, 1);
      }
      prefs.density = 'compact'; assert.ok(interior(nodes[0].render(120)).includes(''), 'paragraph break remains content');
    } finally { frames.dispose(); }
  }
});

test('both density modes preserve native mouse row/height mapping and ignore generated edge padding', () => {
  const root = new Container(), frames = new SentMessageFrames();
  const node = new AssistantMessageComponent(message([{ type: 'thinking', thinking: 'Thought' }, { type: 'text', text: 'Reply' }]), true);
  const nativeRender = node.render, nativeHeight = nativeRender.call(node, 68).length, calls = [];
  node.handleMouse = event => { calls.push(event); return { handled: true }; };
  root.addChild(node); const prefs = { density: 'spaced' };
  try {
    frames.sync(root, () => theme, () => 'Sol', undefined, () => ({ prefs }));
    for (const density of ['spaced', 'compact']) {
      prefs.density = density; const rows = node.render(70), y = rows.findIndex(row => plain(row).includes('Thinking'));
      const event = { type: 'click', button: 'left', x: 5, y, screenX: 5, screenY: y, width: 70, height: rows.length, ctrl: false, alt: false, shift: false };
      calls.length = 0; node.handleMouse(event);
      assert.equal(calls[0].y, 1); assert.equal(calls[0].height, nativeHeight); assert.equal(calls[0].width, 68);
      calls.length = 0;
      for (const edge of density === 'spaced' ? [0, 1, rows.length - 2, rows.length - 1] : [0, rows.length - 1]) node.handleMouse({ ...event, y: edge });
      assert.equal(calls.length, 0, 'synthetic padding/rails never click native thinking content');
    }
  } finally { frames.dispose(); }
});

test('General and Transcript message examples demonstrate the exact same symmetric density contract', () => {
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    for (const width of [24, 40, 90]) for (const density of ['spaced', 'compact']) {
      const prefs = { displayName: 'Alex 界面', density };
      for (const sample of [generalPreview(theme, width, prefs), transcriptPreview(theme, width, transcriptDefaults(), 'chat', 'plain', density)]) {
        const perMessage = sample.rows.length / 2, first = sample.rows.slice(0, perMessage), second = sample.rows.slice(perMessage);
        for (const rows of [first, second]) {
          const body = interior(rows);
          assert.equal(body.length, density === 'spaced' ? 3 : 1);
          if (density === 'spaced') { assert.equal(body[0], ''); assert.equal(body.at(-1), ''); }
          assert.ok(rows.every(row => visibleWidth(row) <= width));
        }
        for (const hit of sample.hits) assert.ok(hit.y >= 0 && hit.y < sample.rows.length && hit.x + hit.width <= width);
      }
    }
  }
});
