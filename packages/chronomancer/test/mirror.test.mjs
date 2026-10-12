import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createJiti } from 'jiti';

const directory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const jiti = createJiti(import.meta.url);
const { default: chronomancer } = await jiti.import(join(directory, 'extensions/index.ts'));
const { observeJournal } = await jiti.import(join(directory, 'extensions/journal-observer.ts'));
const { connectJournal, createJournal, list, localDay, store } = await jiti.import(join(directory, 'extensions/journal.ts'));
const { theme, initTheme, plain, visibleWidth } = await import(pathToFileURL(join(directory, '../../extensions/pi-home/tests/host.mjs')));

async function until(check, description) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(20);
  }
  assert.fail(`Timed out: ${description}`);
}

test('journal observer deduplicates atomic saves and reconciles without filesystem events', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chronomancer-observer-'));
  let close;
  try {
    const journal = await createJournal(join(cwd, 'chronomancer'));
    const updates = [], errors = [];
    close = await observeJournal(journal, update => updates.push(update), error => errors.push(error),
      { watch: false, pollMs: 30 });
    assert.deepEqual(updates[0].entries, []);
    const red = await store(journal, localDay(), 'Root on the right');
    await until(() => updates.some(update => update.added.some(e => e.id === red.id)), 'red propagated by polling');
    const orange = await store(journal, localDay(), 'Orange from Pi', red.id);
    await until(() => updates.some(update => update.added.some(e => e.id === orange.id)), 'orange propagated by polling');
    await delay(100);
    assert.deepEqual(updates.flatMap(update => update.added.map(e => e.id)), [red.id, orange.id]);
    assert.equal(updates.at(-1).entries.find(e => e.id === orange.id).parent, red.id);
    const path = join(journal.directory, `${localDay()}.md`);
    await writeFile(path, (await readFile(path, 'utf8')).replace('Root on the right', 'Revised root on the right'));
    await until(() => updates.some(update => update.changed.some(e => e.id === red.id)), 'same-ID external edit reconciled');
    assert.deepEqual(errors, []);
    close(); close();
    await store(journal, localDay(), 'After observer closed');
    const length = updates.length;
    await delay(100);
    assert.equal(updates.length, length, 'closing stops all refreshes');
  } finally { close?.(); await rm(cwd, { recursive: true, force: true }); }
});

test('Pi mirror shows external thoughts without hijacking agent input or writing Pi session entries', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chronomancer-mirror-'));
  const commands = new Map(), handlers = new Map(), widgets = new Map(), appended = [], notices = [];
  initTheme('dark', false);
  const pi = {
    events: { on() {}, emit() {} }, on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, value) => commands.set(name, value), registerEntryRenderer() {},
    appendEntry: (...args) => appended.push(args),
    sendUserMessage: () => assert.fail('mirroring must not send a model prompt'),
  };
  chronomancer(pi);
  const ctx = { cwd, mode: 'tui', hasUI: true, ui: {
    theme, setWidget: (name, factory) => widgets.set(name, factory),
    notify: (message) => notices.push(message), getEditorText: () => 'An unsent agent draft',
    setEditorText: () => assert.fail('mirroring must not replace the native agent draft'),
  }, sessionManager: { getSessionId: () => 'agent-session' },
    modelRegistry: { complete: () => assert.fail('mirroring must not call a model') } };
  try {
    await commands.get('chronomancer').handler('mirror', ctx);
    const journal = await connectJournal(join(cwd, 'chronomancer'));
    assert.deepEqual(await handlers.get('input')({ source: 'interactive', text: 'Question for agent' }, ctx),
      { action: 'continue' }, 'ordinary Pi input still goes to the agent');
    assert.equal((await list(journal, localDay())).entries.length, 0);
    const instant = new Date(), day = localDay(instant);
    const red = await store(journal, day, 'A mirrored red thought', undefined, instant);
    await until(() => widgets.get('chronomancer-mirror')?.({}, theme).render(90).map(plain).join('\n').includes('A mirrored red thought'),
      'external red thought appears in Pi widget');
    const orange = await store(journal, day, 'An orange child', red.id, instant);
    await until(() => widgets.get('chronomancer-mirror')?.({}, theme).render(90).map(plain).join('\n').includes('An orange child'),
      'external orange child appears in Pi widget');
    const lines = widgets.get('chronomancer-mirror')({}, theme).render(90).map(plain);
    assert.match(lines[1], /↳ RED · A mirrored red thought/, 'parent remains visible in the mirror');
    const dayPath = join(journal.directory, `${day}.md`);
    await writeFile(dayPath, (await readFile(dayPath, 'utf8')).replace('A mirrored red thought', 'Revised mirrored red thought'));
    await until(() => widgets.get('chronomancer-mirror')?.({}, theme).render(90).map(plain).join('\n')
      .includes('Revised mirrored red thought'), 'same-ID parent edit refreshes breadcrumb');
    for (const width of [12, 20, 40, 90]) {
      for (const line of widgets.get('chronomancer-mirror')({}, theme).render(width))
        assert.ok(visibleWidth(line) <= width, `mirror overflows ${width}`);
    }
    assert.equal(appended.length, 0, 'journal mirror never appends to the Pi chat session');
    assert.equal(ctx.ui.getEditorText(), 'An unsent agent draft');
    await commands.get('chronomancer').handler('mirror off', ctx);
    assert.equal(widgets.get('chronomancer-mirror'), undefined);
    await store(journal, localDay(), 'Saved after mirror off');
    await delay(120);
    assert.equal(widgets.get('chronomancer-mirror'), undefined);
    assert.equal(notices.filter(s => s.includes('Journal mirror:')).length, 0);
  } finally {
    handlers.get('session_shutdown')?.({}, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});
