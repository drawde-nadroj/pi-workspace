import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jiti, source } from "./host.mjs";
const { loadWorkspacePrefs, workspaceSnapshot } = await jiti.import(join(source, "workspace-preferences.ts"));
const { saveFooter } = await jiti.import(join(source, "footer.ts"));
const { FOOTER_DEFAULTS } = await jiti.import(join(source, "footer-state.ts"));

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
    const futureAppearance = '{"version":1,"appearance":{"version":2,"elements":{}}}';
    writeFileSync(join(dir, "pi-workspace.json"), futureAppearance);
    await assert.rejects(loadWorkspacePrefs(dir), /Unsupported Composer appearance version/);
    assert.equal(readFileSync(join(dir, "pi-workspace.json"), "utf8"), futureAppearance);
    writeFileSync(join(dir, "pi-workspace.json"), '{"version":2}');
    await assert.rejects(loadWorkspacePrefs(dir), /Unsupported workspace settings version/);
    assert.equal(readFileSync(join(dir, "pi-footer.json"), "utf8"), legacy);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("future Tasks section/presentation versions fail before normalization and preserve either authority byte-for-byte", async () => {
  for (const name of ["pi-workspace.json", "pi-footer.json"]) for (const tasks of [{ version: 2, title: "Future" }, { version: 1, presentation: { version: 2 } }]) {
    const dir = mkdtempSync(join(tmpdir(), "suite-future-tasks-"));
    try {
      const bytes = JSON.stringify({ version: 1, tasks }) + "\n", path = join(dir, name);
      writeFileSync(path, bytes);
      await assert.rejects(loadWorkspacePrefs(dir), /Unsupported Tasks (appearance|presentation) version/);
      assert.equal(readFileSync(path, "utf8"), bytes);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("Save rejects a changed workspace or legacy file and leaves external changes untouched", async () => {
  const dir = mkdtempSync(join(tmpdir(), "suite-workspace-save-"));
  const path = join(dir, "pi-workspace.json");
  try {
    const initial = await workspaceSnapshot(dir);
    writeFileSync(path, '{"version":1,"displayName":"Other session"}\n');
    await assert.rejects(saveFooter(path, FOOTER_DEFAULTS, initial), /changed in another session/);
    assert.match(readFileSync(path, "utf8"), /Other session/);
    const current = await workspaceSnapshot(dir);
    writeFileSync(join(dir, "pi-footer.json"), '{"style":"quiet"}');
    await assert.rejects(saveFooter(path, FOOTER_DEFAULTS, current), /changed in another session/);
    assert.match(readFileSync(path, "utf8"), /Other session/);
    await saveFooter(path, FOOTER_DEFAULTS, await workspaceSnapshot(dir));
    assert.equal(JSON.parse(readFileSync(path, "utf8")).version, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
