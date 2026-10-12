import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = resolve(fileURLToPath(new URL('..', import.meta.url)));
test('Pi cold-loads the independent extension; RPC discovers Chronomancer and rewind without a model call', async () => {
  const agent = mkdtempSync(join(tmpdir(), 'pi-chronomancer-test-'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agent;
  try {
    const install = join(homedir(), '.pi/agent/install');
    const version = readFileSync(join(install, 'current-version'), 'utf8').trim();
    const loader = join(install, 'releases', version, 'node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js');
    const { loadExtensions } = await import(pathToFileURL(loader));
    const result = await loadExtensions([join(directory, 'extensions/index.ts')], agent);
    assert.deepEqual(result.errors, []);
    assert.equal(result.extensions[0].commands.has('chronomancer'), true);
    assert.equal(result.extensions[0].commands.has('rewind'), true);
    assert.equal(result.extensions[0].handlers.has('input'), true);
    const rpc = execFileSync('pi', ['--mode', 'rpc', '--no-session', '--offline', '--no-context-files', '--no-skills', '--no-prompt-templates', '--no-themes', '-e', directory], {
      encoding: 'utf8', input: '{"id":"commands","type":"get_commands"}\n',
      env: { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: '1' }, timeout: 20000,
    }).trim().split('\n').map(line => JSON.parse(line));
    const response = rpc.find(record => record.id === 'commands');
    assert.equal(response?.success, true);
    assert.ok(response.data.commands.some(command => command.name === 'chronomancer'));
    assert.ok(response.data.commands.some(command => command.name === 'rewind'));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agent, { recursive: true, force: true });
  }
});
