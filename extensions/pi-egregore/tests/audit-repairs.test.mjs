import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jiti, source, plain, visibleWidth } from './host.mjs';
import { workspace } from './workspace-harness.mjs';
const { registerRecaps } = await jiti.import(join(source, 'recaps.ts'));

async function recapsFixture(config, generate) {
  const directory = await mkdtemp(join(tmpdir(), 'pi-recap-opt-in-'));
  if (config !== undefined) await writeFile(join(directory, 'pi-recaps.json'), config);
  const hooks = new Map(), commands = new Map(), entries = []; let calls = 0;
  const branch = [{ id: 'root', type: 'message', message: { role: 'user', content: 'Synthetic request', timestamp: 1000 } }];
  const ctx = { mode: 'tui', sessionManager: { getSessionId: () => 'fixture', getLeafId: () => 'root', getBranch: () => branch },
    ui: { notify() {}, select: async () => 'Turn on…', confirm: async () => false } };
  const api = { on: (name, fn) => hooks.set(name, fn), registerCommand: (name, command) => commands.set(name, command), registerEntryRenderer() {}, appendEntry: (type, data) => entries.push({ type, data }) };
  const recaps = registerRecaps(api, () => true, { directory, lock: async (_path, _signal, fn) => fn(), generate: async (...args) => { calls++; return generate ? generate(...args) : { text: 'Synthetic recap', input: 1, output: 1 }; } });
  hooks.get('session_start')({}, ctx);
  async function run(wait = true) {
    hooks.get('agent_start')({}, ctx);
    hooks.get('tool_execution_start')({ toolCallId: 't', toolName: 'read', args: { path: 'fixture' } });
    hooks.get('tool_execution_end')({ toolCallId: 't', result: { content: [{ type: 'text', text: 'Synthetic evidence' }] }, isError: false });
    hooks.get('agent_settled')({}, ctx); if (wait) await recaps.idle();
  }
  return { directory, ctx, recaps, commands, entries, run, get calls() { return calls; }, async close() { hooks.get('session_shutdown')(); await recaps.idle(); await rm(directory, { recursive: true, force: true }); } };
}

test('recap missing/off/malformed configuration never generates; explicit on/off is the single immediate authority', async () => {
  for (const config of [undefined, '{"enabled":false}', 'malformed', '{"enabled":"yes"}']) {
    const h = await recapsFixture(config);
    try {
      await h.run(); assert.equal(h.calls, 0); assert.equal(h.entries.length, 0);
      await h.recaps.open(h.ctx); await h.run(); assert.equal(h.calls, 0, 'declining consent does not enable');
      await h.commands.get('recaps').handler('on', h.ctx); await h.run(); assert.equal(h.calls, 1);
      assert.equal(JSON.parse(await readFile(join(h.directory, 'pi-recaps.json'), 'utf8')).enabled, true);
      await h.commands.get('recaps').handler('off', h.ctx); await h.run(); assert.equal(h.calls, 1);
    } finally { await h.close(); }
  }
});

test('recap off aborts in-flight inference and prevents queued inference from starting', async () => {
  let began, aborted = false; const started = new Promise(resolve => { began = resolve; });
  const h = await recapsFixture('{"enabled":true}', (_body, _ctx, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('Cancelled')); }, { once: true }); began();
  }));
  try {
    await h.run(false); await started;
    await h.run(false); await h.commands.get('recaps').handler('off', h.ctx); await h.recaps.idle();
    assert.equal(aborted, true); assert.equal(h.calls, 1, 'queued recap never reaches generation');
    assert.equal(JSON.parse(await readFile(join(h.directory, 'pi-recaps.json'), 'utf8')).enabled, false);
  } finally { await h.close(); }
});

test('narrow room selector exposes every destination through keyboard and pointer without changing preferences', async () => {
  const names = ['Input', 'Tasks', 'Ask', 'Transcript', 'More settings', 'General'];
  for (const width of [24, 40, 62]) {
    const h = workspace(undefined, width, 40), before = JSON.stringify(h.latest), draft = h.editor.getText();
    try {
      for (const [index, name] of names.entries()) {
        h.click('[Rooms…]');
        for (let i = 0; i < 6; i++) h.panel.handleInput('\x1b[A');
        for (let i = 0; i < index; i++) h.panel.handleInput('\x1b[B');
        const rows = h.rows(), y = rows.findIndex(row => row.includes('› ' + name));
        assert.ok(y >= 0, `selected room ${name} visible at ${width}`);
        h.clickAt(visibleWidth(rows[y].slice(0, rows[y].indexOf(name))), y);
        assert.ok(h.rows()[1].includes(name) || width < 40, 'current room remains named');
        assert.equal(JSON.stringify(h.latest), before); assert.equal(h.editor.getText(), draft);
        assert.ok(h.panel.render(width).every(row => visibleWidth(row) <= width));
      }
      h.panel.handleInput('\x12'); assert.match(h.rows().join('\n'), /Choose a room/);
      for (let i = 0; i < 6; i++) h.panel.handleInput('\x1b[A');
      h.panel.handleInput('\r'); assert.match(h.rows()[1], /Input/);
    } finally { h.panel.handleInput('\x13'); await h.pending; }
  }
});
