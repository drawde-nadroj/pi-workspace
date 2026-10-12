import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const directory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const jiti = createJiti(import.meta.url);
const { default: chronomancer } = await jiti.import(join(directory, 'extensions/index.ts'));
const { createJournal, list, localDay, saveProgress, store } = await jiti.import(join(directory, 'extensions/journal.ts'));

// Pi's actual input contract: returning handled suppresses the agent run.
test('a Neovim pass on an older day resumes while Pi red capture still targets today', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chronomancer-resume-'));
  try {
    const journal = await createJournal(join(cwd, 'chronomancer'));
    const oldDay = '2024-01-02', red = await store(journal, oldDay, 'Past red');
    await saveProgress(journal, { day: oldDay, pass: 2, route: [red.id], index: 1, edge: false }, null);
    const commands = new Map(), handlers = new Map(), entries = [], signals = [];
    chronomancer({ events: { on() {}, emit: (...args) => signals.push(args) },
      on: (name, handler) => handlers.set(name, handler),
      registerCommand: (name, command) => commands.set(name, command),
      registerEntryRenderer() {}, appendEntry: (_name, data) => entries.push(data),
      sendUserMessage: () => assert.fail('silent capture never sends a model prompt') });
    const ctx = { cwd, mode: 'tui', hasUI: true,
      ui: { theme: {}, setWidget() {}, notify() {}, getEditorText: () => '', setEditorText() {} },
      sessionManager: { getSessionId: () => 'resume' } };
    await commands.get('chronomancer').handler('', ctx);
    assert.ok(entries.some(entry => entry.id === red.id && entry.day === oldDay), 'old selected thought restored');
    assert.equal(signals.at(-1)[1].day, localDay(), 'red capture day remains today');
    assert.deepEqual((await list(journal, oldDay)).entries.map(entry => entry.id), [red.id]);
    assert.deepEqual(await handlers.get('input')({ source: 'interactive', text: 'Today red' }, ctx), { action: 'handled' });
    assert.equal((await list(journal, localDay())).entries[0].body, 'Today red');
    assert.deepEqual((await list(journal, oldDay)).entries.map(entry => entry.id), [red.id]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('normal-looking send creates one persisted red entry and no agent response', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chronomancer-send-'));
  const entries = [], notices = [], handlers = new Map(), commands = new Map(), renderers = new Map(), signals = [];
  const pi = {
    events: { on() {}, emit: (...args) => signals.push(args) },
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    registerEntryRenderer: (name, render) => renderers.set(name, render),
    appendEntry: (name, data) => entries.push({ name, data }),
    sendUserMessage: () => assert.fail('silent capture must not send a model prompt'),
  };
  chronomancer(pi);
  const ui = { setWidget() {}, notify: (message) => notices.push(message), getEditorText: () => '', setEditorText: () => {}, theme: {},
    select: () => assert.fail('opening the local journal must not prompt'),
    input: () => assert.fail('opening the local journal must not require a path') };
  const ctx = { cwd, mode: 'tui', hasUI: true, ui,
    sessionManager: { getSessionId: () => 'same-session' },
    modelRegistry: { complete: () => assert.fail('no completion before explicit ask') } };
  try {
    assert.ok(commands.has('rewind'), 'standalone /rewind is registered');
    await commands.get('rewind').handler('', ctx);
    assert.match(notices.at(-1), /Enter Chronomancer mode first/);
    await commands.get('chronomancer').handler('', ctx);
    const marker = await readFile(join(cwd, 'chronomancer', '.chronomancer.json'), 'utf8');
    await commands.get('chronomancer').handler('', ctx);
    assert.equal(await readFile(join(cwd, 'chronomancer', '.chronomancer.json'), 'utf8'), marker, 'reconnect without recreating');
    const result = await handlers.get('input')({ source: 'interactive', text: 'A red thought' }, ctx);
    assert.deepEqual(result, { action: 'handled' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'chronomancer-thought');
    assert.equal(entries[0].data.body, 'A red thought');
    assert.equal(entries[0].data.depth, 1);
    assert.ok(renderers.has('chronomancer-thought'));
    const day = entries[0].data.day;
    const second = await handlers.get('input')({ source: 'interactive', text: 'Another red thought' }, ctx);
    assert.deepEqual(second, { action: 'handled' });
    assert.equal(entries.length, 2);
    assert.match(await readFile(join(cwd, 'chronomancer', `${day}.md`), 'utf8'), /A red thought/);
    assert.ok(signals.some(([name, value]) => name === 'pi-chronomancer:mode' && value.active && value.sessionId === 'same-session'));
    assert.equal(day, localDay(), 'default opens today, not the latest saved day');
    await commands.get('rewind').handler('', ctx);
    assert.equal(entries.length, 3, 'rewind displays existing entry without a second journal write');
    assert.equal(entries[2].data.visit, true);
    assert.equal(entries[2].data.id, entries[1].data.id, 'first rewind revisits latest red thought');
    await commands.get('rewind').handler('', ctx);
    assert.equal(entries[3].data.id, entries[0].data.id, 'next rewind goes to older red thought');
    await commands.get('rewind').handler('', ctx);
    assert.equal(entries.length, 4, 'the edge does not add an entry or restart rewind');
    await commands.get('chronomancer').handler('bounce', ctx);
    assert.match(notices.at(-1), /No saved YELLOW branches yet/);
    await commands.get('chronomancer').handler('rewind', ctx);
    assert.equal(entries.length, 4, 'without saved branches, repeated rewind stays at the edge');
    const saved = await readFile(join(cwd, 'chronomancer', `${day}.md`), 'utf8');
    assert.equal(saved.split('Another red thought').length - 1, 1, 'revisits do not change the journal');
    await handlers.get('input')({ source: 'interactive', text: 'New red thought during rewind' }, ctx);
    assert.equal(entries[4].data.depth, 1);
    assert.equal(entries[4].data.visit, undefined);
    await commands.get('rewind').handler('', ctx);
    assert.equal(entries[5].data.id, entries[4].data.id, 'a new red capture restarts rewind at the newest root');
    await commands.get('chronomancer').handler('off', ctx);
    await commands.get('rewind').handler('', ctx);
    assert.equal(entries.length, 6, 'rewind cannot run outside Chronomancer mode');
    assert.match(notices.at(-1), /Enter Chronomancer mode first/);
    await commands.get('chronomancer').handler('on', ctx);
    await commands.get('chronomancer').handler('day 2024-01-02', ctx);
    await commands.get('chronomancer').handler('', ctx);
    assert.equal(signals.at(-1)[1].day, localDay(), 'opening the directory again returns to today');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
