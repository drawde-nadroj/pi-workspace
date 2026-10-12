import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { jiti, source, root, initTheme, theme, visibleWidth, plain, kb } from "./host.mjs";
const state = await jiti.import(join(source, "footer-state.ts"));
const { FOOTER_DEFAULTS: defaults, OPTIONS, FOOTER_ENTRY, footerPrefs, parseGit, gitLabel, ActivityClock, activityParts, stamp, clean } = state;
const { footerRows, contextText, timingRows } = await jiti.import(join(source, "footer-view.ts"));
const { registerFooter, saveFooter } = await jiti.import(join(source, "footer.ts"));
const { chooseFooter, OTHER_OPTIONS } = await jiti.import(join(source, "footer-settings.ts"));
const { RunClock, DEFAULTS } = await jiti.import(join(source, "state.ts"));
import { workspace } from "./workspace-harness.mjs";
const { createEventBus } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/core/event-bus.js")));
const { DOCK } = await jiti.import(join(source, "../../lib/home-dock.ts"));
const data = { cwd: "/very/long/界面/project/with/é/and/many/components", model: "Model Name v2", thinking: "high", session: "Website redesign 界面", usage: { tokens: 84000, contextWindow: 200000, percent: 42 }, git: { branch: "feature/very-long-branch", staged: 2, changed: 3, untracked: 1, conflicts: 1, ahead: 2, behind: 1 } };
const wait = ms => new Promise(r => setTimeout(r, ms));

test("footer preferences validate every field; schema round trips", () => {
  assert.deepEqual(footerPrefs(null), defaults);
  assert.deepEqual(footerPrefs({ style: "bad", color: 7 }), defaults);
  for (const [key, values] of Object.entries(OPTIONS)) for (const value of values) assert.equal(footerPrefs({ [key]: value })[key], value);
  assert.equal(clean("title\x1b[31m\n\u202ename"), "title  name");
});

test("all styles, themes, orders, widths, Unicode and colors stay within terminal columns", () => {
  for (const name of ["dark", "light"]) {
    initTheme(name, false);
    for (const style of OPTIONS.style) for (const icons of OPTIONS.icons) for (const color of OPTIONS.color) {
      for (const topOrder of OPTIONS.topOrder) {
        for (const width of [1, 2, 5, 8, 12, 20, 32, 40, 60, 80, 100, 120, 180]) {
          const rows = footerRows({ ...defaults, layout: "ordered", style, icons, color, topOrder }, data, theme, width);
          assert.equal(rows.length, 2);
          for (const row of rows) assert.ok(visibleWidth(row) <= width, `${style}/${color}/${width}: ${visibleWidth(row)} ${plain(row)}`);
          if (width >= 40) assert.match(plain(rows[1]), /42%/);
          if (width >= 60) { assert.match(plain(rows[0]), /!1/); assert.match(plain(rows[1]), /high/); }
        }
      }
    }
    for (const bottomOrder of OPTIONS.bottomOrder) assert.match(plain(footerRows({ ...defaults, layout: "ordered", bottomOrder }, data, theme, 80)[1]), /42%/);
  }
  initTheme("dark", false);
  const wide = footerRows(defaults, data, theme, 180).map(plain).join(" ");
  assert.match(wide, /84k\/200k/); assert.match(wide, /Model Name v2/); assert.doesNotMatch(wide, /think /);
  assert.equal(footerRows(defaults, data, theme, 0).length, 0);
});

test("unknown context is not zero; percentage clamps only the bar; adaptive counts and styles", () => {
  assert.equal(contextText(defaults, undefined, 120), "—");
  assert.equal(contextText(defaults, { percent: null }, 120), "—");
  assert.match(contextText(defaults, data.usage, 120), /84k\/200k/);
  assert.doesNotMatch(contextText(defaults, data.usage, 80), /84k/);
  assert.match(contextText({ ...defaults, effect: "classic" }, { percent: 120 }, 80), /██████████ 120%/);
  for (const bar of OPTIONS.bar) assert.ok(contextText({ ...defaults, bar }, data.usage, 80).endsWith("42%"));
  assert.equal(contextText(defaults, data.usage, 20), "42%");
});

test("Git parser handles rename source, overlaps, conflicts, detached/unborn and upstream counts", () => {
  const g = parseGit("# branch.oid abcdef1234\0# branch.head main\0# branch.ab +2 -1\0" +
    "1 MM N... 100644 100644 100644 a b file\0" +
    "2 R. N... 100644 100644 100644 a b R100 destination\0? source-looking-like-status\0" +
    "? new\nname\0u UU N... 100644 100644 100644 100644 a b c conflict\0");
  assert.deepEqual(g, { branch: "main", staged: 2, changed: 1, untracked: 1, conflicts: 1, ahead: 2, behind: 1, detached: false });
  assert.equal(gitLabel(g, defaults), "main !1 +2 ~1 ?1 ↑2 ↓1");
  assert.match(gitLabel(g, { ...defaults, gitLabels: "labels" }), /staged:2 changed:1 new:1/);
  assert.equal(parseGit("# branch.oid abcdef1234\0# branch.head (detached)\0").branch, "@abcdef1");
  assert.equal(parseGit("# branch.oid (initial)\0# branch.head main\0").branch, "main");
  assert.equal(parseGit("1 .M S..U 160000 160000 160000 a b submodule\0").changed, 1);
});

test("real Git fixtures: filenames, rename records, untracked files and ahead/behind", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-footer-git-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  try {
    git("init", "-b", "main"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test"); git("config", "commit.gpgsign", "false");
    writeFileSync(join(dir, "file"), "one\n"); git("add", "."); git("commit", "-m", "initial");
    git("branch", "upstream"); git("branch", "--set-upstream-to", "upstream");
    writeFileSync(join(dir, "file"), "two\n"); git("commit", "-am", "second");
    git("mv", "file", "new name"); writeFileSync(join(dir, "new name"), "three\n");
    mkdirSync(join(dir, "newdir")); writeFileSync(join(dir, "newdir", "a"), "x"); writeFileSync(join(dir, "newdir", "b\nline"), "x");
    const g = parseGit(git("status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"));
    assert.equal(g.staged, 1); assert.equal(g.changed, 1); assert.equal(g.untracked, 2); assert.equal(g.ahead, 1); assert.equal(g.behind, 0);
    git("checkout", "--detach"); assert.match(parseGit(git("status", "--porcelain=v2", "--branch", "-z")).branch, /^@[a-f0-9]{7}$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("activity counts whole runs, pauses nested user dialogs, and never invents resumed gaps", () => {
  const c = new ActivityClock(1000);
  assert.equal(c.begin(2000), true); assert.equal(c.begin(3000), false);
  c.pause(4000); c.pause(5000); c.resume(6000);
  assert.equal(c.total(7000), 2000);
  assert.equal(c.runElapsed(7000), 2000);
  assert.equal(c.waiting, true);
  assert.match(activityParts(defaults, c, 7000).join(" "), /waiting for you/);
  c.resume(8000); assert.equal(c.total(9000), 3000);
  assert.equal(c.waiting, false);
  assert.match(activityParts(defaults, c, 9000).join(" "), /working 3s/);
  assert.equal(c.settle(10000, "done"), true); assert.equal(c.settle(11000, "done"), false);
  assert.equal(c.data.lastRunMs, 4000, "last run excludes four seconds of user wait"); assert.equal(c.total(50000), 4000);
  assert.equal(c.data.lastRunBasis, "active");
  const resumed = new ActivityClock(); resumed.restore(c.snapshot(50000), 90000);
  assert.equal(resumed.total(100000), 4000); assert.equal(resumed.data.partial, false);
  c.begin(11000); const interrupted = c.snapshot(13000);
  resumed.restore(interrupted, 100000); assert.equal(resumed.running, false); assert.equal(resumed.total(200000), 6000); assert.equal(resumed.data.partial, true);
  assert.match(activityParts(defaults, resumed, 200000).join(" "), /active ≥6s$/);
  resumed.begin(201000); resumed.settle(202000, "stopped");
  assert.match(activityParts(defaults, resumed, 202000).join(" "), /stopped 1s/);
  const legacy = new ActivityClock(); legacy.restore({ trackedSince: 1000, totalMs: 4000, partial: false,
    lastRunMs: 8000, lastOutcome: "done" }, 100000);
  assert.equal(legacy.data.lastRunMs, undefined, "legacy wall duration must not be mislabeled as active time");
  for (const width of [1, 8, 20, 40, 80, 120]) for (const row of timingRows(activityParts(defaults, resumed, 202000), theme, width)) assert.ok(visibleWidth(row) <= width);
});

test("timestamps show unknown, local clock, date for older replies, or relative age", () => {
  const now = new Date(2026, 5, 15, 14, 30).valueOf();
  assert.equal(stamp(undefined, "24h", now), "—");
  assert.match(stamp(now, "24h", now), /14:30/);
  assert.match(stamp(now, "12h", now), /02:30|2:30/);
  assert.equal(stamp(now - 62000, "relative", now), "1m 2s ago");
  assert.match(stamp(now - 86400000, "24h", now), /Jun|6/);
});

function mouse(y, type = "click") { return { type, button: "left", x: 8, y, screenX: 8, screenY: y, width: 100, height: 25, shift: false, alt: false, ctrl: false }; }

test("settings preview honors context visibility without fabricated samples", async () => {
  for (const prefs of [defaults, { ...defaults, composerContext: "on" }, { ...defaults, composerContext: "on", context: "off" }]) {
    const h = workspace(prefs);
    const rows = h.rows().join("\n");
    if (prefs.composerContext === "on" && prefs.context !== "off") assert.match(rows, /37%/);
    else assert.doesNotMatch(rows, /37%/);
    assert.doesNotMatch(rows, /42%|working 12s|Example context/);
    await h.discard();
  }
});

test("all remaining footer options are reachable with a visible current value and transactional changes", async () => {
  const h = workspace();
  h.click("[Other options]"); h.click("Advanced settings");
  h.panel.handleInput("\x1b[B"); // Skip the new, view-only settings-group selector.
  for (const [index, id] of OTHER_OPTIONS.entries()) {
    if (index) h.panel.handleInput("\x1b[B");
    h.rows(); h.panel.handleInput("\r");
    for (let n = 0; n < OPTIONS[id].length; n++) h.panel.handleInput("\x1b[A");
    h.panel.handleInput("\x1b[B"); h.panel.handleInput("\r");
    assert.equal(h.latest[id], OPTIONS[id][1], id);
    assert.match(h.rows().join("\n"), /Unsaved changes/);
  }
  assert.equal(await h.discard(), undefined);
});

test("preset menu supports mouse selection, Undo, Save, and bounded compact rendering", async () => {
  const h = workspace();
  h.click("[Other options]"); h.click("Style preset"); h.pick("powerline");
  assert.equal(h.latest.style, "powerline");
  h.click("[Undo]"); assert.equal(h.latest.style, "quiet");
  h.click("Style preset"); h.pick("dashboard");
  for (const width of [1, 20, 60, 100]) {
    h.tui.terminal.columns = width;
    assert.ok(h.panel.render(width).every(row => visibleWidth(row) <= width));
  }
  h.tui.terminal.columns = 80; h.tui.terminal.rows = 18;
  assert.ok(h.rows().length <= 18);
  h.panel.handleInput("\x13");
  assert.equal((await h.pending).style, "dashboard");
});

async function harness(mode = "tui") {
  const scratch = mkdtempSync(join(tmpdir(), "pi-footer-life-"));
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = scratch;
  const handlers = new Map(), commands = new Map(), entries = [], widgets = new Map(), notifications = [];
  const events = createEventBus(); let footer, panel, resolver, subscriptions = 0, renders = 0;
  const home = { prefs: { ...DEFAULTS, enabled: false }, clock: new RunClock(), tools: new Map(), phase: "working", promptDepth: 0, compacting: false, lastInputAt: 0 };
  const tui = { terminal: { rows: 40 }, requestRender() { renders++; } };
  const ctx = { mode, cwd: scratch, model: { name: "Model Name", id: "provider-specific-id" },
    sessionManager: { getBranch: () => entries, getSessionName: () => "Example", getSessionId: () => "test", getHeader: () => ({ timestamp: new Date(1000).toISOString() }) },
    getContextUsage: () => data.usage,
    ui: { theme, notify: (m, t) => notifications.push([m, t]),
      setFooter(f) { footer?.dispose(); footer = f?.(tui, theme, { onBranchChange() { subscriptions++; return () => subscriptions--; }, getExtensionStatuses: () => new Map([["other", "other extension status"]]) }); },
      setWidget(key, f) { widgets.delete(key); if (f) widgets.set(key, f(tui, theme)); },
      custom: async f => new Promise(resolve => { resolver = resolve; panel = f(tui, theme, kb, resolve); }),
    },
  };
  const pi = { events, getThinkingLevel: () => "high", on(n, fn) { handlers.set(n, [...(handlers.get(n) ?? []), fn]); }, registerCommand(n, c) { commands.set(n, c); }, appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); } };
  registerFooter(pi, home);
  const emit = async (n, value = {}) => { for (const f of handlers.get(n) ?? []) await f({ type: n, ...value }, ctx); };
  return { ctx, home, entries, widgets, events, notifications, scratch, emit, commands,
    get footer() { return footer; }, get panel() { return panel; }, get subscriptions() { return subscriptions; }, get renders() { return renders; },
    choose: () => { panel = undefined; return commands.get("workspace").handler("", ctx); },
    async panelReady() {
      const deadline = Date.now() + 2000;
      while (!panel && Date.now() < deadline) await wait(1);
      assert.ok(panel, `Workspace panel did not open: ${JSON.stringify(notifications)}`);
    },
    async close() { resolver?.(undefined); await emit("session_shutdown"); if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; rmSync(scratch, { recursive: true, force: true }); },
  };
}

test("controller preview is transactional: Cancel restores, Apply persists, reload restores, statuses survive", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    assert.equal(h.commands.has("workspace"), true);
    assert.equal(h.commands.has("footer"), false);
    assert.equal(h.subscriptions, 1);
    const before = h.footer.render(120);
    assert.match(before.map(plain).join(" "), /Model Name.*high/);
    assert.doesNotMatch(before.map(plain).join(" "), /provider-specific-id/);
    assert.match(before.map(plain).join(" "), /other extension status/);
    let pick = h.choose(); await h.panelReady();
    assert.ok(h.panel, JSON.stringify(h.notifications));
    h.panel.handleInput("\x1b[Z"); h.panel.handleInput("\x1b[Z"); h.panel.handleInput("\x1b[B"); // Other options → Style (after Selection shimmer)
    h.panel.handleInput("\r"); h.panel.handleInput("\x1b[B"); h.panel.handleInput("\r");
    assert.equal(h.home.layout.style, "powerline");
    h.panel.handleInput("\x1b"); h.panel.handleInput("\x1b"); h.panel.handleInput("\r"); await pick;
    assert.deepEqual(h.footer.render(120), before);
    assert.throws(() => readFileSync(join(h.scratch, "pi-footer.json")));
    pick = h.choose(); await h.panelReady();
    h.panel.handleInput("\x1b[Z"); h.panel.handleInput("\x1b[Z"); h.panel.handleInput("\x1b[B");
    h.panel.handleInput("\r"); h.panel.handleInput("\x1b[B"); h.panel.handleInput("\r"); h.panel.handleInput("\x13"); await pick;
    assert.equal(JSON.parse(readFileSync(join(h.scratch, "pi-workspace.json"), "utf8")).style, "powerline");
    const applied = h.footer.render(120); await h.emit("session_start");
    assert.deepEqual(h.footer.render(120), applied); assert.equal(h.subscriptions, 1);
    assert.ok(h.widgets.has("pi-home:activity"));
    h.home.prefs.enabled = true; h.events.emit(DOCK.host, { sessionId: "test" }); await wait(0);
    assert.equal(h.widgets.size, 0); assert.equal(typeof h.home.activityRows, "function");
    h.home.prefs.enabled = false; h.events.emit(DOCK.host, { sessionId: "test" });
    h.ctx.ui.setWidget("tasks", () => ({ render: () => ["task"], invalidate() {} })); await wait(0);
    assert.deepEqual([...h.widgets.keys()], ["tasks", "pi-home:activity"]);
  } finally { await h.close(); }
  assert.equal(h.subscriptions, 0);
  const renders = h.renders; await wait(1100); assert.equal(h.renders, renders);
});

test("session navigation and shutdown abort an open picker and roll back unsaved selection preferences", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    let pick = h.choose(); await h.panelReady();
    h.panel.handleInput("\x1b[Z"); h.panel.handleInput("\x1b[Z");
    h.panel.handleInput("\r"); h.panel.handleInput("\x1b[B"); h.panel.handleInput("\r");
    assert.equal(h.home.layout.selectionShimmer, "off");
    await h.emit("session_tree"); await pick;
    assert.equal(h.home.layout.selectionShimmer, "on");
    assert.equal(h.home.footerPickerOpen, false);
    assert.throws(() => readFileSync(join(h.scratch, "pi-footer.json")));
    pick = h.choose(); await h.panelReady(); h.panel.handleInput("\x1b[B");
    await h.emit("session_shutdown"); await pick;
    const count = h.renders; await wait(600); assert.equal(h.renders, count);
  } finally { await h.close(); }
});

test("controller completion timestamps exclude tool calls/errors; timing restores per branch", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); await h.emit("input", { source: "interactive", text: "hello" });
    await h.emit("agent_start"); await h.emit("agent_start");
    await h.emit("message_end", { message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall" }] } });
    assert.equal(h.entries.at(-1).data.receivedAt, undefined);
    await h.emit("ui_prompt_start"); await h.emit("ui_prompt_end");
    await h.emit("message_end", { message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "reply" }] } });
    await h.emit("agent_settled");
    const last = h.entries.at(-1); assert.equal(last.customType, FOOTER_ENTRY); assert.ok(last.data.receivedAt); assert.ok(last.data.sentAt); assert.equal(last.data.runStarted, undefined);
    await h.emit("session_tree"); assert.match(h.widgets.get("pi-home:activity").render(160).map(plain).join(" "), /last run/);
    h.entries.length = 0; await h.emit("session_tree");
    assert.match(h.widgets.get("pi-home:activity").render(160).map(plain).join(" "), /󱃝 —.*󱃛 —.*ready/);
  } finally { await h.close(); }
});

test("a question pauses the displayed run clock until the prompt closes", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); await h.emit("agent_start");
    const activity = () => h.widgets.get("pi-home:activity").render(120).map(plain).join(" ");
    await h.emit("ui_prompt_start");
    assert.match(activity(), /waiting for you/);
    await wait(1100);
    assert.match(activity(), /waiting for you/);
    assert.doesNotMatch(activity(), /working 1s/);
    await h.emit("ui_prompt_end"); await h.emit("agent_settled");
    const last = h.entries.at(-1).data;
    assert.equal(last.lastRunBasis, "active");
    assert.ok(last.lastRunMs < 800, `question wait leaked into run duration: ${last.lastRunMs}ms`);
  } finally { await h.close(); }
});

test("composer last-sent rail uses recorded user messages, not unsourced input, and resets on branch changes", async () => {
  const h = await harness(); h.home.prefs.enabled = true; h.home.prefs.look = "composer";
  try {
    await h.emit("session_start");
    assert.equal(h.home.lastUserSentAt(), undefined);
    await h.emit("input", { source: "interactive", text: "maybe a command" });
    assert.equal(h.home.lastUserSentAt(), undefined, "an input event alone is not a recorded message");
    const first = new Date(2025, 4, 8, 12, 30).getTime();
    await h.emit("message_start", { message: { role: "user", timestamp: first } });
    assert.equal(h.home.lastUserSentAt(), first);
    h.entries.push({ type: "message", message: { role: "user", timestamp: first - 1000 } });
    await h.emit("session_tree"); assert.equal(h.home.lastUserSentAt(), first - 1000, "branch transcript wins after navigation");
    h.entries.length = 0; await h.emit("session_tree");
    assert.equal(h.home.lastUserSentAt(), undefined, "do not leak a sent time between branches");
  } finally { await h.close(); }
  assert.equal(h.home.lastUserSentAt, undefined, "cleanup removes the rail source");
});

test("working timer requests fresh renders without stream or tool events", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    await h.emit("agent_start");
    const activity = () => h.widgets.get("pi-home:activity").render(160).map(plain).join(" ");
    assert.match(activity(), /working 0s/);
    const renders = h.renders;
    await wait(2200);
    assert.ok(h.renders > renders, "the clock schedules paints while the provider is silent");
    assert.match(activity(), /working [2-9]s/);
    await h.emit("agent_settled");
    assert.match(activity(), /last run [2-9]s/);
    const completed = activity().match(/last run \d+s/)[0];
    await wait(1100);
    assert.ok(activity().includes(completed), "completed duration stays fixed while idle");
  } finally { await h.close(); }
});

test("save failures roll back live preview; corrupt settings stay untouched until Apply", async () => {
  const h = await harness();
  try {
    writeFileSync(join(h.scratch, "pi-footer.json"), "not json");
    await h.emit("session_start"); assert.match(h.notifications[0][0], /could not be read/);
    assert.equal(readFileSync(join(h.scratch, "pi-footer.json"), "utf8"), "not json");
    await h.choose(); // Corrupt legacy settings block editing rather than being overwritten.
    assert.equal(readFileSync(join(h.scratch, "pi-footer.json"), "utf8"), "not json");
    rmSync(join(h.scratch, "pi-footer.json")); await h.emit("session_start");
    const before = h.footer.render(120), pick = h.choose(); await h.panelReady(); h.panel.handleInput("\r");
    mkdirSync(join(h.scratch, "pi-workspace.json")); h.panel.handleInput("\x13"); await pick;
    assert.deepEqual(h.footer.render(120), before); assert.ok(h.notifications.some(([m, t]) => t === "error" && /not saved/.test(m)));
  } finally { await h.close(); }
});

test("nonterminal modes do not install components, timers, or timing metadata", async () => {
  for (const mode of ["print", "json", "rpc"]) {
    const h = await harness(mode);
    try { await h.emit("session_start"); await h.emit("agent_start"); await h.emit("agent_settled"); assert.equal(h.subscriptions, 0); assert.equal(h.widgets.size, 0); assert.equal(h.entries.length, 0); }
    finally { await h.close(); }
  }
});
