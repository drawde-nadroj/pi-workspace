import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const directory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { jiti, root, kb, theme, initTheme, plain, visibleWidth, CURSOR_MARKER } = await import(pathToFileURL(join(directory, '../../extensions/pi-home/tests/host.mjs')));
const { InlineRewind } = await jiti.import(join(directory, 'extensions/inline-rewind.ts'));
const { connectJournal, list, loadProgress, localDay } = await jiti.import(join(directory, 'extensions/journal.ts'));
const { passRoute } = await jiti.import(join(directory, 'extensions/passes.ts'));
const { default: chronomancer } = await jiti.import(join(directory, 'extensions/index.ts'));
const { Container, Editor, ScrollView, VStack, TuiAltScreen } = await import(pathToFileURL(join(root, '@earendil-works/pi-tui/dist/index.js')));
const { getSelectListTheme } = await import(pathToFileURL(join(root, '@earendil-works/pi-coding-agent/dist/index.js')));
const { getEditorTheme } = await import(pathToFileURL(join(root, '@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js')));
const { ModalEditor } = await jiti.import(join(directory, '../../node_modules/pi-vim/index.ts'));

function thought(id, body) {
  return { id, root: id, parent: null, depth: 1, level: 1, time: '09:00:00', createdAt: new Date().toISOString(), body, revision: false, day: '2026-10-10' };
}
function harness(width = 90, height = 24, editorFactory) {
  let input = () => {};
  const terminal = { columns: width, rows: height, kittyProtocolActive: false,
    start(fn) { input = fn; }, stop() {}, async drainInput() {}, write() {}, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  const ui = new TuiAltScreen(terminal, false);
  const document = new Container(), view = new ScrollView(document, { follow: 'end', primary: true });
  const bottom = editorFactory?.(ui) ?? new Editor(ui, { borderColor: text => text, selectList: getSelectListTheme() });
  ui.addChild(document); ui.addChild(bottom);
  ui.setLayoutRoot(new VStack([
    { component: view, basis: 0, grow: 1, shrink: 1, minSize: 1 },
    { component: bottom, basis: 'auto', grow: 0, shrink: 1, minSize: 3 },
  ]));
  ui.setFocus(bottom); ui.start();
  return { ui, terminal, document, view, bottom, send: data => input(data), close: () => ui.stop() };
}

test('color paths alternate direction and include only real saved parents, never skipped roots', () => {
  const a = thought('a', 'A'), b = thought('b', 'B'), c = thought('c', 'C');
  const orangeA = { ...thought('oa', 'orange A'), root: 'a', parent: 'a', depth: 2 };
  const orangeB1 = { ...thought('ob1', 'orange B1'), root: 'b', parent: 'b', depth: 2 };
  const yellowB1 = { ...thought('yb1', 'yellow B1'), root: 'b', parent: 'ob1', depth: 3 };
  const orangeB2 = { ...thought('ob2', 'orange B2'), root: 'b', parent: 'b', depth: 2 };
  const entries = [a, orangeA, b, orangeB1, yellowB1, orangeB2, c];
  assert.deepEqual(passRoute(entries, 2), ['c', 'b', 'a']);
  assert.deepEqual(passRoute(entries, 3), ['oa', 'ob1', 'ob2']);
  assert.deepEqual(passRoute(entries, 4), ['yb1']);
  assert.deepEqual(passRoute(entries, 5), []);
});

test('original red entry holds a separately focused orange editor; native red draft and IME cursor survive navigation', () => {
  for (const appearance of ['dark', 'light']) for (const width of [8, 12, 20, 24, 40, 90]) {
    initTheme(appearance, false);
    const h = harness(width), entries = [thought('a', 'A'), thought('b', 'B'), thought('c', 'C')];
    const saved = [];
    const inline = new InlineRewind(() => theme, async (parent, text) => saved.push([parent.id, text]), error => { throw error; });
    try {
      const groups = entries.map(entry => inline.render(entry, theme));
      for (const group of groups) h.document.addChild(group);
      inline.bind(h.ui); inline.showDay('2026-10-10', entries);
      h.bottom.setText('unfinished red draft');
      assert.equal(inline.focus('c'), true);
      const c = h.ui.getFocusedComponent();
      c.handleInput('orange for C');
      if (width >= 40) assert.match(plain(groups[2].render(width).join('\n')), /ORANGE · reply to/);
      assert.equal(groups[0].render(width).join('').includes('ORANGE'), false);
      assert.equal(h.bottom.getText(), 'unfinished red draft');
      assert.equal(groups[2].render(width).join('').split(CURSOR_MARKER).length - 1, 1, 'the inline editor owns the IME cursor');
      for (const line of groups[2].render(width)) assert.ok(visibleWidth(line) <= width, `overflow ${width}`);
      assert.equal(inline.focus('b'), true);
      h.ui.getFocusedComponent().handleInput('orange for B');
      assert.equal(inline.getDraft('c'), 'orange for C');
      assert.equal(inline.getDraft('b'), 'orange for B');
      assert.equal(inline.focus('a'), true, 'skipped A still has an empty editor');
      assert.equal(inline.getDraft('a'), '');
      inline.focusBottom();
      assert.equal(h.ui.getFocusedComponent(), h.bottom);
      assert.equal(h.bottom.getText(), 'unfinished red draft');
      assert.ok(groups[0].render(width).length > 3, 'the orange composer remains visible when red has focus');
      assert.equal(inline.focus('c'), true);
      assert.equal(inline.getDraft('c'), 'orange for C');
      assert.deepEqual(saved, [], 'navigation and drafts do not save entries or call a model');
    } finally { h.close(); }
  }
});

test('real pi-vim stays mounted with its draft, mode, undo, and focus while an inline editor opens and closes', () => {
  initTheme('dark', false);
  const h = harness(90, 24, ui => new ModalEditor(ui, getEditorTheme(), kb));
  const original = h.bottom, entry = thought('vim', 'Vim root');
  const inline = new InlineRewind(() => theme, async () => {}, error => { throw error; });
  try {
    const frame = inline.render(entry, theme);
    h.document.addChild(frame); inline.bind(h.ui); inline.showDay(entry.day, [entry]);
    h.bottom.setText('one two'); h.send('\x1b'); h.send('0'); h.send('x');
    assert.equal(original.getText(), 'ne two');
    assert.match(plain(original.render(90).join('\n')), /NORMAL/);
    assert.equal(inline.focus('vim'), true);
    h.ui.getFocusedComponent().handleInput('orange unsent');
    assert.equal(h.bottom, original);
    assert.equal(original.getText(), 'ne two');
    inline.focusBottom();
    assert.equal(h.ui.getFocusedComponent(), original);
    h.send('u');
    assert.equal(original.getText(), 'one two', 'Vim undo survives a colored-editor focus cycle');
    assert.match(plain(original.render(90).join('\n')), /NORMAL/);
    assert.equal(inline.focus('vim'), true);
    assert.equal(inline.getDraft('vim'), 'orange unsent');
  } finally { h.close(); }
});

test('a saved orange child renders beneath its red parent, with shared right edge and no fabricated branch', () => {
  initTheme('dark', false);
  const h = harness(90), rootEntry = thought('a', 'Root');
  const inline = new InlineRewind(() => theme, async () => {}, () => {});
  try {
    const frame = inline.render(rootEntry, theme);
    h.document.addChild(frame); inline.bind(h.ui);
    inline.showDay('2026-10-10', [rootEntry, { ...thought('child', 'Saved orange'), root: 'a', parent: 'a', depth: 2, level: 2 }]);
    const rendered = frame.render(90).map(plain);
    assert.equal(rendered.filter(line => line.includes('Saved orange')).length, 1);
    assert.equal(rendered.filter(line => line.includes('Root')).length, 1);
    const redRight = rendered.find(line => line.includes('Root')).lastIndexOf('│');
    const orangeRight = rendered.find(line => line.includes('Saved orange')).lastIndexOf('│');
    assert.equal(redRight, orangeRight);
    assert.ok(rendered.find(line => line.includes('Saved orange')).startsWith('  '));
    assert.equal(inline.focus('a'), true);
    const composing = frame.render(90).map(plain).join('\n');
    assert.ok(composing.indexOf('Root') < composing.indexOf('ORANGE · reply to') &&
      composing.indexOf('ORANGE · reply to') < composing.indexOf('Saved orange'),
      'the live response sits directly under its parent, before older saved children');
    inline.showDay('2026-10-10', [rootEntry]);
    assert.equal(frame.render(90).map(plain).join('\n').includes('Saved orange'), false);
    inline.showDay('2026-10-10', [rootEntry, { ...thought('child', 'Saved orange'), root: 'a', parent: 'a', depth: 2, level: 2 }]);
    inline.reset();
    assert.match(frame.render(90).map(plain).join('\n'), /Saved orange/, 'a saved child remains after rewind ends');
    inline.showDay('2026-10-11', [thought('other', 'Another day')]);
    assert.match(frame.render(90).map(plain).join('\n'), /Saved orange/, 'changing days does not erase earlier transcript children');
  } finally { h.close(); }
});

test('extension keyboard and Enter save only one orange child under its red parent, without a model turn or revisit copy', async () => {
  initTheme('dark', false);
  const cwd = await mkdtemp(join(tmpdir(), 'chrono-inline-route-'));
  const h = harness(90, 30), entries = [], notices = [], commands = new Map(), handlers = new Map(), renderers = new Map();
  const pi = { events: { on() {}, emit() {} }, on: (name, fn) => handlers.set(name, fn),
    registerCommand: (name, value) => commands.set(name, value), registerEntryRenderer: (name, fn) => renderers.set(name, fn),
    appendEntry: (name, data) => { entries.push({ name, data }); const component = renderers.get(name)?.({ data }, {}, theme); if (component) h.document.addChild(component); h.ui.requestRender(); },
    sendUserMessage: () => assert.fail('a model prompt must never be sent') };
  chronomancer(pi);
  const ui = { theme, setWidget: (_key, factory) => { if (typeof factory === 'function') factory(h.ui, theme); },
    notify: text => notices.push(text), getEditorText: () => h.bottom.getText(), setEditorText: text => h.bottom.setText(text),
    onTerminalInput: listener => h.ui.addInputListener(listener) };
  const ctx = { mode: 'tui', hasUI: true, cwd, ui, sessionManager: { getSessionId: () => 'inline-test' },
    modelRegistry: { complete: () => assert.fail('the model must never be invoked') } };
  try {
    await handlers.get('session_start')({}, ctx);
    await commands.get('chronomancer').handler('', ctx);
    for (const text of ['A', 'B', 'C']) await handlers.get('input')({ source: 'interactive', text }, ctx);
    h.bottom.setText('red draft');
    await commands.get('rewind').handler('', ctx);
    assert.equal(entries.length, 3, 'rewind edits the original root component, not an appended revisit');
    h.ui.getFocusedComponent().handleInput('unsent C');
    h.send('\x1b[1;2A');
    for (let attempt = 0; attempt < 100 && h.ui.getFocusedComponent()?.parent?.id !== entries[1].data.id; attempt++)
      await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(h.ui.getFocusedComponent()?.parent?.id, entries[1].data.id, 'B is focused before checking its frame');
    assert.match(plain(h.document.render(90).join('\n')), /ORANGE · reply to/);
    assert.equal(h.document.render(90).map(plain).join('\n').includes('unsent C'), false, 'draft C is retained, but not displayed beneath selected B');
    h.ui.getFocusedComponent().handleInput('orange B');
    h.ui.getFocusedComponent().handleInput('\r');
    await new Promise(resolve => setTimeout(resolve, 30));
    const markdown = await readFile(join(cwd, 'chronomancer', `${localDay()}.md`), 'utf8');
    assert.match(markdown, /## \d{2}:\d{2}:\d{2}[\s\S]*orange B/);
    assert.equal((markdown.match(/orange B/g) ?? []).length, 1);
    assert.equal(entries.length, 3, 'orange is drawn beneath B, not duplicated at the transcript tail');
    assert.match(plain(h.document.render(90).join('\n')), /orange B/);
    assert.equal(h.bottom.getText(), 'red draft');
    h.send('\x1b[1;2S'); // A terminal can send an unrelated sequence; it must not create an entry.
    assert.equal(entries.length, 3);
    assert.equal(notices.some(text => /model|completion/i.test(text)), false);
  } finally { h.close(); await rm(cwd, { recursive: true, force: true }); }
});

test('passes alternate through saved branches only; skipped roots stay dormant and purple is never automatic', async () => {
  initTheme('dark', false);
  const cwd = await mkdtemp(join(tmpdir(), 'chrono-bounce-')), h = harness(90, 32);
  const appended = [], commands = new Map(), handlers = new Map(), renderers = new Map();
  let status = '', modelCalls = 0, inviteModel = false;
  const pi = { events: { on() {}, emit() {} }, on: (name, fn) => handlers.set(name, fn),
    registerCommand: (name, value) => commands.set(name, value), registerEntryRenderer: (name, fn) => renderers.set(name, fn),
    appendEntry: (name, data) => { appended.push({ name, data }); const component = renderers.get(name)?.({ data }, {}, theme); if (component) h.document.addChild(component); },
    sendUserMessage: () => assert.fail('navigation and saves must never send a model prompt') };
  chronomancer(pi);
  const ctx = { mode: 'tui', hasUI: true, cwd, ui: { theme,
    setWidget: (_key, factory) => { status = factory ? plain(factory(h.ui, theme).render(90).join(' ')) : ''; },
    notify() {}, getEditorText: () => h.bottom.getText(), setEditorText: text => h.bottom.setText(text),
    onTerminalInput: listener => h.ui.addInputListener(listener) },
    sessionManager: { getSessionId: () => 'bounce' }, model: { id: 'test-model' },
    modelRegistry: { hasConfiguredAuth: () => true,
      complete: async (_model, request) => {
        if (!inviteModel) assert.fail('purple needs explicit invitation');
        modelCalls += 1;
        assert.match(request.messages[0].content[0].text, /blue B/);
        return { content: [{ type: 'text', text: 'What changed for B?' }] };
      } } };
  const waitFor = async (label, predicate) => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.fail(`timed out waiting for ${label}; status: ${status}`);
  };
  const submit = async (text, nextStage) => {
    h.ui.getFocusedComponent().handleInput(text);
    h.ui.getFocusedComponent().handleInput('\r');
    await waitFor(nextStage, () => status.includes(nextStage));
  };
  try {
    await handlers.get('session_start')({}, ctx);
    await commands.get('chronomancer').handler('', ctx);
    for (const text of ['red A', 'red B', 'red C']) await handlers.get('input')({ source: 'interactive', text }, ctx);
    h.bottom.setText('an unsent red thought');
    h.send('\x1b[1;2A'); h.send('\x1b[1;2:3A');
    await waitFor('orange entry from red', () => status.includes('ORANGE 1/3'));
    assert.match(status, /ORANGE 1\/3 ↑ older/);
    h.send('\x1b[1;2A'); h.send('\x1b[1;2:3A');
    await waitFor('B', () => status.includes('ORANGE 2/3'));
    await submit('orange B', 'ORANGE 3/3');
    assert.equal(appended.length, 3, 'only red roots create transcript entries');
    h.send('\x1b[1;2A'); h.send('\x1b[1;2:3A');
    await waitFor('orange edge', () => status.includes('ORANGE end') && status.includes('YELLOW ready (1)'));
    assert.doesNotMatch(plain(h.document.render(90).join('\n')), /YELLOW · reply to/, 'reaching the edge does not bounce automatically');
    h.send('\x1b[1;2A'); h.send('\x1b[1;2:3A');
    assert.match(status, /ORANGE end/, 'repeating the vertical movement does not bounce');
    h.ui.getFocusedComponent().handleInput('unfinished orange draft');
    assert.match(plain(h.document.render(90).join('\n')), /unfinished orange draft/, 'the unsent orange draft is visible before bouncing');
    const aSlot = h.ui.getFocusedComponent();
    assert.equal(aSlot.parent.id, appended[0].data.id, 'the oldest orange editor belongs to red A');
    assert.equal(aSlot.getDraft(), 'unfinished orange draft');
    h.send('\x1b[1;2C'); h.send('\x1b[1;2:3C');
    await waitFor('yellow bounce', () => status.includes('YELLOW 1/1 ↓ newer'));
    assert.equal(aSlot.getDraft(), 'unfinished orange draft', 'the bounce retains the unsent orange draft');
    assert.match(plain(h.document.render(90).join('\n')), /YELLOW · reply to/);
    assert.equal(h.bottom.getText(), 'an unsent red thought');
    h.ui.getFocusedComponent().handleInput('unfinished yellow draft');
    const yellowSlot = h.ui.getFocusedComponent();
    h.send('\x1b[1;2D'); h.send('\x1b[1;2:3D');
    await waitFor('previous pass edge', () => status.includes('ORANGE end'));
    assert.equal(h.ui.getFocusedComponent(), aSlot, 'left restores the previous pass edge');
    assert.equal(aSlot.getDraft(), 'unfinished orange draft');
    // The persisted edge is also the place Neovim can restore from.
    const progress = await loadProgress(await connectJournal(join(cwd, 'chronomancer')));
    assert.equal(progress.state?.pass, 2);
    assert.equal(progress.state?.edge, true);
    h.send('\x1b[1;2C'); h.send('\x1b[1;2:3C');
    await waitFor('yellow return', () => status.includes('YELLOW 1/1'));
    assert.equal(h.ui.getFocusedComponent(), yellowSlot, 'right restores the live yellow editor');
    assert.equal(yellowSlot.getDraft(), 'unfinished yellow draft');
    yellowSlot.restore('');
    h.send('\x1b[114;3u'); h.send('\x1b[114;3:3u');
    await waitFor('red focus', () => h.ui.getFocusedComponent() === h.bottom);
    assert.match(plain(h.document.render(90).join('\n')), /YELLOW · reply to/, 'colored editor stays visible while red has focus');
    h.send('\x1b[114;3u'); h.send('\x1b[114;3:3u');
    await waitFor('yellow focus', () => h.ui.getFocusedComponent() !== h.bottom);
    await submit('yellow B', 'YELLOW end');
    assert.match(status, /GREEN ready \(1\)/);
    await commands.get('chronomancer').handler('bounce', ctx);
    await waitFor('green bounce', () => status.includes('GREEN 1/1 ↑ older'));
    assert.match(plain(h.document.render(90).join('\n')), /GREEN · reply to/);
    await submit('green B', 'GREEN end');
    assert.match(status, /BLUE ready \(1\)/);
    h.send('\x1b[1;2C'); h.send('\x1b[1;2:3C');
    await waitFor('blue bounce', () => status.includes('BLUE 1/1 ↓ newer'));
    await submit('blue B', 'BLUE end');
    assert.equal(modelCalls, 0, 'blue never invites the model automatically');
    inviteModel = true;
    await commands.get('chronomancer').handler('ask', ctx);
    assert.equal(modelCalls, 1, 'explicit ask invites exactly one question about the saved blue branch');
    assert.equal(appended.at(-1).name, 'chronomancer-question');
    h.send('\x1b[1;2D'); h.send('\x1b[1;2:3D');
    await waitFor('return from blue', () => status.includes('GREEN end'));
    h.send('\x1b[1;2C'); h.send('\x1b[1;2:3C');
    await waitFor('reenter blue', () => status.includes('BLUE 1/1'));
    assert.equal(aSlot.getDraft(), 'unfinished orange draft', 'later saved passes retain dormant drafts');
    h.send('\x1b[114;3u'); await waitFor('bottom after blue', () => h.ui.getFocusedComponent() === h.bottom);
    assert.equal(h.bottom.getText(), 'an unsent red thought');
    assert.equal(appended.filter(entry => entry.name === 'chronomancer-thought').length, 3,
      'no synthetic pass entries; the only purple entry was explicitly invited');
    const journal = await connectJournal(join(cwd, 'chronomancer'));
    const { entries } = await list(journal, localDay());
    assert.deepEqual(entries.map(e => e.depth), [1, 1, 2, 3, 4, 5, 1]);
    const branch = entries.filter(e => e.depth > 1);
    assert.deepEqual(branch.map(e => e.parent), [entries[1].id, branch[0].id, branch[1].id, branch[2].id]);
    assert.equal(entries.filter(e => e.root === entries[0].id).length, 1, 'A was skipped, not marked done');
    assert.equal(entries.filter(e => e.root === entries.at(-1).id).length, 1, 'C was skipped, not marked done');
    assert.deepEqual(passRoute(entries, 3), [branch[0].id]);
    await commands.get('rewind').handler('', ctx);
    assert.match(status, /BLUE end/, 'blue pauses rather than automatically restarting');
    await commands.get('rewind').handler('', ctx);
    assert.match(status, /ORANGE 1\/3/);
    assert.equal(aSlot.getDraft(), 'unfinished orange draft', 'rewinding retains the older unsent draft');
    h.send('\x1b[1;2A'); await waitFor('B again', () => status.includes('ORANGE 2/3'));
    h.send('\x1b[1;2A'); await waitFor('A again', () => status.includes('ORANGE 3/3'));
    assert.match(plain(h.document.render(90).join('\n')), /unfinished orange draft/, 'bouncing never discards an unsent colored draft');
    assert.equal(appended.filter(entry => entry.name === 'chronomancer-thought').length, 3,
      'a dormant root can be revisited without a copy');
    for (const width of [8, 20, 40, 90]) for (const line of h.document.render(width))
      assert.ok(visibleWidth(line) <= width, `branch overflow at ${width}`);
  } finally { h.close(); await rm(cwd, { recursive: true, force: true }); }
});
