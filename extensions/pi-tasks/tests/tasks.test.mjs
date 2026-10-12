import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
const source = resolve(fileURLToPath(new URL("..", import.meta.url)));
const install = join(homedir(), ".pi/agent/install");
const root = process.env.PI_HOME_HOST_MODULES || join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules");
const host = join(root, "@earendil-works/pi-coding-agent/dist");
const { createJiti } = await import(pathToFileURL(join(root, "jiti/lib/jiti.mjs")));
const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-coding-agent": join(host, "index.js"),
  "@earendil-works/pi-tui": join(root, "@earendil-works/pi-tui/dist/index.js"),
  "@earendil-works/pi-ai": join(root, "@earendil-works/pi-ai/dist/index.js"),
  "typebox": join(root, "typebox/build/index.mjs"),
} });
const { emptyPlan, mutate, restorePlan, counts, dockRows, progressLabel, contextSummary, ENTRY } = await jiti.import(join(source, "state.ts"));
const { BOOK_ENTRY, COMPLETION_MS, emptyBook, mutateBook, migratePlan, restoreBook, selectedPlan, resultPlan, bookContext, planInfo } = await jiti.import(join(source, "book.ts"));
const factory = await jiti.import(join(source, "index.ts"), { default: true });
const askFactory = await jiti.import(join(source, "../../packages/pi-ask/extensions/questions.ts"), { default: true });
const { POSTED } = await jiti.import(join(source, "../../packages/pi-ask/extensions/ask-user-question/posted-protocol.ts"));
const homeFactory = await jiti.import(join(source, "../pi-home/index.ts"), { default: true });
const { TaskPanel } = await jiti.import(join(source, "panel.ts"));
const { FocusWindow } = await jiti.import(join(source, "focus.ts"));
const { layoutDock } = await jiti.import(join(source, "../../lib/home-dock.ts"));
const { createWorkspace } = await jiti.import(join(source, "../pi-home/workspace.ts"));
const { taskFrame, taskFrameColor } = await jiti.import(join(source, "../../lib/task-frame.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "../pi-home/state.ts"));
const { DOCK, isSnapshot, isHost, fitDock } = await jiti.import(join(source, "../../lib/home-dock.ts"));
const { initTheme, getEditorTheme, theme, getThemeByName, setThemeInstance } = await import(pathToFileURL(join(host, "modes/interactive/theme/theme.js")));
const { KeybindingsManager } = await import(pathToFileURL(join(host, "core/keybindings.js")));
const { visibleWidth, setKeybindings } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { createEventBus } = await import(pathToFileURL(join(host, "core/event-bus.js")));
const { loadExtensions } = await import(pathToFileURL(join(host, "core/extensions/loader.js")));
const { ToolExecutionComponent } = await import(pathToFileURL(join(host, "modes/interactive/components/tool-execution.js")));
initTheme("dark", false);
const kb = new KeybindingsManager(); setKeybindings(kb);
const plain = (s) => stripVTControlCharacters(s);
const add = (p, titles = ["Read requirements", "Implement", "Verify"]) => mutate(p, p.revision, { op: "add", items: titles.map((title) => ({ title })) }, "agent", 1000);
const update = (p, id, changes, actor = "agent") => mutate(p, p.revision, { op: "update", id, changes }, actor, 2000);

test("focus dial preserves order, freezes on browse, and never mutates plan state", () => {
  let p = add(emptyPlan(), Array.from({ length: 8 }, (_, i) => `Task ${i + 1}`));
  const dial = new FocusWindow();
  const view = (id = "p1", running = true) => {
    const snapshot = { version: 1, sessionId: "test", id: "pi-tasks", title: "Plan", rows: [] };
    dial.apply(snapshot, id, p, running); return snapshot;
  };
  assert.match(view().summary, /1–3 of 8 · Not started/);
  p = update(p, "t4", { status: "active" });
  assert.match(view().summary, /3–5 of 8 · Following/);
  assert.match(view().rows[1].text, /▸ 4  Task 4/);
  const before = structuredClone(p);
  dial.move("p1", p, -1);
  assert.match(view().summary, /2–4 of 8 · Now working: 4/);
  assert.deepEqual(p, before);
  p = update(p, "t4", { status: "done", note: "Done" });
  assert.match(view().summary, /2–4 of 8 · Last worked on: 4/);
  p = update(p, "t6", { status: "active" });
  assert.match(view().summary, /2–4 of 8 · Now working: 6/);
  assert.match(view("p1", false).summary, /Paused: 6/);
  dial.follow("p1", p);
  assert.match(view().summary, /5–7 of 8 · Following/);
  p = update(p, "t1", { status: "blocked", reason: "External input" });
  assert.match(view().summary, /5–7 of 8/);
  for (let i = 0; i < 20; i++) dial.move("p1", p, 1);
  assert.match(view().summary, /6–8 of 8/);
  p = update(p, "t6", { status: "pending" });
  assert.match(view("p2").summary, /1–3 of 8 · No active task/);
  assert.ok(isSnapshot(view()));
});

test("focus dock wraps Unicode within its line budget without unused padding", () => {
  const snapshot = { version: 1, sessionId: "test", id: "pi-tasks", title: "Plan", layout: "focus", rows: [
    { text: "✓ 1  Done", tone: "muted" },
    { text: "▸ 2  Long task 界面 é needs enough space to wrap without losing its complete title", tone: "accent" },
    { text: "○ 3  Test later", tone: "text" },
  ] };
  for (const width of [1, 2, 8, 20, 40, 80]) for (const budget of [3, 5, 7]) {
    const lines = layoutDock(snapshot, width, budget);
    assert.ok(lines.length <= budget);
    assert.ok(lines.every(line => visibleWidth(line.text) <= width));
    if (width === 20 && budget === 3) assert.ok(lines.some(line => line.text.includes("…")));
  }
  assert.ok(layoutDock(snapshot, 40, 7).some(line => line.text.startsWith("  ")));
  assert.equal(layoutDock({ ...snapshot, rows: [{ text: "Short" }] }, 40, 7).length, 1);
  assert.equal(layoutDock({ ...snapshot, rows: [{ text: "One" }, { text: "Two" }, { text: "Three" }] }, 40, 7).length, 3);
});

test("standalone task extension loads through the real host with no Home dependency", async () => {
  const result = await loadExtensions([join(source, "index.ts")], source);
  assert.deepEqual(result.errors, []);
  assert.ok(result.extensions[0].commands.has("tasks"));
});
test("completion guidance defines sufficient evidence without weakening acceptance", async () => {
  const { ATOMIC_GUIDANCE } = await jiti.import(join(source, "requirements.ts"));
  for (const pattern of [
    /Use doneWhen and requirement acceptance/, /sufficient verification before checks expand/,
    /distinct risk, changed state, inconclusive result, or known instability/,
    /Keep unfinished or unverified work explicitly unresolved/,
    /not permission to weaken acceptance conditions/,
    /not independent verification/,
  ]) assert.match(ATOMIC_GUIDANCE, pattern);
});

test("atomic revisioned updates, stable IDs, explicit start, dependencies and outcomes", () => {
  const empty = emptyPlan(), p = add(empty);
  assert.equal(empty.tasks.length, 0);
  assert.ok(p.tasks.every((t) => t.status === "pending"));
  let q = update(p, "t1", { status: "active" });
  assert.throws(() => update(q, "t2", { status: "active" }), /one focus/);
  assert.throws(() => mutate(q, p.revision, { op: "add", items: [{ title: "stale" }] }, "agent"), /plan changed/);
  assert.throws(() => update(q, "t1", { status: "done" }), /completion note/);
  q = update(q, "t2", { dependsOn: ["t1"] });
  assert.throws(() => update(q, "t2", { status: "done", note: "pretend done" }), /Unfinished dependencies/);
  assert.throws(() => update(q, "t1", { dependsOn: ["t2"], status: "pending" }), /cycle/);
  assert.throws(() => update(q, "t3", { dependsOn: ["t99"] }), /Unknown dependency/);
  assert.throws(() => update(q, "t3", { status: "blocked" }), /reason/);
  q = update(q, "t1", { title: "Read the actual requirements", status: "done", note: "Reviewed", evidence: "read call #1" });
  assert.equal(q.tasks[0].id, "t1");
  assert.equal(q.tasks[1].status, "pending", "no implicit next-task start");
  q = update(q, "t2", { status: "active" });
  q = update(q, "t3", { status: "cancelled" });
  assert.equal(counts(q), "1/3 done · 1 cancelled");
  assert.deepEqual(restorePlan(q), q);
  assert.equal(p.tasks[0].title, "Read requirements", "base snapshot not mutated");
});
test("user closure/clear cannot be undone by the agent, including via an intervening rename", () => {
  let p = add(emptyPlan());
  p = update(p, "t1", { status: "cancelled" }, "user");
  p = update(p, "t1", { title: "Renamed" });
  assert.throws(() => update(p, "t1", { status: "pending" }), /Only the user/);
  p = update(p, "t1", { status: "pending" }, "user");
  p = update(p, "t1", { status: "done", note: "Passed", evidence: "run #2" });
  p = update(p, "t1", { status: "pending" });
  assert.equal(p.tasks[0].note, ""); assert.equal(p.tasks[0].evidence, "");
  const revision = p.revision;
  p = mutate(p, revision, { op: "clear" }, "user");
  assert.throws(() => add(p), /user cleared/);
  const next = mutate(p, p.revision, { op: "add", items: [{ title: "User-added" }] }, "user");
  assert.equal(next.tasks[0].id, "t4");
  assert.equal(next.userCleared, false);
});
test("persisted data, bounds and terminal controls are validated; memory is bounded", () => {
  let p = add(emptyPlan(), ["hello\x1b[31m\n世界"]);
  assert.equal(p.tasks[0].title, "hello 世界");
  assert.throws(() => add(p, ["x".repeat(201)]), /200/);
  assert.throws(() => add(p, Array(101).fill("x")), /100/);
  assert.throws(() => restorePlan({ ...p, version: 2 }), /invalid|Unsupported/);
  assert.throws(() => restorePlan({ ...p, tasks: [...p.tasks, ...p.tasks] }), /Duplicate/);
  p = add(p, Array.from({ length: 90 }, (_, i) => "Task " + i));
  const summary = contextSummary(p);
  assert.ok(summary.length < 8000);
  assert.match(summary, /75 more open/);
  assert.equal(summary.split('"id":').length - 1, 16);
  p = update(p, "t91", { status: "blocked", reason: "Needs your answer" });
  assert.match(contextSummary(p), /Needs your answer/, "late blockers get priority in bounded memory");
  p = update(p, "t1", { status: "active" });
  assert.match(dockRows(p, false)[0].text, /paused/);
  assert.doesNotMatch(dockRows(p, true)[0].text, /paused/);
});

async function harness({ home = false, ask = false, order = "home-first", mode = "tui", prefs } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), "pi-tasks-test-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = scratch;
  if (prefs !== undefined) writeFileSync(join(scratch, "pi-tasks.json"), typeof prefs === "string" ? prefs : JSON.stringify(prefs));
  const handlers = new Map(), commands = new Map(), tools = new Map(), entries = [], widgets = new Map(), notices = [], active = new Set(["read", "bash"]);
  const events = createEventBus(), messages = [];
  let branch = entries, currentFactory, editor, footer, renderCount = 0, failStorage = false;
  const tui = { terminal: { rows: 40 }, requestRender() { renderCount++; } };
  const data = { getGitBranch: () => undefined, getExtensionStatuses: () => new Map(), onBranchChange: () => () => {} };
  const context = { mode, hasUI: mode === "tui" || mode === "rpc", cwd: scratch, model: { id: "offline-test" },
    sessionManager: { getLeafId: () => null, getBranch: () => branch, getSessionId: () => "test-session", getSessionName: () => "Current session", getHeader: () => ({ timestamp: new Date().toISOString() }) }, getContextUsage: () => ({ percent: 10 }),
    ui: { theme, getTheme: getThemeByName, setTheme(value) { setThemeInstance(value); return { success: true }; },
      getEditorComponent: () => currentFactory, setEditorComponent(f) { const text = editor?.getText() ?? ""; currentFactory = f; editor = f?.(tui, getEditorTheme(), kb); if (editor) { editor.focused = true; editor.setText(text); } },
      getEditorText: () => editor?.getExpandedText() ?? "", setEditorText: (text) => editor?.setText(text),
      setWorkingVisible() {}, setHeader() {}, setFooter(f) { footer?.dispose(); footer = f?.(tui, theme, data); },
      setWidget(key, f) { if (!f) widgets.delete(key); else widgets.set(key, typeof f === "function" ? f(tui, theme) : { render: () => f }); },
      notify: (text, tone) => notices.push({ text, tone }), confirm: async () => true, input: async () => undefined,
      custom: async (factory) => { let result; const panel = factory(tui, theme, kb, (value) => result = value); panel.render(100); panel.handleInput("\x1b"); return result; },
    } };
  const api = { events,
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); return () => {}; },
    registerCommand: (name, command) => commands.set(name, command),
    registerEntryRenderer() {}, registerMessageRenderer() {},
    sendMessage(message, options) { messages.push({ ...structuredClone(message), role: "custom", options }); },
    registerTool(tool) { tools.set(tool.name, tool); active.delete(tool.name); if (tool.exposure === "direct") active.add(tool.name); },
    getActiveTools: () => [...active], setActiveTools(names) { active.clear(); names.forEach((n) => active.add(n)); },
    getThinkingLevel: () => "high",
    appendEntry(customType, value) { if (failStorage) throw new Error("disk failed"); const entry = { type: "custom", customType, data: structuredClone(value) }; branch.push(entry); },
  };
  if (home && order === "home-first") await homeFactory(api);
  if (ask && order === "ask-first") await askFactory(api);
  await factory(api);
  if (ask && order !== "ask-first") await askFactory(api);
  if (home && order !== "home-first") await homeFactory(api);
  const emit = async (name, value = {}) => { const results = []; for (const fn of handlers.get(name) ?? []) results.push(await fn({ type: name, ...value }, context)); return results; };
  const command = (name, args = "") => commands.get(name).handler(args, context);
  const call = (params, signal) => tools.get("tasks").execute("task-test", params, signal, undefined, context);
  return { scratch, context, tools, handlers, entries, messages, widgets, notices, events, active, tui, emit, command, call,
    callQuestion: params => tools.get("question_queue").execute("question-test", params, undefined, undefined, context),
    get editor() { return editor; }, get renders() { return renderCount; },
    branch(value) { branch = value; }, failStorage() { failStorage = true; },
    async close() { await emit("session_shutdown"); events.clear(); if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir; rmSync(scratch, { recursive: true, force: true }); },
  };
}

test("focus browsing stays view-only; Home overview remains independent and preferences persist", async () => {
  for (const home of [false, true]) {
    const h = await harness({ home });
    try {
      await h.emit("session_start");
      const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
      let result = await h.call({ op: "create", revision: initial.revision, title: "Focus test", items: Array.from({ length: 8 }, (_, i) => ({ title: `Step ${i + 1} with a long title that must wrap across small terminals 界面` })) });
      result = await h.call({ op: "update", revision: JSON.parse(result.content[0].text).revision, id: "t4", changes: { status: "active" } });
      await h.emit("agent_start");
      const before = structuredClone(h.entries);
      const render = width => [...h.widgets.values()].flatMap(widget => widget.render(width));
      assert.match(plain(render(100).join("\n")), home ? /0\/8 done/ : /3–5 of 8 · Following/);
      const overview = plain(render(100).join("\n"));
      await h.command("tasks", "prev");
      assert.match(plain(render(100).join("\n")), home ? /0\/8 done/ : /2–4 of 8 · Now working: 4/);
      if (home) assert.equal(plain(render(100).join("\n")), overview, "browser paging does not hide active work in the overview");
      await h.command("tasks", "follow");
      assert.match(plain(render(100).join("\n")), home ? /0\/8 done/ : /3–5 of 8 · Following/);
      assert.deepEqual(h.entries, before, "browsing adds no task snapshots");
      for (const rows of [12, 24, 40]) for (const width of [20, 40, 80]) {
        h.tui.terminal.rows = rows;
        assert.ok(render(width).every(line => visibleWidth(line) <= width));
      }
      await h.command("tasks", "view compact");
      assert.equal(JSON.parse(readFileSync(join(h.scratch, "pi-tasks.json"))).appearance, "compact");
      await h.emit("session_start");
      assert.doesNotMatch(plain(render(100).join("\n")), /Tasks 3–5/);
      await h.command("tasks", "view focus");
      assert.equal(JSON.parse(readFileSync(join(h.scratch, "pi-tasks.json"))).appearance, "focus");
    } finally { await h.close(); }
  }
});

test("hide/unhide only controls the dock, persists, and leaves tracking and panel available", async () => {
  for (const home of [false, true]) {
    const h = await harness({ home });
    try {
      await h.emit("session_start");
      await h.command("tasks", "add Visibility test task");
      const render = () => plain([...h.widgets.values()].flatMap(w => w.render(100)).join("\n"));
      assert.match(render(), /Visibility test task/);
      const before = structuredClone(h.entries);
      const hiding = h.command("tasks", "hide");
      assert.doesNotMatch(render(), /Visibility test task/);
      await hiding;
      assert.deepEqual(h.entries, before);
      assert.equal(h.active.has("tasks"), true);
      assert.equal(h.tools.get("tasks").exposure, "direct");
      assert.equal((await h.emit("context", { messages: [] }))[0].messages.length, 1);
      assert.equal(JSON.parse(readFileSync(join(h.scratch, "pi-tasks.json"))).hidden, true);
      const current = JSON.parse((await h.call({ op: "list" })).content[0].text);
      await h.call({ op: "update", revision: current.revision, id: "t1", changes: { status: "active" } });
      await h.emit("agent_start");
      await h.emit("session_compact");
      await h.emit("agent_settled");
      assert.doesNotMatch(render(), /Visibility test task/);
      let opened = false;
      const custom = h.context.ui.custom;
      h.context.ui.custom = async (...args) => { opened = true; return custom(...args); };
      await h.command("tasks", "show");
      assert.equal(opened, true);
      assert.doesNotMatch(render(), /Visibility test task/);
      await h.emit("session_start");
      assert.doesNotMatch(render(), /Visibility test task/);
      if (home) {
        await h.command("home", "off");
        assert.equal(h.widgets.has("pi-tasks:fallback"), false);
        await h.command("home", "on");
        assert.doesNotMatch(render(), /Visibility test task/);
      }
      await h.command("tasks", "off");
      await h.command("tasks", "on");
      assert.doesNotMatch(render(), /Visibility test task/);
      await h.command("tasks", "unhide");
      assert.match(render(), /Visibility test task/);
      assert.equal(JSON.parse(readFileSync(join(h.scratch, "pi-tasks.json"))).hidden, false);
      await h.command("tasks", "off");
      await h.command("tasks", "hide");
      await h.command("tasks", "unhide");
      assert.equal(h.active.has("tasks"), false, "unhide never enables tracking");
      assert.doesNotMatch(render(), /Visibility test task/);
      assert.equal(h.notices.filter(n => n.tone === "warning").length, 0);
    } finally { await h.close(); }
  }
});

test("tasks off is immediate, hides the tool/context/UI, preserves plan, and prevents reconciliation", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    await h.command("tasks", "add Preserve this task");
    const before = (await h.call({ op: "list" })).details.plan;
    assert.ok(h.widgets.has("pi-tasks:fallback"));
    assert.equal(h.handlers.has("agent_before_settle"), true);
    assert.equal(h.handlers.has("turn_end"), false);
    const off = h.command("tasks", "off");
    assert.equal(h.tools.get("tasks").exposure, "hidden", "off takes effect before filesystem save completes");
    await assert.rejects(h.call({ op: "update", revision: before.revision, id: "t1", changes: { status: "active" } }), /Tasks are off/);
    assert.equal(h.active.has("tasks"), false);
    assert.equal(h.active.has("bash"), true);
    assert.equal(h.widgets.size, 0);
    const offContext = (await h.emit("context", { messages: [{ role: "user", content: "hello" }] }))[0];
    assert.equal(offContext.messages.length, 1);
    await off;
    assert.equal(JSON.parse(readFileSync(join(h.scratch, "pi-tasks.json"))).enabled, false);
    await h.emit("session_start");
    assert.equal(h.tools.get("tasks").exposure, "hidden");
    await h.command("tasks", "on");
    assert.deepEqual((await h.call({ op: "list" })).details.plan, before);
    assert.ok(h.active.has("tasks"));
    const first = (await h.emit("context", { messages: [] }))[0];
    const second = (await h.emit("context", { messages: first.messages }))[0];
    assert.equal(second.messages.length, 1, "no growing reminder history");
  } finally { await h.close(); }
});
test("tool lists are paginated and completion-note attribution survives unrelated edits", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    const p = (await h.call({ op: "list" })).details.plan;
    const added = await h.call({ op: "add", revision: p.revision, items: Array.from({ length: 25 }, (_, i) => ({ title: "Task " + i })) });
    assert.equal(JSON.parse(added.content[0].text).tasks.length, 20);
    const nextPage = JSON.parse((await h.call({ op: "list", offset: 20 })).content[0].text);
    assert.equal(nextPage.tasks.length, 5);
    let q = update(added.details.plan, "t1", { status: "done", note: "I accepted this" }, "user");
    q = update(q, "t1", { title: "Renamed by agent" });
    assert.equal(q.tasks[0].noteBy, "user");
    assert.equal(q.tasks[0].updatedBy, "agent");
  } finally { await h.close(); }
});

test("Home and Tasks remain independent in both extension startup orders", async () => {
  for (const order of ["home-first", "tasks-first"]) {
    const h = await harness({ home: true, order });
    try {
      await h.emit("session_start");
      await h.command("tasks", "add A real task");
      const editor = h.editor; editor.setText("draft stays intact");
      assert.equal(h.widgets.has("pi-tasks:fallback"), false);
      let workspace = h.widgets.get("pi-home:identity").render(100).map(plain).join("\n");
      assert.match(workspace, /A real task/);
      assert.match(h.editor.render(100).map(plain).join("\n"), /Current session/, "identity belongs in Composer's native editor rail");
      assert.match(workspace, /╭ Tasks .*╮[\s\S]*╰─/);
      await h.command("tasks", "off");
      assert.equal(h.editor, editor);
      assert.equal(h.editor.getText(), "draft stays intact");
      workspace = h.widgets.get("pi-home:identity").render(100).map(plain).join("\n");
      assert.doesNotMatch(workspace, /A real task/);
      assert.match(h.editor.render(100).map(plain).join("\n"), /Current session/);
      await h.command("tasks", "on");
      await h.command("home", "off");
      assert.ok(h.widgets.has("pi-tasks:fallback"));
      assert.match(h.widgets.get("pi-tasks:fallback").render(100).map(plain).join("\n"), /^╭ Tasks .*╮[\s\S]*╰─/);
      assert.ok(h.active.has("tasks"));
      assert.equal(h.widgets.has("pi-home:identity"), false);
      await h.command("home", "on");
      assert.equal(h.widgets.has("pi-tasks:fallback"), false);
      assert.match(h.widgets.get("pi-home:identity").render(100).map(plain).join("\n"), /A real task/);
      await h.command("home", "motion off");
      assert.match(h.widgets.get("pi-home:identity").render(100).map(plain).join("\n"), /A real task/);
      await h.command("tasks", "show");
      assert.equal(h.notices.filter((n) => n.tone === "warning").length, 0);
    } finally { await h.close(); }
  }
});
test("active-branch restoration, compaction, abort and failed storage preserve truthful state", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); await h.command("tasks", "add Original branch");
    const initial = (await h.call({ op: "list" })).details.plan;
    const branchPoint = structuredClone(h.entries);
    await h.call({ op: "update", revision: initial.revision, id: "t1", changes: { status: "active" } });
    await h.emit("agent_start"); await h.emit("agent_settled");
    assert.match(h.widgets.get("pi-tasks:fallback").render(120).map(plain).join("\n"), /paused/);
    h.branch(branchPoint); await h.emit("session_tree");
    assert.deepEqual((await h.call({ op: "list" })).details.plan, initial);
    await h.command("tasks", "add Fork only");
    assert.equal((await h.call({ op: "list" })).details.plan.tasks.length, 2);
    h.branch(h.entries); await h.emit("session_tree");
    assert.equal((await h.call({ op: "list" })).details.plan.tasks.length, 1);
    await h.emit("session_compact");
    const p = (await h.call({ op: "list" })).details.plan;
    assert.equal(p.tasks[0].title, "Original branch");
    const controller = new AbortController(); controller.abort();
    await assert.rejects(h.call({ op: "list" }, controller.signal), /cancelled/);
    h.failStorage();
    await assert.rejects(h.call({ op: "update", revision: p.revision, id: "t1", changes: { status: "done", note: "done" } }), /disk failed/);
    assert.deepEqual((await h.call({ op: "list" })).details.plan, p);
  } finally { await h.close(); }
});
test("non-TUI tasks work, off works, corrupt preferences fail closed and corrupt snapshots are not overwritten", async () => {
  for (const mode of ["print", "json", "rpc"]) {
    const h = await harness({ mode });
    try {
      await h.emit("session_start"); await h.command("tasks", "add Headless task");
      assert.equal((await h.call({ op: "list" })).details.plan.tasks.length, 1);
      assert.equal(h.widgets.size, 0);
      await h.command("tasks", "off");
      await assert.rejects(h.call({ op: "list" }), /off/);
    } finally { await h.close(); }
  }
  const h = await harness({ prefs: "not JSON" });
  try {
    await h.emit("session_start");
    assert.equal(h.tools.get("tasks").exposure, "hidden");
    await h.command("tasks", "on");
    h.entries.push({ type: "custom", customType: ENTRY, data: { version: 99 } });
    await h.emit("session_tree");
    await assert.rejects(h.call({ op: "list" }), /unreadable/);
    assert.equal(h.entries.length, 1);
    await h.command("tasks", "clear");
    assert.equal(h.entries.length, 2);
  } finally { await h.close(); }
});
test("task panel clips Unicode, shows cancelled separately, uses committed data and handles keyboard navigation", () => {
  let p = add(emptyPlan(), ["Unicode 界面 🪴", "Check the result", "Cancel this"]);
  p = update(p, "t1", { status: "done", note: "Reviewed", evidence: "user acceptance" }, "user");
  p = update(p, "t3", { status: "cancelled" });
  let result;
  for (const rows of [12, 24, 40]) {
    const b = migratePlan(p);
    const panel = new TaskPanel({ terminal: { rows }, requestRender() {} }, theme, () => b, () => undefined, (r) => result = r, { showDone: true });
    for (const width of [1, 2, 8, 20, 40, 80, 120]) for (const line of panel.render(width)) assert.ok(visibleWidth(line) <= width);
    panel.handleInput("d");
    for (const width of [1, 2, 8, 20, 80]) for (const line of panel.render(width)) assert.ok(visibleWidth(line) <= width);
    panel.handleInput("\x1b");
    panel.handleInput("\x1b[B"); panel.handleInput("e"); assert.deepEqual(result, { op: "edit", planId: "p1", revision: b.revision, id: "t2" });
    panel.handleInput("\x1b"); assert.equal(result, undefined);
  }
});
test("short checklists retain all three tasks and completed steps; longer plans have exact overflow counts", () => {
  let p = add(emptyPlan());
  assert.equal(progressLabel(p), "", "no redundant 0/3 label");
  p = update(p, "t1", { status: "done", note: "Read" });
  p = update(p, "t2", { status: "active" });
  const rows = dockRows(p, false);
  assert.deepEqual(rows.map((r) => r.text), ["✓ Read requirements", "▸ Implement · paused", "○ Verify"]);
  const snapshot = { version: 1, sessionId: "s", id: "test", title: "Plan", rows, hint: "/tasks" };
  assert.equal(fitDock(snapshot, 3).length, 3);
  assert.equal(progressLabel(p), "1 of 3 complete");
  const big = add(emptyPlan(), Array.from({ length: 20 }, (_, i) => `Step ${i + 1}`));
  const compact = fitDock({ ...snapshot, rows: dockRows(big, false), more: 8 }, 6);
  assert.equal(compact.length, 6);
  assert.equal(compact.at(-1).text, "+ 15 more · /tasks");
  assert.equal(isSnapshot({ ...snapshot, more: -1 }), false);
  assert.equal(isSnapshot({ ...snapshot, summary: 123 }), false);
});
test("tool results show committed checklist state without raw revisions, and updates avoid reprinting the entire plan", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    const initial = await h.call({ op: "list" });
    const result = await h.call({ op: "add", revision: initial.details.plan.revision, items: [{ title: "One" }, { title: "Two" }, { title: "Three" }] });
    const tool = h.tools.get("tasks");
    const render = (args) => tool.renderResult(result, { expanded: false }, theme, { args }).render(80).map(plain).join("\n");
    assert.match(render({ op: "add" }), /^╭ Tasks /);
    assert.doesNotMatch(render({ op: "add" }).split("\n")[0], /\bresult\b/);
    assert.match(render({ op: "add" }), /One.*\n.*Two.*\n.*Three/);
    assert.doesNotMatch(render({ op: "add" }), /revision|t1|0\/3/);
    assert.match(render({ op: "add" }), /\+ Added 3 tasks · not started/);
    assert.equal((render({ op: "add" }).match(/Added 3 tasks/g) ?? []).length, 1, "one acknowledgment for a batch");
    assert.match(render({ op: "add" }), /○ One/);
    assert.doesNotMatch(render({ op: "add" }), /\bpending\b/);
    assert.equal(result.details.plan.tasks[0].status, "pending", "the display label does not change stored state");
    for (const selected of [getThemeByName("dark"), getThemeByName("light")]) {
      const card = tool.renderResult(result, {}, selected, { args: { op: "add", items: [1, 2, 3] } }).render(80);
      assert.ok(card.some(line => line.includes(selected.style("+ Added 3 tasks · not started", { fg: "muted", bold: false }))));
    }
    assert.match(render({ op: "update", id: "t2" }), /Updated · not started/);
    assert.match(render({ op: "update", id: "t2" }), /○ Two/);
    assert.doesNotMatch(render({ op: "update", id: "t2" }), /○ One|○ Three|Task ·/);
    const emptyHistory = tool.renderResult({ content: [], details: { plan: result.details.plan, plans: [] } }, {}, theme, { args: { op: "plans" } }).render(80).map(plain).join("\n");
    assert.match(emptyHistory, /No saved plans/);
    const error = tool.renderResult({ content: [{ type: "text", text: "Update rejected" }] }, {}, theme, { args: { op: "update" } }).render(80);
    assert.match(plain(error.join("\n")), /Update rejected/);
    assert.ok(error[1].includes(theme.fg("error", "Update rejected")));
    const next = await h.call({ op: "add", revision: JSON.parse(result.content[0].text).revision, items: [{ title: "Four" }] });
    const single = tool.renderResult(next, {}, theme, { args: { op: "add", items: [{ title: "Four" }] } }).render(80).map(plain).join("\n");
    assert.match(single, /\+ Added 1 task · not started/);
    assert.match(single, /○ Four/);
  } finally { await h.close(); }
});
test("task transcript cards wrap full titles and show status without a row cutoff", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
    const title = "Review Unicode 界面 and all the long implementation details through the final acceptance checkpoint";
    const args = { op: "create", revision: initial.revision, title: "Full card", items: Array.from({ length: 15 }, (_, i) => ({ title: `${i} ${title}` })) };
    const result = await h.call(args);
    const tool = h.tools.get("tasks");
    for (const width of [12, 30, 80]) {
      const lines = tool.renderResult(result, { expanded: false }, theme, { args }).render(width).map(plain);
      assert.ok(lines.every(line => visibleWidth(line) <= width));
      const joined = lines.slice(1, -1).map(line => line.slice(1, -1).trimEnd()).join("").replace(/\s+/g, "");
      for (let i = 0; i < 15; i++) assert.ok(joined.includes(`○ ${i} ${title}`.replace(/\s+/g, "")));
      assert.ok(joined.includes("Added15tasks·notstarted"));
      assert.doesNotMatch(joined, /…|pending/);
    }
    const updateArgs = { op: "update", revision: JSON.parse(result.content[0].text).revision, id: "t15", changes: { status: "active" } };
    const updated = await h.call(updateArgs);
    for (const selected of [getThemeByName("dark"), getThemeByName("light")]) {
      const pending = tool.renderCall(updateArgs, selected, { isPartial: true }).render(80);
      assert.doesNotMatch(plain(pending[0]), /\bcall\b/);
      assert.ok(pending[1].includes(selected.fg("accent", "◇ Mark task active")));
      assert.ok(pending[1].includes(selected.fg("muted", " · in progress…")));
      assert.deepEqual(tool.renderCall(updateArgs, selected, { isPartial: false }).render(80), [], "completed call yields to result");
      assert.deepEqual(tool.renderCall(updateArgs, selected, { isPartial: false, isError: true }).render(80), [], "failed call yields to error");
      for (const width of [8, 12, 30, 80]) {
        const lines = tool.renderCall(updateArgs, selected, { isPartial: true }).render(width);
        assert.ok(lines.every(line => visibleWidth(line) <= width));
      }
    }
    const text = tool.renderResult(updated, { expanded: false }, theme, { args: updateArgs }).render(30).map(plain).slice(1, -1).map(line => line.slice(1, -1).trimEnd()).join("").replace(/\s+/g, "");
    assert.ok(text.includes(`● 14 ${title}`.replace(/\s+/g, "")));
    assert.doesNotMatch(text, /pending/);
  } finally { await h.close(); }
});

test("Pi transcript replaces a pending Tasks call with its final result, including restored results and failures", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    const tool = h.tools.get("tasks");
    const args = { op: "update", id: "t1", changes: { status: "active" } };
    const component = () => new ToolExecutionComponent("tasks", "test-call", args, {}, tool, h.tui, h.scratch);
    const card = component();
    assert.match(plain(card.render(80).join("\n")), /Mark task active · in progress…/);
    const result = { content: [], details: { plan: { tasks: [{ id: "t1", title: "Check the outcome", status: "active" }] } }, isError: false };
    card.updateResult(result);
    const completed = plain(card.render(80).join("\n"));
    assert.match(completed, /● Check the outcome/);
    assert.doesNotMatch(completed, /Mark task active|in progress…/);
    const restored = component();
    restored.updateResult(result);
    assert.equal(plain(restored.render(80).join("\n")), completed);
    const failed = component();
    failed.updateResult({ content: [{ type: "text", text: "Revision expired" }], isError: true });
    const failure = plain(failed.render(80).join("\n"));
    assert.match(failure, /Revision expired/);
    assert.doesNotMatch(failure, /Mark task active|in progress…/);
  } finally { await h.close(); }
});

test("Tasks frame matches assistant lavender in dark/light themes, while body remains its own color", () => {
  for (const name of ["dark", "light"]) {
    const selected = getThemeByName(name), color = taskFrameColor(selected);
    const frame = taskFrame(selected, 40, [selected.fg("warning", "Blocked task")], "Tasks", "1 blocked");
    assert.ok(frame[0].includes(selected.style("╭", { fg: color })));
    assert.ok(frame[0].includes(selected.style(" Tasks ", { fg: color })));
    assert.ok(frame[1].includes(selected.fg("warning", "Blocked task")), "frame does not recolor task contents");
    assert.ok(frame.every(line => visibleWidth(line) === 40));
    assert.deepEqual(taskFrame(selected, 8, ["Narrow"], "Tasks"), ["Narrow"]);
  }
});

const bookWrite = (b, action, actor = "agent", now = 1000) => mutateBook(b, b.revision, action, actor, now);
const create = (b, title, titles = ["Read", "Build", "Check"], actor = "agent") => bookWrite(b, { op: "create", title, items: titles.map((title) => ({ title })) }, actor);
const taskWrite = (b, id, changes, actor = "agent", now = 2000) => bookWrite(b, { op: "task", planId: b.selectedId, mutation: { op: "update", id, changes } }, actor, now);

test("completed work stays quiet and full outcome details wrap and scroll", () => {
  let b = create(emptyBook(), "Preview");
  b = taskWrite(b, "t1", { status: "done", note: "Inspected task state, dock hosts, question theme and rendering. Confirmed the final words remain visible." });
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const panel = new TaskPanel(tui, theme, () => b, () => undefined, () => {});
  assert.doesNotMatch(plain(panel.render(60).join("\n")), /Inspected task state/);
  panel.handleInput("f"); panel.handleInput("d");
  const lines = panel.render(60);
  assert.match(plain(lines.join("\n")), /remain visible\./);
  assert.ok(lines.every(line => visibleWidth(line) <= 60));
  b = taskWrite(b, "t1", { note: "Long finding with Unicode 界面. ".repeat(35) });
  tui.terminal.rows = 24;
  const clipped = panel.render(40);
  assert.match(plain(clipped.join("\n")), /↑↓ scroll/);
  for (let i = 0; i < 999; i++) panel.handleInput("\x1b[B");
  assert.match(plain(panel.render(40).join("\n")), /Long finding|Unicode/);
  assert.ok(clipped.length <= Math.floor(24 * .85));
});

test("legacy migration is deterministic, lossless, read-only until a mutation and branch-local", async () => {
  let legacy = add(emptyPlan(), ["Original accepted task", "Original blocker"]);
  legacy = update(legacy, "t1", { status: "done", note: "Accepted by user", evidence: "artifact 界面" }, "user");
  legacy = update(legacy, "t2", { status: "blocked", reason: "Waiting for approval", dependsOn: ["t1"] });
  assert.deepEqual(migratePlan(legacy), migratePlan(legacy));
  assert.deepEqual(migratePlan(legacy).plans[0].state, legacy);
  const h = await harness();
  try {
    h.entries.push({ type: "custom", customType: ENTRY, data: legacy });
    await h.emit("session_start");
    assert.equal(h.entries.length, 1, "opening a legacy session does not rewrite history");
    assert.deepEqual((await h.call({ op: "list" })).details.plan, legacy);
    const forkPoint = structuredClone(h.entries);
    await h.command("tasks", "new Next request");
    const entry = h.entries.at(-1); assert.equal(entry.customType, BOOK_ENTRY);
    assert.equal(entry.data.plans.length, 2); assert.deepEqual(entry.data.plans[0].state, legacy);
    assert.equal(entry.data.plans[1].title, "Next request");
    await h.emit("session_compact"); assert.equal(JSON.parse((await h.call({ op: "plans" })).content[0].text).plans.length, 2);
    h.branch(forkPoint); await h.emit("session_tree");
    assert.equal(JSON.parse((await h.call({ op: "plans" })).content[0].text).plans.length, 1);
    assert.deepEqual((await h.call({ op: "list" })).details.plan, legacy);
  } finally { await h.close(); }
});

test("plans have stable identities, isolated tasks and an optimistic revision covering selection", () => {
  let b = create(emptyBook(), "First 界面 request");
  b = taskWrite(b, "t1", { status: "active" });
  const first = structuredClone(b.plans[0]), oldRevision = b.revision;
  b = create(b, "Second request");
  assert.equal(b.selectedId, "p2"); assert.deepEqual(b.plans[0], first);
  assert.equal(b.plans[1].state.tasks[0].id, "t1", "task IDs are local to their plan");
  assert.throws(() => mutateBook(b, oldRevision, { op: "task", planId: "p1", mutation: { op: "update", id: "t1", changes: { title: "stale" } } }, "agent"), /plan changed/);
  assert.throws(() => bookWrite(b, { op: "task", planId: "p1", mutation: { op: "update", id: "t1", changes: { title: "wrong plan" } } }), /Select this plan/);
  assert.match(bookContext(b), /Other unfinished plans \(paused/);
  const beforeSecond = structuredClone(b.plans[1]);
  b = bookWrite(b, { op: "select", planId: "p1" });
  b = taskWrite(b, "t1", { title: "Resume the first request" });
  assert.deepEqual(b.plans[1], beforeSecond);
  assert.equal(b.plans[0].state.tasks[0].status, "active", "select does not mutate task statuses or auto-start anything");
  assert.deepEqual(restoreBook(b), b);
});

test("archives are reversible, user-owned, and cannot be bypassed by agent writes or restore", () => {
  let b = create(emptyBook(), "Paused work");
  assert.throws(() => bookWrite(b, { op: "archive", planId: "p1" }), /Only the user/);
  b = bookWrite(b, { op: "archive", planId: "p1" }, "user");
  assert.equal(b.selectedId, null); assert.equal(b.plans[0].archivedBy, "user");
  assert.throws(() => bookWrite(b, { op: "select", planId: "p1" }), /archived/);
  assert.throws(() => bookWrite(b, { op: "restore", planId: "p1" }), /Only the user/);
  assert.throws(() => bookWrite(b, { op: "task", planId: "p1", mutation: { op: "add", items: [{ title: "Recreated" }] } }), /Archived/);
  const old = structuredClone(b.plans[0].state);
  b = create(b, "An unrelated request"); assert.deepEqual(b.plans[0].state, old);
  b = bookWrite(b, { op: "restore", planId: "p1" }, "user");
  assert.equal(b.selectedId, "p1"); assert.equal(b.plans[0].archivedAt, null); assert.deepEqual(b.plans[0].state, old);
  b = bookWrite(b, { op: "task", mutation: { op: "clear" } }, "user");
  assert.throws(() => create(b, "Bypass the clear"), /user cleared/);
  b = create(b, "Explicit fresh start", [], "user"); assert.equal(b.userCleared, false);
});

test("completion time persists, survives edits, resets on reopening and does not mislabel cancellations", () => {
  let b = create(emptyBook(), "Finish this", ["Only task"]);
  assert.equal(selectedPlan(b).closedAt, null);
  b = taskWrite(b, "t1", { status: "done", note: "Verified" }, "agent", 2000);
  assert.equal(selectedPlan(b).closedAt, 2000);
  b = taskWrite(b, "t1", { evidence: "test log" }, "agent", 9000); assert.equal(selectedPlan(b).closedAt, 2000);
  b = taskWrite(b, "t1", { status: "pending" }); assert.equal(selectedPlan(b).closedAt, null);
  b = taskWrite(b, "t1", { status: "cancelled" }); assert.equal(planInfo(selectedPlan(b), b).state, "closed");
  assert.equal(bookWrite(b, { op: "archive", planId: "p1" }).plans[0].archivedBy, "agent");
});

test("library restore rejects invalid IDs, selection, archives and limits without partial mutation", () => {
  const b = create(emptyBook(), "Valid");
  assert.throws(() => restoreBook({ ...b, selectedId: "p999" }), /current plan/);
  assert.throws(() => restoreBook({ ...b, plans: [...b.plans, ...b.plans] }), /Duplicate/);
  assert.throws(() => restoreBook({ ...b, plans: [{ ...b.plans[0], closedAt: 2000 }] }), /completion state/);
  assert.throws(() => restoreBook({ ...b, plans: [{ ...b.plans[0], archivedBy: "user" }] }), /Invalid saved/);
  assert.throws(() => create(b, "x".repeat(121)), /120/);
  assert.throws(() => create(b, "Atomic failure", ["okay", "x".repeat(201)]), /200/);
  assert.equal(b.plans.length, 1);
  let many = emptyBook();
  for (let i = 0; i < 100; i++) many = create(many, "Plan " + i, []);
  assert.throws(() => create(many, "Over capacity", []), /100 saved plans/);
  assert.equal(many.plans.length, 100);
});

test("tool creates and reads plan history without switching it; stale cross-plan edits are rejected", async () => {
  const h = await harness();
  const payload = async (args) => JSON.parse((await h.call(args)).content[0].text);
  try {
    await h.emit("session_start");
    let current = await payload({ op: "plans" });
    current = await payload({ op: "create", revision: current.revision, title: "First request", items: [{ title: "First item" }] });
    assert.equal(current.planId, "p1"); assert.deepEqual(current.addedIds, ["t1"]);
    current = await payload({ op: "create", revision: current.revision, title: "Second request", items: [{ title: "Second item" }] });
    const history = await payload({ op: "list", planId: "p1" });
    assert.equal(history.selectedId, "p2"); assert.equal(history.tasks[0].title, "First item");
    await assert.rejects(h.call({ op: "update", planId: "p1", revision: history.revision, id: "t1", changes: { title: "Don't update the wrong plan" } }), /Select this plan/);
    current = await payload({ op: "select", planId: "p1", revision: current.revision });
    await assert.rejects(h.call({ op: "update", planId: "p1", revision: history.revision, id: "t1", changes: { title: "stale" } }), /plan changed/);
    current = await payload({ op: "update", planId: "p1", revision: current.revision, id: "t1", changes: { status: "done", note: "Finished" } });
    const archived = await payload({ op: "archive", revision: current.revision });
    assert.equal(archived.planId, "p1", "archive returns the identity it changed even when it deselects it");
    assert.equal(archived.selectedId, null);
    const firstPage = await payload({ op: "plans", limit: 1 }); assert.equal(firstPage.nextOffset, 1); assert.equal(firstPage.total, 2);
    const secondPage = await payload({ op: "plans", offset: 1 }); assert.equal(secondPage.plans[0].state, "archived");
    assert.equal(h.handlers.has("agent_before_settle"), true);
  } finally { await h.close(); }
});

test("requirements preserve the small request when a larger follow-up is completed", async () => {
  for (const home of [false, true]) {
    const h = await harness({ home });
    const payload = async args => JSON.parse((await h.call(args)).content[0].text);
    try {
      await h.emit("session_start"); await h.emit("agent_start");
      let p = await payload({ op: "list" });
      p = await payload({ op: "create", revision: p.revision, title: "Tasks reliability",
        items: [{ title: "Reconcile run-end work", doneWhen: "One bounded checkpoint" }],
        requirements: [
          { title: "Clarify the added-task wording", source: "User: it still says added task: pending", acceptance: "Card says not started without changing stored pending" },
          { title: "Reconcile unfinished tasks", source: "User asks to reconcile stale unfinished plans", acceptance: "One bounded checkpoint", taskIds: ["t1"] },
        ] });
      assert.equal(p.coverage.uncovered, 1);
      p = await payload({ op: "update", revision: p.revision, id: "t1", changes: { status: "done", note: "Lifecycle regressions pass" } });
      const saved = h.entries.at(-1).data;
      assert.equal(saved.plans[0].requirements.length, 2);
      assert.equal(saved.plans[0].closedAt, null, "100% of tasks is not 100% of accepted requests");
      assert.equal(planInfo(saved.plans[0], saved).state, "open");
      const render = [...h.widgets.values()].flatMap(w => w.render(100)).map(plain).join("\n");
      assert.match(render, /requirement.*review/);
      await assert.rejects(() => h.call({ op: "archive", revision: p.revision }), /unfinished/);
      const before = structuredClone(h.entries);
      const checkpoint = (await h.emit("agent_before_settle", { outcome: "completed", context: { canContinue: false, pendingMessages: [] } })).find(r => r?.continue);
      assert.match(checkpoint.entries[0].content, /Clarify the added-task wording/);
      assert.match(checkpoint.entries[0].content, /conversation with the requirement records AND tasks/);
      assert.match(checkpoint.entries[0].content, /"state":"uncovered"/);
      assert.deepEqual(h.entries, before, "coverage checks never invent outcomes");
      await h.emit("agent_start");
      assert.equal((await h.emit("agent_before_settle", { outcome: "completed", context: { pendingMessages: [] } })).some(r => r?.continue), false);
      p = await payload({ op: "add", revision: p.revision, items: [{ title: "Clarify result card", doneWhen: "Card says not started" }] });
      p = await payload({ op: "requirements", revision: p.revision, requirements: [{ id: "r1", taskIds: ["t2"] }] });
      assert.equal(p.requirements[0].source, "User: it still says added task: pending");
      p = await payload({ op: "update", revision: p.revision, id: "t2", changes: { status: "done", note: "Card tests pass", evidence: "test log" } });
      assert.equal(p.coverage.reportedDone, 2);
      assert.notEqual(h.entries.at(-1).data.plans[0].closedAt, null);
      await h.emit("agent_settled");
    } finally { await h.close(); }
  }
});

test("requirement mutations are atomic, bounded, source-preserving and respect user boundaries", () => {
  let b = create(emptyBook(), "Coverage", ["Small outcome"]);
  const record = { title: "Small visible change", source: "User asks for wording 界面", acceptance: "Not-started label is visible", taskIds: ["t1"] };
  const amend = (base, requirements, actor = "agent") => bookWrite(base, { op: "requirements", requirements }, actor);
  b = amend(b, [record]);
  const before = structuredClone(b);
  for (const input of [
    [{ title: "Missing source", acceptance: "Observable" }],
    [{ ...record, source: " " }], [{ ...record, taskIds: ["t99"] }],
    [{ id: "r1", title: "Silently rewrite the request" }],
    [{ id: "r1", disposition: "superseded" }],
    [{ id: "r1", taskIds: [] }, { id: "r1", taskIds: ["t1"] }],
    Array.from({ length: 101 }, () => record),
  ]) assert.throws(() => amend(b, input));
  assert.deepEqual(b, before);
  assert.throws(() => mutateBook(b, "stale", { op: "requirements", requirements: [record] }, "agent"), /plan changed/);
  b = taskWrite(b, "t1", { status: "cancelled", note: "No longer needed" });
  assert.equal(b.plans[0].closedAt, null, "cancellation is not requirement satisfaction");
  assert.match(bookContext(b), /needs disposition/);
  b = amend(b, [{ id: "r1", disposition: "superseded", reason: "User changed the requested wording" }]);
  assert.equal(b.plans[0].requirements[0].source, record.source);
  assert.notEqual(b.plans[0].closedAt, null);
  assert.throws(() => amend(b, [{ id: "r1", disposition: "accepted" }]), /read-only/);
  b = amend(b, [{ ...record, title: "Replacement outcome", taskIds: [] }], "user");
  assert.equal(b.plans[0].requirements[1].id, "r2");
  assert.throws(() => amend(b, [{ id: "r2", taskIds: ["t1"] }]), /user's requirement/);
  const archived = bookWrite(b, { op: "archive", planId: "p1" }, "user");
  assert.throws(() => amend(archived, [record]), /No matching|editable/);
  const cleared = bookWrite(b, { op: "task", mutation: { op: "clear" } }, "user");
  assert.throws(() => amend(cleared, [record]), /uncleared/);
  assert.deepEqual(restoreBook(cleared), cleared);
  const switched = create(b, "Other work", []);
  assert.throws(() => bookWrite(switched, { op: "requirements", planId: "p1", requirements: [record] }), /editable/);
  assert.deepEqual(switched.plans[0], b.plans[0]);
});

test("v2 libraries migrate without invented coverage; malformed/future requirements fail closed", async () => {
  const legacy = create(emptyBook(), "Existing work");
  legacy.version = 2;
  for (const p of legacy.plans) delete p.requirements;
  const migrated = restoreBook(legacy);
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.plans[0].requirements, []);
  assert.deepEqual(migrated.plans[0].state, legacy.plans[0].state);
  assert.match(bookContext(migrated), /not recorded/);
  assert.throws(() => restoreBook({ ...migrated, version: 4 }), /Unsupported/);
  for (const requirements of [undefined, [{ id: "r1" }], Array(101).fill({})]) {
    assert.throws(() => restoreBook({ ...migrated, plans: [{ ...migrated.plans[0], requirements }] }), /requirement/i);
  }
  const h = await harness();
  try {
    h.entries.push({ type: "custom", customType: BOOK_ENTRY, data: legacy });
    await h.emit("session_start");
    assert.equal(h.entries.length, 1, "migration is read-only until a mutation");
    let p = JSON.parse((await h.call({ op: "requirements" })).content[0].text);
    assert.deepEqual(p.requirements, []);
    const record = { title: "Accepted request", source: "User's request reference", acceptance: "Visible outcome" };
    await h.call({ op: "requirements", revision: p.revision, requirements: [record] });
    assert.equal(h.entries.at(-1).data.version, 3);
    const expected = JSON.parse((await h.call({ op: "requirements" })).content[0].text).requirements;
    await h.emit("session_compact");
    assert.deepEqual(JSON.parse((await h.call({ op: "requirements" })).content[0].text).requirements, expected);
    await h.emit("session_start");
    assert.deepEqual(JSON.parse((await h.call({ op: "requirements" })).content[0].text).requirements, expected);
    h.branch([h.entries[0]]); await h.emit("session_tree");
    assert.deepEqual(JSON.parse((await h.call({ op: "requirements" })).content[0].text).requirements, []);
    h.failStorage();
    await assert.rejects(() => h.call({ op: "requirements", revision: p.revision, requirements: [record] }), /disk failed/);
    assert.deepEqual(JSON.parse((await h.call({ op: "requirements" })).content[0].text).requirements, []);
  } finally { await h.close(); }
});

test("requirement pages and read-only panel expose full sources without task edits", async () => {
  const h = await harness();
  try {
    await h.emit("session_start");
    let p = JSON.parse((await h.call({ op: "list" })).content[0].text);
    const result = await h.call({ op: "create", revision: p.revision, title: "Coverage", requirements: Array.from({ length: 25 }, (_, i) => ({
      title: `Outcome ${i} 界面`, source: `User request ${i}: retain this small change`, acceptance: `Observable result ${i}`,
    })) });
    p = JSON.parse(result.content[0].text);
    const first = await h.call({ op: "requirements" });
    const page = JSON.parse(first.content[0].text);
    assert.equal(page.requirements.length, 20); assert.equal(page.nextOffset, 20);
    assert.equal(JSON.parse((await h.call({ op: "requirements", offset: 20 })).content[0].text).requirements.length, 5);
    const b = h.entries.at(-1).data, before = structuredClone(b);
    assert.match(bookContext(b), /13 more; use tasks requirements/);
    for (const th of [getThemeByName("dark"), getThemeByName("light")]) for (const width of [12, 30, 80, 120]) {
      const toolLines = h.tools.get("tasks").renderResult(first, {}, th, { args: { op: "requirements" } }).render(width);
      assert.ok(toolLines.every(l => visibleWidth(l) <= width));
      const panel = new TaskPanel(h.tui, th, () => b, () => undefined, () => assert.fail("coverage must not edit"));
      panel.render(width); panel.handleInput("q");
      const lines = panel.render(width);
      assert.ok(lines.every(l => visibleWidth(l) <= width));
      if (width >= 80) { assert.match(lines.map(plain).join("\n"), /Outcome 0/); assert.doesNotMatch(lines.map(plain).join("\n"), /User request 0/); }
      panel.handleInput("\r"); panel.handleInput("a");
      if (width >= 80) assert.match(panel.render(width).map(plain).join("\n"), /User request 0/);
      panel.handleInput("\x1b");
      for (let i = 0; i < 999; i++) { panel.handleInput("\x1b[B"); panel.render(width); }
      panel.handleInput("\r");
      for (let i = 0; i < 999; i++) { panel.handleInput("\x1b[B"); panel.render(width); }
      const last = panel.render(width).map(plain).join("\n");
      if (width >= 80) assert.match(last, /Observable result 24/);
      panel.handleInput("\x1b");
      assert.ok(panel.render(width).every(l => visibleWidth(l) <= width));
    }
    assert.deepEqual(b, before);
  } finally { await h.close(); }
});

test("reconciliation grants at most one guarded pass to an agent-edited current plan", async () => {
  const h = await harness();
  const settle = (overrides = {}) => h.emit("agent_before_settle", {
    outcome: "completed", context: { canContinue: false, pendingMessages: [] }, ...overrides,
  }).then(results => results[0]);
  const payload = async args => JSON.parse((await h.call(args)).content[0].text);
  try {
    await h.emit("session_start");
    await h.command("tasks", "add Older unrelated work");
    await h.emit("agent_start");
    assert.equal(await settle(), undefined, "a carried-over plan does not start another call");
    let p = await payload({ op: "list" });
    p = await payload({ op: "add", revision: p.revision, items: [{ title: "Implement within scope" }] });
    assert.equal(await settle({ outcome: "aborted" }), undefined);
    assert.equal(await settle({ outcome: "error" }), undefined);
    // Before appending the reminder, Pi normally reports canContinue=false (last role: assistant).
    assert.equal(await settle({ context: { canContinue: false, pendingMessages: [{ role: "user" }] } }), undefined);
    const before = structuredClone(h.entries);
    const result = await settle();
    assert.equal(result.continue, true);
    assert.equal(result.entries[0].display, false);
    assert.match(result.entries[0].content, /Implement within scope/);
    assert.match(result.entries[0].content, /Continue only clearly authorized/);
    for (const pattern of [
      /original accepted requests and follow-ups/, /apparently closed plans/,
      /Missing requested work/, /Record-only updates/, /Unresolved evidence or blockers/,
      /Optional improvements/, /do not repeat successful checks merely to mark a task done/,
      /distinct risk, changed state, inconclusive result, or known instability/,
      /do not execute or turn them into accepted requirements without authorization/,
      /avoid a second completion announcement/,
    ]) assert.match(result.entries[0].content, pattern);
    assert.deepEqual(h.entries, before, "the hook does not claim task outcomes or alter plan state");
    const recall = [{ role: "custom", customType: "pi-tasks:reconcile-v1", content: "old checkpoint" },
      { role: "custom", customType: "pi-tasks:reconcile-v1", content: result.entries[0].content }];
    assert.deepEqual((await h.emit("context", { messages: recall }))[0].messages.filter(m => m.customType === "pi-tasks:reconcile-v1").map(m => m.content), [result.entries[0].content]);
    await h.emit("agent_start"); // Pi starts another agent loop for the boundary continuation.
    assert.equal(await settle(), undefined, "subsequent agent loops in the same run cannot continue again");
    await h.emit("agent_settled");
    assert.equal((await h.emit("context", { messages: recall }))[0].messages.some(m => m.customType === "pi-tasks:reconcile-v1"), false,
      "settled checkpoints are absent from future model context");
    await h.emit("agent_start");
    assert.equal(await settle(), undefined, "untouched carried-over tasks do not trigger on the next request");
    await h.emit("agent_settled");
    await h.emit("agent_start");
    p = await payload({ op: "list" });
    p = await payload({ op: "update", revision: p.revision, id: "t1", changes: { status: "done", note: "Observed done" } });
    p = await payload({ op: "update", revision: p.revision, id: "t2", changes: { status: "cancelled", note: "Superseded" } });
    assert.equal((await settle()).continue, true, "closed task lists still need the request-to-plan coverage check");
    await h.emit("agent_settled");
    await h.emit("agent_start");
    p = await payload({ op: "create", revision: p.revision, title: "Awaiting approval", items: [{ title: "Requires user choice" }] });
    await payload({ op: "update", revision: p.revision, id: "t1", changes: { status: "blocked", reason: "Needs user choice" } });
    assert.equal(await settle(), undefined, "all-blocked plans should wait for the user, not request another model call");
    await h.emit("agent_settled");
  } finally { await h.close(); }
});

test("reconciliation respects plan selection, off and restore boundaries", async () => {
  const h = await harness();
  const settle = () => h.emit("agent_before_settle", { outcome: "completed", context: { canContinue: false, pendingMessages: [] } }).then(r => r[0]);
  const payload = async args => JSON.parse((await h.call(args)).content[0].text);
  try {
    await h.emit("session_start"); await h.emit("agent_start");
    let p = await payload({ op: "plans" });
    p = await payload({ op: "create", revision: p.revision, title: "Run plan", items: [{ title: "Step" }] });
    await h.command("tasks", "new Another plan");
    assert.equal(await settle(), undefined, "switching plans removes automatic permission to resume earlier work");
    await h.command("tasks", "use p1");
    assert.equal((await settle()).continue, true);
    await h.emit("agent_settled");
    await h.emit("agent_start");
    p = await payload({ op: "list" });
    await payload({ op: "update", revision: p.revision, id: "t1", changes: { title: "Revised step" } });
    await h.command("tasks", "off");
    assert.equal(await settle(), undefined);
    await h.command("tasks", "on");
    await h.emit("session_tree");
    assert.equal(await settle(), undefined, "branch restoration clears old run eligibility");
  } finally { await h.close(); }
});

test("completed plans leave both dock implementations on schedule, remain in history, and do not flash again on resume", async (t) => {
  const h = await harness({ home: true });
  const snapshot = () => h.widgets.get("pi-home:identity").render(110).map(plain).join("\n");
  try {
    await h.emit("session_start"); await h.command("tasks", "new Ephemeral checklist"); await h.command("tasks", "add One task");
    const p = (await h.call({ op: "list" })).details.plan;
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
    await h.call({ op: "update", revision: p.revision, id: "t1", changes: { status: "done", note: "Done" } });
    const saved = h.entries.length;
    assert.match(snapshot(), /Plan closed/); assert.doesNotMatch(snapshot(), /✓ One task/);
    t.mock.timers.tick(COMPLETION_MS + 10);
    assert.doesNotMatch(snapshot(), /Ephemeral checklist|Plan closed/);
    assert.equal(h.entries.length, saved, "expiry is UI-only, not a persistent plan edit");
    assert.equal(JSON.parse((await h.call({ op: "plans" })).content[0].text).plans[0].state, "completed");
    await h.emit("session_tree"); assert.doesNotMatch(snapshot(), /Plan closed/);
    await h.command("home", "off"); assert.equal(h.widgets.has("pi-tasks:fallback"), false);
    const current = (await h.call({ op: "list" })).details.plan;
    await h.call({ op: "update", revision: current.revision, id: "t1", changes: { status: "pending" } });
    assert.ok(h.widgets.has("pi-tasks:fallback"));
    const reopened = (await h.call({ op: "list" })).details.plan;
    await h.call({ op: "update", revision: reopened.revision, id: "t1", changes: { status: "done", note: "Done again" } });
    t.mock.timers.tick(COMPLETION_MS + 10); assert.equal(h.widgets.has("pi-tasks:fallback"), false);
    await h.close(); t.mock.timers.tick(10_000); assert.equal(h.widgets.size, 0);
  } finally { t.mock.timers.reset(); if (process.env.PI_CODING_AGENT_DIR === h.scratch) await h.close(); }
});

test("manual new preserves earlier plans, stale dialogs cannot overwrite them, and off/on retains the whole library", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); await h.command("tasks", "new User named plan"); await h.command("tasks", "add User item");
    let answer;
    h.context.ui.input = () => new Promise((resolve) => answer = resolve);
    const pending = h.command("tasks", "new");
    const revision = JSON.parse((await h.call({ op: "plans" })).content[0].text).revision;
    await h.call({ op: "create", revision, title: "Agent plan" });
    answer("Stale dialog plan"); await pending;
    assert.equal(JSON.parse((await h.call({ op: "plans" })).content[0].text).total, 2);
    assert.match(h.notices.at(-1).text, /plan changed/);
    await h.command("tasks", "archive p1");
    await h.command("tasks", "restore p1");
    assert.equal((await h.call({ op: "list" })).details.plan.tasks[0].title, "User item");
    const before = h.entries.at(-1).data;
    await h.command("tasks", "off"); await h.emit("session_start"); await h.command("tasks", "on");
    assert.deepEqual(h.entries.at(-1).data, before);
    assert.equal(JSON.parse((await h.call({ op: "plans" })).content[0].text).total, 2);
  } finally { await h.close(); }
});

test("raised panel history is browse-only, actions are explicit and stale rendered task edits are ignored", async () => {
  let b = create(emptyBook(), "First plan"); b = create(b, "Second plan");
  let result, paints = 0;
  const nav = {};
  const panel = new TaskPanel({ terminal: { rows: 40 }, requestRender() { paints++; } }, theme, () => b, () => undefined, (r) => result = r, nav);
  const lines = panel.render(90), revision = b.revision;
  assert.match(plain(lines[0]), /╭.*Tasks.*╮/);
  for (const line of lines) { assert.equal(visibleWidth(line), 90); assert.match(line, /\x1b\[48;/, "every modal row has an explicit surface"); }
  panel.handleInput("h"); panel.render(90); panel.handleInput("\x1b[B"); panel.handleInput("\r");
  assert.equal(nav.viewId, "p1"); assert.equal(b.selectedId, "p2"); assert.equal(b.revision, revision);
  assert.match(panel.render(90).map(plain).join("\n"), /History · S to make current/);
  panel.handleInput("\r"); assert.equal(result, undefined, "historical plan cannot be edited by accidental Enter");
  panel.handleInput("s"); assert.deepEqual(result, { op: "select", planId: "p1", revision, id: undefined });
  b = bookWrite(b, { op: "select", planId: "p1" }, "user"); panel.render(90); result = undefined;
  b = taskWrite(b, "t1", { title: "Changed since last paint" }); panel.handleInput("\r");
  assert.equal(result, undefined); assert.ok(paints > 0);
  panel.render(90); panel.handleInput("\r"); assert.equal(result.revision, b.revision);
  for (const rows of [8, 12, 24, 40]) for (const width of [1, 2, 8, 20, 48, 90, 140]) {
    const p = new TaskPanel({ terminal: { rows }, requestRender() {} }, theme, () => b, () => undefined, () => {});
    for (const mode of ["", "d", "h"]) { if (mode) p.handleInput(mode); const rendered = p.render(width); assert.ok(rendered.length <= Math.max(4, Math.floor(rows * .85))); for (const line of rendered) assert.ok(visibleWidth(line) <= width); }
  }
});

test("Composer dock is responsive, motion-off stays still, and shows only sourced work", () => {
  const state = { prefs: { ...DEFAULTS, motion: "off" }, clock: new RunClock(), phase: "thinking", tools: new Map(), promptDepth: 0, compacting: false, lastInputAt: 0 };
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const ctx = { ui: { theme }, sessionManager: { getSessionName: () => "My 界面 plan" } };
  const docks = new Map([["test", { title: "Plan", rows: [{ text: "○ Real work" }], hint: "/tasks" }]]);
  let now = 1000;
  const workspace = createWorkspace(tui, () => ctx, state, docks, () => true, () => now);
  const first = workspace.render(100); now = 5000;
  assert.deepEqual(workspace.render(100), first);
  assert.match(first.map(plain).join("\n"), /Real work/);
  assert.doesNotMatch(first.map(plain).join("\n"), /DEMO|Finding the shape|mission/i);
  for (const height of [16, 24, 30, 40]) {
    tui.terminal.rows = height;
    for (const width of [1, 2, 8, 20, 48, 80, 140]) for (const line of workspace.render(width)) assert.ok(visibleWidth(line) <= width);
  }
  docks.clear();
  assert.deepEqual(workspace.render(100), [], "without a real provider, no demo or artwork appears");
  assert.equal(isSnapshot({ version: 1, sessionId: "test", id: "id", title: "Okay", rows: [{ text: "x", tone: "invalid" }] }), false);
  assert.equal(isHost({ version: 1, sessionId: "test", available: true, colors: {} }), false);
});

test("native question bridge validates links, blocks only linked agent task starts/completions and preserves independent work", async () => {
  for (const order of ["ask-first", "tasks-first"]) {
    const h = await harness({ ask: true, home: true, order });
    try {
      await h.emit("session_start");
      const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
      const created = JSON.parse((await h.call({ op: "create", revision: initial.revision, title: "Native thread", items: [{ title: "Release boundary" }, { title: "Independent verification" }] })).content[0].text);
      await h.callQuestion({ op: "post", question: { question: "Keep it local?", why: "Release scope belongs to you.", boundary: "Release waits; verification continues.", urgency: "blocking", planId: "p1", taskIds: ["t1"] } });
      await assert.rejects(() => h.call({ op: "update", revision: created.revision, id: "t1", changes: { status: "active" } }), /waits on question q1/);
      await assert.rejects(() => h.call({ op: "update", revision: created.revision, id: "t1", changes: { status: "done", note: "Pretend approval" } }), /No approval/);
      await h.call({ op: "update", revision: created.revision, id: "t2", changes: { status: "active" } });
      await assert.rejects(() => h.callQuestion({ op: "post", question: { question: "Unknown?", why: "Test", boundary: "Test", urgency: "blocking", planId: "p1", taskIds: ["t99"] } }), /unavailable/);
      const display = [...h.widgets.values()].flatMap(w => w.render(120)).map(plain).join("\n");
      assert.match(display, /blocking|question/); assert.match(display, /0\/2/);
      assert.equal(h.widgets.has("pi-ask:posted"), false, "Tasks owns the hosted attention hint, not duplicate Ask fallback");
      await h.command("tasks", "off"); assert.ok(h.widgets.has("pi-ask:posted"), "standalone Ask returns when Tasks is off");
      await h.command("tasks", "on"); assert.equal(h.widgets.has("pi-ask:posted"), false);
    } finally { await h.close(); }
  }
});

test("Tasks keeps its selected question under an Ask overlay and stable across answer reordering", async () => {
  const h = await harness({ ask: true });
  try {
    await h.emit("session_start");
    await h.callQuestion({ op: "post", question: { question: "First question?", why: "First reason", boundary: "One boundary", urgency: "blocking" } });
    await h.callQuestion({ op: "post", question: { question: "Second question?", why: "Second reason", boundary: "Can wait", urgency: "deferred" } });
    const book = emptyBook(), nav = { section: "questions" }, forms = [];
    const records = () => h.entries.filter(e => e.customType === "pi-ask:posted-v1").at(-1).data.questions.map(q => ({ id: q.id, revision: q.revision, question: q.definition.question, urgency: q.urgency, state: q.state, boundary: q.boundary, taskIds: q.taskIds }));
    h.context.ui.custom = (make, options) => new Promise(resolve => { const component = make(h.tui, theme, kb, resolve); component.focused = true; forms.push({ component, options }); });
    const panel = new TaskPanel(h.tui, theme, () => book, () => undefined, () => assert.fail("answering must not close/edit Tasks"), nav, () => true,
      { available: true, records, open(q) { h.events.emit(POSTED.open, { version: 1, sessionId: "test-session", id: q.id, revision: q.revision }); } });
    panel.render(100); panel.handleInput("\r");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(forms.at(-1).options.overlay, true);
    forms.at(-1).component.handleInput("Keep it local"); forms.at(-1).component.handleInput("\x1b");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(nav.questionId, "q1"); assert.match(panel.render(100).map(plain).join("\n"), /› ! First question/);
    panel.handleInput("\r"); await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(forms.at(-1).component.render(80).map(plain).join("\n"), /Keep it local/);
    forms.at(-1).component.handleInput("\r"); forms.at(-1).component.handleInput("\r"); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.messages.length, 1);
    await h.emit("context", { messages: h.messages });
    const q = JSON.parse((await h.callQuestion({ op: "list" })).content[0].text).questions[0];
    await h.callQuestion({ op: "apply", id: q.id, revision: q.revision, reason: "A local handoff, not publication." });
    panel.render(100); assert.equal(nav.questionId, "q1"); assert.equal(nav.questionIndex, 1, "same question stays selected after it moves below unanswered work");
  } finally { await h.close(); }
});

test("deferred answers become needed at the linked task boundary without losing queued delivery", async () => {
  const h = await harness({ ask: true });
  try {
    await h.emit("session_start"); const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
    const p = JSON.parse((await h.call({ op: "create", revision: initial.revision, title: "Dependency", items: [{ title: "Prepare the handoff" }] })).content[0].text);
    await h.callQuestion({ op: "post", question: { question: "How detailed?", why: "Changes the handoff.", boundary: "Can wait until handoff starts.", urgency: "deferred", planId: "p1", taskIds: ["t1"] } });
    let form;
    h.context.ui.custom = make => new Promise(resolve => { form = make(h.tui, theme, kb, resolve); form.focused = true; });
    const answer = h.command("questions", "q1"); await new Promise(resolve => setTimeout(resolve, 0));
    form.handleInput("Detailed, but keep it local"); form.handleInput("\r"); form.handleInput("\r"); await answer;
    const originalSubmission = h.messages[0].details.submissionRevision;
    await assert.rejects(() => h.call({ op: "update", revision: p.revision, id: "t1", changes: { status: "active" } }), /waits on question/);
    let q = JSON.parse((await h.callQuestion({ op: "list" })).content[0].text).questions[0];
    assert.equal(q.urgency, "blocking"); assert.equal(q.state, "submitted"); assert.equal(q.submissionRevision, originalSubmission);
    assert.match(q.neededNow, /linked work/);
    await h.emit("context", { messages: h.messages });
    q = JSON.parse((await h.callQuestion({ op: "list" })).content[0].text).questions[0]; assert.equal(q.state, "delivered");
    await h.callQuestion({ op: "apply", id: "q1", revision: q.revision, reason: "A detailed local handoff; no publishing." });
    await h.call({ op: "update", revision: p.revision, id: "t1", changes: { status: "active" } });
  } finally { await h.close(); }
});

test("request cards use progressive disclosure and attention metadata is validated", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
    const result = await h.call({ op: "create", revision: initial.revision, title: "Readable", requirements: [{ title: "Readable request", source: "Exact original wording", acceptance: "Observable condition" }] });
    const read = await h.call({ op: "requirements" }), tool = h.tools.get("tasks");
    const compact = tool.renderResult(read, { expanded: false }, theme, { args: { op: "requirements" } }).render(100).map(plain).join("\n");
    assert.match(compact, /Readable request/); assert.match(compact, /Needs linked work/); assert.doesNotMatch(compact, /Exact original wording|Reference r1/);
    const expanded = tool.renderResult(read, { expanded: true }, theme, { args: { op: "requirements" } }).render(100).map(plain).join("\n");
    assert.match(expanded, /Reference\s+r1/); assert.match(expanded, /Exact original wording/); assert.match(expanded, /Observable condition/);
    const base = { version: 1, sessionId: "test", id: "tasks", title: "Tasks", rows: [], overview: { revision: "r", total: 0, done: 0, blocked: 0, cancelled: 0, rows: [], more: 0 } };
    assert.equal(isSnapshot({ ...base, overview: { ...base.overview, questions: { blocking: -1, deferred: 0 } } }), false);
    assert.equal(isSnapshot({ ...base, overview: { ...base.overview, questions: { blocking: 1, deferred: 2 } } }), true);
  } finally { await h.close(); }
});

test("compact typography uses semantic glyphs and neutral titles without changing records", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
    const result = await h.call({ op: "create", revision: initial.revision, title: "Synthetic typography", items: ["Complete item", "Active item", "Blocked item", "Pending item", "Cancelled item"].map(title => ({ title })) });
    const states = ["done", "active", "blocked", "pending", "cancelled"];
    result.details.plan.tasks.forEach((t, i) => Object.assign(t, { status: states[i], note: i === 0 ? "Checked locally; not independently verified." : "", reason: i === 2 ? "Waiting for permission." : "" }));
    const before = structuredClone(result), tool = h.tools.get("tasks");
    for (const th of [getThemeByName("dark"), getThemeByName("light")]) {
      const lines = tool.renderResult(result, { expanded: false }, th, { args: { op: "list" } }).render(120);
      const text = lines.map(plain).join("\n");
      assert.match(text, /✓ Complete item/); assert.match(text, /● Active item/); assert.match(text, /! Blocked item/);
      assert.match(text, /○ Pending item/); assert.match(text, /– Cancelled item · cancelled/);
      assert.match(text, /Blocked: Waiting for permission/); assert.match(text, /1 active/);
      assert.doesNotMatch(text, /Task ·|Task done:|Task active:|verified complete/i);
      const complete = lines.find(line => plain(line).includes("Complete item"));
      assert.ok(complete.includes(th.fg("success", "✓ ")));
      assert.ok(complete.includes(th.style("Complete item", { fg: "text", bold: false })));
      assert.ok(!complete.includes(th.fg("success", "Complete item")), "success colors the mark, not the title");
      const expanded = tool.renderResult(result, { expanded: true }, th, { args: { op: "list" } }).render(120).map(plain).join("\n");
      assert.match(expanded, /Outcome · agent report/); assert.match(expanded, /not independently verified/); assert.match(expanded, /Reference\s+t1/);
    }
    assert.deepEqual(result, before, "rendering must never mutate stored outcomes");
  } finally { await h.close(); }
});

test("expanded requests group readable exact content with bounded prose and truthful coverage", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
    await h.call({ op: "create", revision: initial.revision, title: "Synthetic audit", requirements: [
      { title: "Prepare the implementation plan", source: "Original request first paragraph.\nSecond paragraph preserves Unicode 界面 é and permission caveats.", acceptance: "Give a sequenced, verifiable implementation plan before changing code. Preserve pre-existing work and make the approval boundary visible." },
      { title: "Review the remaining issue", source: "Keep the original words available.", acceptance: "Identify unresolved work without asserting approval." }
    ] });
    const read = await h.call({ op: "requirements" }), tool = h.tools.get("tasks");
    read.details.requirements[0].state = "reported done";
    read.details.requirements[0].taskIds = ["t1", "t2"];
    // Historical renderer input can retain paragraphs even though new canonical records normalize controls.
    read.details.requirements[0].source = read.details.requirements[0].source.replace(". Second", ".\nSecond");
    const before = structuredClone(read);
    for (const th of [getThemeByName("dark"), getThemeByName("light")]) {
      const lines = tool.renderResult(read, { expanded: true }, th, { args: { op: "requirements" } }).render(200);
      const body = lines.map(plain).slice(1, -1).map(line => line.slice(1, -1).trimEnd());
      const text = body.join("\n");
      assert.match(text, /Reported complete/); assert.match(text, /Needs linked work/);
      assert.match(text, /Criterion/); assert.match(text, /Original request/); assert.match(text, /Linked work\s+t1, t2/); assert.match(text, /Reference\s+r1/);
      assert.doesNotMatch(text, /What satisfaction looks like|Original wording:|Completion reported ·|verified complete/i);
      const heading = lines.find(line => plain(line).includes("Prepare the implementation plan"));
      assert.ok(heading.includes(th.style("Prepare the implementation plan", { fg: "text", bold: true })));
      const start = body.findIndex(line => line.trim() === "Criterion");
      const end = body.findIndex(line => line.trim() === "Original request");
      const criterion = body.slice(start + 1, end).filter(line => line.trim());
      assert.ok(criterion.length > 1, "wide windows still use a reading column");
      assert.ok(criterion.every(line => visibleWidth(line) <= 83));
      assert.equal(criterion.join("").replace(/\s/g, ""), read.details.requirements[0].acceptance.replace(/\s/g, ""));
      assert.ok(body.some(line => line.trim() === "Original request first paragraph."));
      assert.ok(body.some(line => line.trim().startsWith("Second paragraph")), "source paragraph boundaries survive rendering");
      assert.ok(body.some((line, i) => !line && body[i + 1] === ""), "records have a stronger boundary than fields");
    }
    assert.deepEqual(read, before);
  } finally { await h.close(); }
});

test("coverage qualifications survive narrow uncolored cards and all widths remain bounded", async () => {
  const h = await harness();
  try {
    await h.emit("session_start"); const initial = JSON.parse((await h.call({ op: "list" })).content[0].text);
    const result = await h.call({ op: "create", revision: initial.revision, title: "Width fixture", items: [{ title: "A long title 界面 🧭 é with the final words preserved at normal widths" }], requirements: [{ title: "Review 界面", source: "First\nSecond\u001b[31m unsafe styling", acceptance: "No implied approval." }] });
    const read = await h.call({ op: "requirements" }); read.details.requirements[0].state = "reported done";
    const tool = h.tools.get("tasks");
    for (const th of [getThemeByName("dark"), getThemeByName("light")]) for (const width of [0, 1, 2, 8, 12, 30, 80, 200]) for (const expanded of [false, true]) {
      for (const [value, op] of [[read, "requirements"], [result, "list"]]) {
        const lines = tool.renderResult(value, { expanded }, th, { args: { op } }).render(width);
        assert.ok(lines.every(line => visibleWidth(line) <= width), `${op} width ${width}`);
        assert.ok(lines.every(line => !line.includes("\n")), "one physical line per rendered row");
      }
      if (width >= 8) {
        const text = tool.renderResult(read, { expanded }, th, { args: { op: "requirements" } }).render(width).map(plain);
        const body = width < 12 ? text : text.slice(1, -1).map(line => line.slice(1, -1).trimEnd());
        assert.ok(body.join("").replace(/\s/g, "").includes("Reportedcomplete"), "qualification is in the body, not a possibly clipped rail");
      }
    }
  } finally { await h.close(); }
});

test("native Tasks shares neutral status typography, short grouped details and distinct selection", () => {
  let b = create(emptyBook(), "Typography fixture", ["Completed item", "Active item", "Blocked item", "Pending item"]);
  b = taskWrite(b, "t1", { status: "done", note: "Synthetic outcome only.", evidence: "local fixture" });
  b = taskWrite(b, "t2", { status: "active" });
  b = taskWrite(b, "t3", { status: "blocked", reason: "Explicit permission is required." });
  b = bookWrite(b, { op: "requirements", requirements: [{ title: "Preserve the original intent", source: "Exact original request, with scope and approval caveats.", acceptance: "Retain a visible approval boundary and preserve original user work.", taskIds: ["t1"] }] });
  const before = structuredClone(b);
  for (const th of [getThemeByName("dark"), getThemeByName("light")]) {
    const nav = { showDone: true }, panel = new TaskPanel({ terminal: { rows: 60 }, requestRender() {} }, th, () => b, () => undefined, () => {}, nav, () => true);
    const work = panel.render(150), text = work.map(plain).join("\n");
    assert.match(text, /› ✓ Completed item/); assert.match(text, /● Active item/); assert.match(text, /! Blocked item/);
    assert.match(text, /Blocked · Explicit permission is required/); assert.match(text, /Working/);
    assert.doesNotMatch(text, /Completion reported|Task · done|Current plan/);
    const complete = work.find(line => plain(line).includes("Completed item"));
    assert.ok(complete.includes(th.style("✓ ", { fg: th.colors.success })));
    assert.ok(complete.includes(th.style("Completed item", { fg: th.colors.text, bold: false })));
    assert.ok(work.some(line => line.includes(th.style("Typography fixture", { fg: th.colors.text, bold: true }))));
    panel.handleInput("q"); const requests = panel.render(150).map(plain).join("\n");
    assert.match(requests, /Reported complete · 1 linked/); assert.doesNotMatch(requests, /linked task/);
    panel.handleInput("\r"); const details = panel.render(150).map(plain).join("\n");
    assert.match(details, /Criterion/); assert.match(details, /Original request/); assert.match(details, /Exact original request/);
    assert.doesNotMatch(details, /What satisfaction looks like|Original wording/);
    panel.handleInput("\x1b"); panel.handleInput("w"); panel.handleInput("\r");
    const outcome = panel.render(150).map(plain).join("\n"); assert.match(outcome, /Outcome · agent report/); assert.match(outcome, /Synthetic outcome only/);
    for (const width of [1, 2, 8, 12, 30, 80, 150]) {
      const rendered = panel.render(width); assert.ok(rendered.every(line => visibleWidth(line) <= width));
    }
  }
  assert.deepEqual(b, before, "panel appearance must not change canonical state");
});
