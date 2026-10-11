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
const { localDay } = await jiti.import(join(directory, 'extensions/journal.ts'));

// Pi's actual input contract: returning handled suppresses the agent run.
test('normal-looking send creates one persisted red entry and no agent response', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chronomancer-send-'));
  const entries = [], handlers = new Map(), commands = new Map(), renderers = new Map(), signals = [];
  const pi = {
    events: { on() {}, emit: (...args) => signals.push(args) },
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    registerEntryRenderer: (name, render) => renderers.set(name, render),
    appendEntry: (name, data) => entries.push({ name, data }),
    sendUserMessage: () => assert.fail('silent capture must not send a model prompt'),
  };
  chronomancer(pi);
  const ui = { setWidget() {}, notify() {}, getEditorText: () => '', setEditorText: () => {}, theme: {},
    select: () => assert.fail('opening the local journal must not prompt'),
    input: () => assert.fail('opening the local journal must not require a path') };
  const ctx = { cwd, mode: 'tui', hasUI: true, ui,
    sessionManager: { getSessionId: () => 'same-session' },
    modelRegistry: { complete: () => assert.fail('no completion before explicit ask') } };
  try {
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
    assert.match(await readFile(join(cwd, 'chronomancer', `${day}.md`), 'utf8'), /A red thought/);
    assert.ok(signals.some(([name, value]) => name === 'pi-chronomancer:mode' && value.active && value.sessionId === 'same-session'));
    assert.equal(day, localDay(), 'default opens today, not the latest saved day');
    await commands.get('chronomancer').handler('rewind', ctx);
    assert.equal(entries.length, 2, 'rewind revisits existing entry without a second journal write');
    assert.equal(entries[1].data.visit, true);
    assert.equal(entries[1].data.id, entries[0].data.id);
    await commands.get('chronomancer').handler('day 2024-01-02', ctx);
    await commands.get('chronomancer').handler('', ctx);
    assert.equal(signals.at(-1)[1].day, localDay(), 'opening the directory again returns to today');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
