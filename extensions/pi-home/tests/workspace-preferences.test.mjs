import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jiti, source } from "./host.mjs";
const { loadWorkspacePrefs } = await jiti.import(join(source, "workspace-preferences.ts"));

test("legacy appearance, Ask and transcript migrate on read without altering the old file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "suite-workspace-"));
  try {
    const legacy = '{"style":"powerline","questionLabels":"hierarchy","ask":{"version":99},"transcript":{"version":99}}\n';
    writeFileSync(join(dir, "pi-footer.json"), legacy);
    const prefs = await loadWorkspacePrefs(dir);
    assert.equal(prefs.style, "powerline"); assert.equal(prefs.displayName, "jordan");
    assert.equal(prefs.density, "spaced"); assert.equal(prefs.ask.version, 99); assert.equal(prefs.transcript.version, 99);
    writeFileSync(join(dir, "pi-workspace.json"), '{"version":1,"displayName":"Alex 界面","density":"compact"}');
    const current = await loadWorkspacePrefs(dir);
    assert.equal(current.displayName, "Alex 界面"); assert.equal(current.density, "compact");
    writeFileSync(join(dir, "pi-workspace.json"), '{"version":2}');
    await assert.rejects(loadWorkspacePrefs(dir), /Unsupported workspace settings version/);
    assert.equal(readFileSync(join(dir, "pi-footer.json"), "utf8"), legacy);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
