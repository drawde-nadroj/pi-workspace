import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createJiti } from 'jiti';
const directory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const jiti = createJiti(import.meta.url);
const { MirrorReader } = await jiti.import(join(directory, 'extensions/mirror-reader.ts'));
const { MirrorWidget } = await jiti.import(join(directory, 'extensions/mirror-widget.ts'));
const { default: factory } = await jiti.import(join(directory, 'extensions/index.ts'));
const { createJournal, openLocalJournal, store } = await jiti.import(join(directory, 'extensions/journal.ts'));
const { initTheme, theme, plain, visibleWidth } = await import(pathToFileURL(join(directory, '../../extensions/pi-home/tests/host.mjs')));
const entry = (id, day, body, parent = null, depth = 1) => ({ id, day, body, parent, depth, root: parent ?? id, level: depth,
  time: '12:30:00', createdAt: `${day}T12:30:00.000Z`, revision: false });
const text = lines => lines.map(plain).join('\n');
function reader(entries, rows = 20) {
  let closed = false, renders = 0;
  const tui = { terminal: { rows }, requestRender() { renders++; } };
  const view = new MirrorReader(tui, theme, () => { closed = true; });
  view.update(entries);
  return { view, tui, get closed() { return closed; }, get renders() { return renders; } };
}
async function until(check) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (check()) return; await delay(20); }
  assert.fail('Timed out waiting for mirror update');
}

test('every body line remains reachable across all days, Unicode, widths and themes', () => {
  for (const name of ['dark', 'light']) {
    initTheme(name, false);
    const entries = [entry('a', '2026-10-09', Array.from({ length: 35 }, (_, i) => `m${i.toString().padStart(2, '0')} ${'界面 café 👩🏽‍💻 '.repeat(3)}`).join('\n')),
      entry('b', '2026-10-09', 'Complete child body after long root', 'a', 2), entry('c', '2026-10-11', 'The final thought in another day')];
    const before = structuredClone(entries);
    for (const width of [12, 30, 80, 120]) {
      const h = reader(entries);
      const pages = [];
      let previous = '';
      for (let i = 0; i < 1200; i++) {
        const lines = h.view.render(width);
        assert.ok(lines.every(l => visibleWidth(l) <= width), `overflow ${width}`);
        assert.ok(lines.length <= Math.floor(h.tui.terminal.rows * .85));
        const page = text(lines);
        pages.push(page);
        if (page === previous) break;
        previous = page; h.view.handleInput('\x1b[B');
      }
      const all = pages.join('\n');
      for (let i = 0; i < 35; i++) assert.ok(all.includes(`m${i.toString().padStart(2, '0')}`), `missing body line ${i} at ${width}`);
      if (width >= 30) {
        assert.match(all, /Complete child body/); assert.match(all, /The final thought/);
        assert.match(all, /reply to #1/);
      }
      assert.doesNotMatch(all, /full thought in journal/);
      h.view.dispose(); assert.deepEqual(h.view.render(width), []);
    }
    assert.deepEqual(entries, before);
  }
});

test('thought/day/parent navigation, scrollable help, mouse and close have no writing path', () => {
  initTheme('dark', false);
  const entries = [entry('a', '2026-10-09', 'ROOT FIRST\n'.repeat(25)), entry('b', '2026-10-09', 'CHILD SECOND\n'.repeat(25), 'a', 2),
    entry('c', '2026-10-11', 'LAST DAY\n'.repeat(25))];
  const h = reader(entries);
  const draw = () => text(h.view.render(80));
  assert.match(draw(), /#1 .*root/);
  h.view.handleInput('n'); assert.match(draw(), /#2 .*reply to #1/);
  h.view.handleInput('b'); assert.match(draw(), /#1 .*root/);
  h.view.handleInput(']'); assert.match(draw(), /#3 .*2026-10-11/);
  h.view.handleInput('['); assert.match(draw(), /#1 .*2026-10-09/);
  h.view.handleInput('n'); h.view.handleInput('n'); h.view.handleInput('p'); assert.match(draw(), /#2/);
  h.view.handleInput('\x1b[H'); assert.match(draw(), /#1/);
  h.view.handleInput('\x1b[6~'); assert.doesNotMatch(draw(), /#1 .*root/);
  h.view.handleInput('\x1b[5~'); assert.match(draw(), /#1 .*root/);
  const beforeMouse = draw();
  assert.equal(h.view.handleMouse({ type: 'wheel', wheelDelta: 4 }).handled, true);
  assert.notEqual(draw(), beforeMouse);
  h.tui.terminal.rows = 8;
  h.view.handleInput('?');
  const help = [];
  for (let i = 0; i < 50; i++) { help.push(draw()); h.view.handleInput('j'); }
  assert.match(help.join('\n'), /Reading never changes journal/);
  h.view.handleInput('\x1b'); assert.equal(h.closed, false, 'Escape closes help before reader');
  h.view.handleInput('\x1b'); assert.equal(h.closed, true);
});

test('short thoughts sharing the last viewport still have independent navigation targets', () => {
  initTheme('dark', false);
  const h = reader([entry('a', '2026-10-11', 'ROOT'), entry('b', '2026-10-11', 'CHILD', 'a', 2),
    entry('c', '2026-10-11', 'GRANDCHILD', 'b', 3)], 60);
  const status = () => plain(h.view.render(100)[1]);
  assert.match(status(), /^#1/);
  h.view.handleInput('n'); assert.match(status(), /^#2/);
  h.view.handleInput('n'); assert.match(status(), /^#3/);
  h.view.handleInput('b'); assert.match(status(), /^#2/);
  h.view.handleInput('b'); assert.match(status(), /^#1/);
});

test('live saves and resize preserve the reading anchor; End explicitly follows latest', () => {
  initTheme('dark', false);
  let entries = [entry('a', '2026-10-09', 'FIRST\n'.repeat(40)), entry('b', '2026-10-11', 'SECOND\n'.repeat(40))];
  const h = reader(entries);
  h.view.render(80); h.view.handleInput('n');
  assert.match(text(h.view.render(80)), /#2 .*2026-10-11/);
  entries = [entry('older', '2026-10-08', 'OLDER\n'.repeat(40)), ...entries];
  h.view.update(entries);
  assert.match(text(h.view.render(80)), /#3 .*2026-10-11/, 'insertion before current thought must not jump to another entry');
  assert.match(text(h.view.render(30)), /SECOND/);
  h.view.handleInput('\x1b[F'); h.view.render(80);
  entries.push(entry('latest', '2026-10-12', 'LATEST SAVED END'));
  h.view.update(entries);
  assert.match(text(h.view.render(80)), /LATEST SAVED END/);
  assert.match(text(h.view.render(80)), /Following new saves/);
  h.view.handleInput('\x1b[H'); h.view.render(80);
  entries.push(entry('newer', '2026-10-13', 'NEWEST SAVED'));
  h.view.update(entries);
  assert.match(text(h.view.render(80)), /OLDER/);
  assert.doesNotMatch(text(h.view.render(80)), /NEWEST SAVED/);
  for (const rows of [1, 2, 4, 8, 20, 50]) for (const width of [1, 2, 12, 80]) {
    h.tui.terminal.rows = rows;
    const lines = h.view.render(width);
    assert.ok(lines.length <= Math.max(1, Math.floor(rows * .85)));
    assert.ok(lines.every(l => visibleWidth(l) <= width));
  }
  h.view.dispose(); const renders = h.renders;
  h.view.update(entries); h.view.handleInput('j'); assert.equal(h.renders, renders);
});

test('empty journal, terminal controls, warnings and bounded launcher remain explicit', () => {
  initTheme('light', false);
  const h = reader([]);
  assert.match(text(h.view.render(80)), /No saved thoughts/);
  h.view.update([entry('a', '2026-10-11', 'safe\x1b[2J\x1b[31mBODY\x1b[0m\x07\x1b_Gpayload\x1b\\\nTAIL')], 'Unreadable day: last valid snapshot retained');
  const result = h.view.render(100).join('\n');
  assert.doesNotMatch(result, /\x1b\[2J|\x1b_G|\x07/);
  assert.match(plain(result), /Warning: Unreadable day/);
  assert.match(plain(result), /BODY/);
  let opened = 0;
  const widget = new MirrorWidget(entry('a', '2026-10-11', 'long '.repeat(1000)), theme, undefined, 35, () => opened++);
  const lines = widget.render(80);
  assert.ok(lines.length <= 10); assert.match(text(lines), /35 thoughts/);
  assert.match(text(lines), /\/chronomancer mirror read/);
  assert.equal(widget.handleMouse({ type: 'click', button: 'left' }).handled, true);
  assert.equal(opened, 1);
});

test('reader discovery is read-only and legacy headings remain readable', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chronomancer-reader-discover-'));
  try {
    await assert.rejects(() => openLocalJournal(cwd, { create: false }), /No local journal/);
    assert.deepEqual(await readdir(cwd), []);
    const journal = await createJournal(join(cwd, 'chronomancer'));
    const before = await readdir(journal.directory);
    assert.deepEqual(await openLocalJournal(cwd, { create: false }), journal);
    assert.deepEqual(await readdir(journal.directory), before);
    initTheme('dark', false);
    const h = reader([{ ...entry('legacy', '2026-10-11', 'Complete imported body'), createdAt: null,
      legacyTitle: '12:30 My original heading' }]);
    const rendered = text(h.view.render(100));
    assert.match(rendered, /Original heading: 12:30 My original heading/);
    assert.match(rendered, /Complete imported body/);
    assert.match(rendered, /Reading · End follows latest/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('reader connects full history, refreshes externally, closes safely and never changes drafts or persisted data', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chronomancer-reader-'));
  const commands = new Map(), handlers = new Map(), widgets = new Map(), notices = [];
  let panel, finish, openCount = 0;
  initTheme('dark', false);
  const ctx = { cwd, mode: 'tui', hasUI: true, ui: {
    theme, setWidget: (name, f) => widgets.set(name, f), notify: m => notices.push(m),
    onTerminalInput() {}, getEditorText: () => 'Unsent agent draft 界面',
    setEditorText: () => assert.fail('reader changed draft'),
    custom: async (f, options) => new Promise(resolve => {
      openCount++; assert.equal(options.overlay, true);
      panel = f({ terminal: { rows: 20 }, requestRender() {} }, theme, {}, () => { panel.dispose(); resolve(); });
      finish = () => { panel.dispose(); resolve(); };
    }),
  }, sessionManager: { getSessionId: () => 'test' }, modelRegistry: { complete: () => assert.fail('model called') } };
  factory({ events: { on() {}, emit() {} }, on: (name, h) => handlers.set(name, h),
    registerEntryRenderer() {}, registerCommand: (name, c) => commands.set(name, c),
    appendEntry: () => assert.fail('reader wrote a session entry'), sendUserMessage: () => assert.fail('reader sent a prompt') });
  const command = args => commands.get('chronomancer').handler(args, ctx);
  try {
    const journal = await createJournal(join(cwd, 'chronomancer'));
    const original = await store(journal, '2026-10-09', 'OLDER ROOT\n'.repeat(40));
    await store(journal, '2026-10-09', 'SAVED CHILD', original.id);
    await store(journal, '2026-10-11', 'ANOTHER DAY');
    const file = join(journal.directory, '2026-10-09.md'), bytes = await readFile(file);
    let pending = command('mirror read');
    await until(() => panel);
    assert.match(text(panel.render(100)), /3 thoughts · 2 days/);
    panel.handleInput('n'); assert.match(text(panel.render(100)), /SAVED CHILD/);
    await command('mirror read'); assert.equal(openCount, 1, 'do not stack readers');
    panel.handleInput('\x1b[F'); panel.render(100);
    await store(journal, '2026-10-12', 'NEW EXTERNAL THOUGHT');
    await until(() => text(panel.render(100)).includes('NEW EXTERNAL THOUGHT'));
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(await handlers.get('input')({ source: 'interactive', text: 'agent request' }, ctx), { action: 'continue' });
    panel.handleInput('\x1b'); await pending;
    assert.equal(ctx.ui.getEditorText(), 'Unsent agent draft 界面');
    assert.ok(widgets.get('chronomancer-mirror'));
    panel = undefined; pending = command('mirror read'); await until(() => panel);
    await command('mirror off'); await pending;
    assert.equal(widgets.get('chronomancer-mirror'), undefined);
    panel = undefined; pending = command('mirror read'); await until(() => panel);
    handlers.get('session_tree')({}, ctx); await pending;
    panel = undefined; pending = command('mirror read'); await until(() => panel);
    handlers.get('session_shutdown')({}, ctx); await pending;
    assert.equal(widgets.get('chronomancer-mirror'), undefined);
    panel = undefined; pending = command('mirror read'); await until(() => panel);
    handlers.get('session_start')({}, ctx); await pending;
    assert.equal(widgets.get('chronomancer-mirror'), undefined, 'a new session releases mirror resources');
    assert.equal(notices.some(n => n.includes('Chronomancer:')), false, notices.join('\n'));
  } finally { finish?.(); handlers.get('session_shutdown')?.({}, ctx); await rm(cwd, { recursive: true, force: true }); }
});
