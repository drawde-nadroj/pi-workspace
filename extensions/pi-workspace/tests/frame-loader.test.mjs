import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root, source, theme, plain } from "./host.mjs";

const chunks = join(root, "@earendil-works/pi-coding-agent/dist/bundle/chunks");
const bundledLoader = readdirSync(chunks).find(name => /^jiti-static-loader-.*\.js$/.test(name));
assert.ok(bundledLoader, "test the loader shipped inside Pi, not a separate installed jiti version");
const { createJiti } = await import(pathToFileURL(join(chunks, bundledLoader)));
const { VIRTUAL_MODULES } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/core/extensions/virtual-modules.js")));
const frameSource = resolve(source, "../../packages/pi-frame");
const manifest = JSON.parse(readFileSync(join(frameSource, "package.json"), "utf8"));
const require = createRequire(import.meta.url);
// Match bundled Pi's loader, not the native-import defaults used by most render tests.
const loader = () => createJiti(import.meta.url, { moduleCache: false, tryNative: false, virtualModules: VIRTUAL_MODULES });

function fixture() {
  const temp = mkdtempSync(join(tmpdir(), "pi-workspace-frame-loader-"));
  const pkg = join(temp, "packages/pi-frame");
  const workspace = join(temp, "extensions/pi-workspace");
  mkdirSync(pkg, { recursive: true });
  mkdirSync(join(temp, "node_modules/@earendil-works"), { recursive: true });
  symlinkSync(pkg, join(temp, "node_modules/pi-embeddable-frame"), process.platform === "win32" ? "junction" : "dir");
  symlinkSync(resolve(root, "@earendil-works/pi-tui"), join(temp, "node_modules/@earendil-works/pi-tui"), process.platform === "win32" ? "junction" : "dir");
  cpSync(source, workspace, { recursive: true, filter: path => !path.startsWith(join(source, "tests")) });
  cpSync(resolve(source, "../../lib"), join(temp, "lib"), { recursive: true });
  for (const relative of ["extensions/pi-tasks", "packages/pi-ask"]) {
    const from = resolve(source, "../..", relative);
    cpSync(from, join(temp, relative), { recursive: true,
      filter: path => !/[/\\\\](node_modules|tests?|\.git)([/\\\\]|$)/.test(path.slice(from.length)) });
  }
  const install = () => {
    for (const file of ["package.json", ...manifest.files]) cpSync(join(frameSource, file), join(pkg, file));
  };
  install();
  return { temp, pkg, workspace, install };
}

// Reproduce the older, four-corner renderer while retaining functioning side
// labels. A root barrel cached before six-slot support silently drops centers.
async function cacheFourCornerRoot(f, mode) {
  const source = readFileSync(join(frameSource, "primitives.js"), "utf8");
  const start = 'export function frameRail({ theme, width, left = "", center = "", right = "", side = "top", color, textColor, surface }) {';
  assert.ok(source.includes(start));
  writeFileSync(join(f.pkg, "index.js"), source.replace(start, `${start}\n  center = ""; // legacy four-corner API`));
  const oldManifest = structuredClone(manifest);
  // Model a root-only conditional export map as well as cached renderer code.
  oldManifest.exports = oldManifest.exports["."];
  writeFileSync(join(f.pkg, "package.json"), JSON.stringify(oldManifest));
  // Bare imports also exercise Node's package-export map cache. Absolute file
  // imports alone bypass that lookup and are not a complete upgrade fixture.
  const fromHome = createRequire(join(f.workspace, "index.ts"));
  const nativeEntry = join(f.temp, "native-entry.mjs"), jitiEntry = join(f.temp, "old-extension.ts");
  writeFileSync(nativeEntry, 'export * from "pi-embeddable-frame";\n');
  writeFileSync(jitiEntry, 'export * from "pi-embeddable-frame";\n');
  const oldLoader = loader();
  const load = () => mode === "jiti" ? oldLoader.import(jitiEntry)
    : mode === "native-bare" ? import(pathToFileURL(nativeEntry).href)
    : mode === "require-bare" ? fromHome("pi-embeddable-frame")
    : mode === "native" ? import(pathToFileURL(join(f.pkg, "index.js")).href) : require(join(f.pkg, "index.js"));
  const cached = await load();
  assert.doesNotMatch(cached.frameRail({ width: 140, left: " Working ", center: " Session title ", right: " Sent 07:39 " }), /Session title/);
  f.install();
  // Deliberately keep package metadata old even though implementation files are
  // updated. This reproduces the observed subpath error without depending on
  // whether this test process happens to retain Node/Jiti's metadata cache.
  if (mode === "frozen-exports") writeFileSync(join(f.pkg, "package.json"), JSON.stringify(oldManifest));
  if (mode !== "jiti") assert.equal(await load(), cached, "the old root stays cached throughout the upgrade");
  return cached;
}

for (const mode of ["cold", "require", "native", "require-bare", "native-bare", "jiti", "frozen-exports"]) test(`Composer center labels survive ${mode} package loading across reloads`, async () => {
  const f = fixture();
  try {
    const cached = mode === "cold" ? undefined : await cacheFourCornerRoot(f, mode);
    for (let generation = 0; generation < 2; generation++) {
      const jiti = loader();
      if (mode === "frozen-exports") {
        for (const entry of ["extensions/pi-workspace/index.ts", "extensions/pi-tasks/index.ts", "packages/pi-ask/extensions/questions.ts"]) {
          assert.equal(typeof (await jiti.import(join(f.temp, entry))).default, "function", `${entry} must load with old package metadata`);
        }
      }
      const { composerMessageRail, composerBottomRail } = await jiti.import(join(f.workspace, "composer-style.ts"));
      const { FOOTER_DEFAULTS } = await jiti.import(join(f.workspace, "footer-state.ts"));
      const { appearanceDefaults } = await jiti.import(join(f.workspace, "appearance.ts"));
      let title = "Fix Pi Workspace Footer Session Display";
      const ctx = { cwd: "/work", model: { name: "Model" }, sessionManager: { getSessionName: () => title } };
      const workspace = { layout: structuredClone(FOOTER_DEFAULTS), tools: new Map(), prefs: { enabled: true, motion: "work" }, phase: "working",
        clock: { active: true, transitionAt: 0, timing: { startedAt: 0 } }, promptDepth: 0,
        railStatus: () => ({ text: "6 tools running", tone: "toolTitle", state: "tools" }),
        railRunElapsed: () => 67000, thinkingLevel: () => "high", lastUserSentAt: () => 1000,
        appearanceData: () => ({ cwd: ctx.cwd, model: "Model", session: title }), appearanceMode: "NORMAL" };
      for (const custom of [false, true]) {
        workspace.layout.appearance = custom ? appearanceDefaults(workspace.layout) : undefined;
        title = "Fix Pi Workspace Footer Session Display";
        let row = plain(composerMessageRail(theme, 140, workspace, 100000, title));
        assert.match(row, /6 tools running/);
        assert.match(row, /\d{2}:\d{2}:\d{2}/, "send time remains visible after rail prioritization");
        assert.ok(row.includes(title), `${mode}, custom=${custom}: missing recorded title in ${row}`);
        assert.ok(Math.abs(row.indexOf(title) + title.length / 2 - 70) <= 1, "title is centered");
        assert.match(plain(composerBottomRail(theme, 140, workspace, ctx, "NORMAL")), /NORMAL/);
        title = "Renamed session";
        row = plain(composerMessageRail(theme, 140, workspace, 100000, title));
        assert.ok(row.includes(title), "renames are read live, not a cached fallback label");
        if (custom) workspace.layout.appearance.elements.session.visible = false;
        else workspace.layout.railTitle = "off";
        assert.ok(!plain(composerMessageRail(theme, 140, workspace, 100000, title)).includes(title), "explicit title-off is respected");
        workspace.layout.railTitle = "on";
      }
      if (cached) assert.doesNotMatch(cached.frameRail({ width: 140, center: "still legacy" }), /still legacy/,
        "fix must not mutate or evict unrelated module namespaces");
    }
  } finally { await rm(f.temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

for (const warm of [false, true]) test(`Workspace's presentation API loads with ${warm ? "a pre-upgrade module cached" : "a cold bundled loader"}`, async () => {
  const f = fixture();
  let component, abort;
  try {
    if (warm) {
      // An older process has cached the passive-only root before the update.
      // Do not clear that cache: /reload does not always replace native JS modules.
      writeFileSync(join(f.pkg, "index.js"), `
        export const frameRail = () => "legacy rail";
        export const frameRows = ({rows}) => rows;
        export const paintFramePerimeter = rows => rows;
        export const statusPreset = () => ({});
      `);
      const oldManifest = structuredClone(manifest);
      delete oldManifest.exports["./presentation"];
      writeFileSync(join(f.pkg, "package.json"), JSON.stringify(oldManifest));
      const cached = require(join(f.pkg, "index.js"));
      assert.equal(cached.createFrameController, undefined);
      f.install();
      assert.equal(require(join(f.pkg, "index.js")), cached, "the old namespace really is still cached");
    }
    // Exercise Workspace's actual imports/constructors, including the picker demo.
    for (let generation = 0; generation < 2; generation++) {
      const jiti = loader();
      const { TaskPanel, taskPanelDefaults, taskPanelRows, taskDemo } = await jiti.import(join(f.workspace, "task-presentation.ts"));
      const panel = new TaskPanel(); panel.reset();
      const prefs = taskPanelDefaults();
      const rows = taskPanelRows(theme, 90, taskDemo("working"), prefs, { state: "working", active: false, elapsed: 0 });
      assert.ok(rows.some(row => plain(row).includes("Tasks")));
      assert.ok(rows.some(row => plain(row).includes("Refine task overview")));
      assert.ok(rows[0].includes("╭"), "new presentation uses fresh primitives, not the cached legacy root");
      const { chooseFooter } = await jiti.import(join(f.workspace, "footer-settings.ts"));
      const { FOOTER_DEFAULTS } = await jiti.import(join(f.workspace, "footer-state.ts"));
      const ctx = { ui: { custom: factory => new Promise(done => {
        component = factory({ terminal: { rows: 45 }, requestRender() {} }, theme, {}, done);
      }) } };
      abort = new AbortController();
      const picker = chooseFooter(ctx, structuredClone(FOOTER_DEFAULTS), () => {}, undefined, abort.signal);
      assert.ok(component);
      component.handleInput("\t");
      const demo = component.render(120).map(plain).join("\n");
      assert.match(demo, /Preview state/);
      assert.match(demo, /Refine task overview/);
      abort.abort(); await picker; component.dispose(); component = undefined;
    }
  } finally {
    abort?.abort(); component?.dispose();
    // Native namespaces cannot be evicted, but never point to a real user's files.
    await rm(f.temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
