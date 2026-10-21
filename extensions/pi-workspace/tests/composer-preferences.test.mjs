import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jiti, source } from "./host.mjs";
const { loadComposerPreferences, saveComposerPreferences, COMPOSER_SETTINGS, LEGACY_COMPOSER_SETTINGS } = await jiti.import(join(source, "composer-preferences.ts"));
const { DEFAULTS } = await jiti.import(join(source, "state.ts"));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "pi-composer-prefs-"));
  return { directory, close: () => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

test("Composer reads legacy preferences without writing, then explicitly saves only its new authority", async () => {
  const f = fixture();
  try {
    const legacy = '{ "enabled": false, "motion": "off", "icons": "plain", "theme": false, "look": "biolume" }\n';
    const workspace = '{"version":1,"sentName":"Existing identity"}\n';
    writeFileSync(join(f.directory, LEGACY_COMPOSER_SETTINGS), legacy);
    writeFileSync(join(f.directory, "pi-workspace.json"), workspace);
    const prefs = await loadComposerPreferences(f.directory);
    assert.equal(prefs.enabled, false); assert.equal(prefs.icons, "plain"); assert.equal(prefs.motion, "off");
    assert.equal(prefs.look, "composer");
    assert.equal(existsSync(join(f.directory, COMPOSER_SETTINGS)), false);
    await saveComposerPreferences({ ...prefs, enabled: true }, f.directory);
    assert.equal((await loadComposerPreferences(f.directory)).enabled, true);
    assert.equal(readFileSync(join(f.directory, LEGACY_COMPOSER_SETTINGS), "utf8"), legacy);
    assert.equal(readFileSync(join(f.directory, "pi-workspace.json"), "utf8"), workspace);
  } finally { await f.close(); }
});

test("new Composer authority wins and malformed new data never silently falls back to legacy", async () => {
  const f = fixture();
  try {
    assert.deepEqual(await loadComposerPreferences(f.directory), DEFAULTS);
    assert.equal(existsSync(join(f.directory, COMPOSER_SETTINGS)), false);
    writeFileSync(join(f.directory, LEGACY_COMPOSER_SETTINGS), JSON.stringify({ ...DEFAULTS, enabled: false }));
    writeFileSync(join(f.directory, COMPOSER_SETTINGS), JSON.stringify({ ...DEFAULTS, enabled: true }));
    assert.equal((await loadComposerPreferences(f.directory)).enabled, true);
    writeFileSync(join(f.directory, COMPOSER_SETTINGS), "broken JSON");
    await assert.rejects(loadComposerPreferences(f.directory), SyntaxError);
    assert.equal(readFileSync(join(f.directory, COMPOSER_SETTINGS), "utf8"), "broken JSON");
  } finally { await f.close(); }
});
