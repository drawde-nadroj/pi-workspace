import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI, type ExtensionContext, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi, type TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { DOCK, isHost, cleanText, layoutDock, type DockAck, type DockColors, type DockSnapshot } from "../../lib/workspace-dock.ts";
import { taskFrame } from "../../lib/task-frame.ts";
import { taskResultCard, type TaskCardDetails } from "./transcript.ts";
import { ENTRY, STATUSES, counts, dockRows, progressLabel, taskOverview, type Plan, type Change, type Mutation } from "./state.ts";
import { BOOK_ENTRY, COMPLETION_MS, emptyBook, migratePlan, restoreBook, mutateBook, selectedPlan, resultPlan, planInfo, bookContext, isPlanClosed,
  type PlanBook, type BookMutation } from "./book.ts";
import { TaskPanel, type PanelResult, type PanelNavigation } from "./panel.ts";

import { FocusWindow } from "./focus.ts";
import { reconciliationMessage } from "./reconciliation.ts";
import { POSTED, isQuestionSnapshot, unresolved, type QuestionSnapshot } from "../../packages/pi-ask/extensions/ask-user-question/posted-protocol.ts";
import { ATOMIC_GUIDANCE, coverageGaps, requirementCoverage, type Requirement } from "./requirements.ts";

const TOOL = "tasks", WIDGET = "pi-tasks:fallback", MEMORY = "pi-tasks:context-v1";
const NewItem = Type.Object({ title: Type.String({ maxLength: 200 }), phase: Type.Optional(Type.String({ maxLength: 80 })),
  doneWhen: Type.Optional(Type.String({ maxLength: 400 })), dependsOn: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })) });
const RequirementItem = Type.Object({
  id: Type.Optional(Type.String({ description: "Existing rN to remap or supersede; omit to capture a new accepted requirement." })),
  title: Type.Optional(Type.String({ maxLength: 200 })),
  source: Type.Optional(Type.String({ maxLength: 800, description: "Required for new records: exact user quote or accurate request reference; not invented provenance." })),
  acceptance: Type.Optional(Type.String({ maxLength: 400, description: "Required for new records: independently observable acceptance condition." })),
  taskIds: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
  disposition: Type.Optional(StringEnum(["accepted", "superseded"] as const)),
  reason: Type.Optional(Type.String({ maxLength: 800, description: "Required when superseding. Original title/source/acceptance stay immutable." })),
});
const Params = Type.Object({
  op: StringEnum(["plans", "create", "select", "rename", "archive", "list", "add", "update", "requirements"] as const),
  requirements: Type.Optional(Type.Array(RequirementItem, { minItems: 1, maxItems: 100, description: "For create or requirements: append accepted requests or amend existing links/dispositions, never replace the ledger. Omit on requirements to read a page." })),
  revision: Type.Optional(Type.String({ description: "Required for all writes; use the current library revision from context, plans or list." })),
  planId: Type.Optional(Type.String({ description: "Plan ID (p1, p2…). list can read history without selecting it; task writes target the current plan." })),
  title: Type.Optional(Type.String({ maxLength: 120, description: "Concise name required for create or rename." })),
  offset: Type.Optional(Type.Integer({ minimum: 0, description: "List/history page offset; default 0." })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "List/history page size; default 20." })),
  items: Type.Optional(Type.Array(NewItem, { maxItems: 100 })),
  id: Type.Optional(Type.String({ description: "Task ID within the selected plan, for update." })),
  changes: Type.Optional(Type.Object({ title: Type.Optional(Type.String({ maxLength: 200 })), status: Type.Optional(StringEnum(STATUSES)),
    phase: Type.Optional(Type.String({ maxLength: 80 })), doneWhen: Type.Optional(Type.String({ maxLength: 400 })),
    dependsOn: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })), reason: Type.Optional(Type.String({ maxLength: 800 })),
    note: Type.Optional(Type.String({ maxLength: 1200 })), evidence: Type.Optional(Type.String({ maxLength: 1200 })) })),
});

export default function tasks(pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  let enabled = true, hidden = false, mounted = false, running = false;
  let touchedPlanId: string | undefined, reconciliationRequested = false;
  let appearance: "focus" | "compact" = "focus";
  const focus = new FocusWindow();
  let colors: DockColors | undefined;
  let book = emptyBook(), fault: string | undefined;
  let panelTui: TUI | undefined;
  let questions: QuestionSnapshot | undefined;
  const questionRecords = () => questions?.available ? questions.questions : [];
  const catalogue = () => { if (ctx) pi.events.emit(POSTED.catalogue, { version: 1, sessionId: sessionId(), available: enabled && !fault, attentionHosted: enabled && !hidden && !fault && ctx.mode === 'tui', plans: book.plans.filter(p => p.archivedAt === null).map(p => ({ id: p.id, title: p.title, taskIds: p.state.tasks.map(t => t.id), tasks: p.state.tasks.map(t => ({ id: t.id, title: t.title })) })) }); };
  const withAttention = (s: DockSnapshot): DockSnapshot => {
    const p = selectedPlan(book), open = questionRecords().filter(unresolved);
    if (!open.length) return s;
    const blocking = open.filter(q => q.urgency === "blocking").length, deferred = open.length - blocking;
    const row = { text: `${blocking ? `! ${blocking} blocking` : ""}${blocking && deferred ? " · " : ""}${deferred ? `? ${deferred} can wait` : ""} · /tasks questions`, tone: blocking ? "warning" as const : "muted" as const };
    s.rows = [row, ...s.rows].slice(0, 12); s.summary = `${blocking} blocking question${blocking === 1 ? "" : "s"} · ${deferred} can wait`;
    if (!s.overview) s.overview = { revision: book.revision, ...(p ? { planId: p.id } : {}), total: p?.state.tasks.length ?? 0,
      done: p?.state.tasks.filter(t => t.status === "done").length ?? 0, blocked: p?.state.tasks.filter(t => t.status === "blocked").length ?? 0,
      cancelled: p?.state.tasks.filter(t => t.status === "cancelled").length ?? 0, rows: [], more: 0 };
    s.overview.rows = [row, ...s.overview.rows].slice(0, 12);
    s.overview.questions = { blocking, deferred }; return s;
  };
  let completionTimer: ReturnType<typeof setTimeout> | undefined;
  let saves = Promise.resolve();
  const preferencesPath = join(getAgentDir(), "pi-tasks.json");
  const sessionId = () => ctx?.sessionManager.getSessionId();
  const stopCompletionTimer = () => { if (completionTimer) clearTimeout(completionTimer); completionTimer = undefined; };
  const snapshot = (): DockSnapshot => {
    const p = selectedPlan(book);
    const s: DockSnapshot = { version: 1, sessionId: sessionId() ?? "", id: "pi-tasks", title: p?.title ?? "Plans", rows: [], hint: "/tasks" };
    if (!enabled || hidden) return s;
    if (fault) { s.rows = [{ text: "Plan history couldn't be read · /tasks clear to reset", tone: "error" }]; return s; }
    if (!p) return withAttention(s);
    if (p.closedAt !== null) {
      if (Date.now() >= p.closedAt && Date.now() - p.closedAt < COMPLETION_MS) s.rows = [{ text: `${p.state.tasks.some((t) => t.status === "done") ? "✓" : "–"} Plan closed · ${counts(p.state)} · saved in /tasks`, tone: "muted" }];
      return withAttention(s);
    }
    s.rows = dockRows(p.state, running); s.summary = progressLabel(p.state); s.more = Math.max(0, p.state.tasks.length - 12);
    if (appearance === "focus") focus.apply(s, p.id, p.state, running);
    const gaps = coverageGaps(p.requirements, p.state);
    if (gaps.length) {
      s.summary = `${gaps.length} requirement${gaps.length === 1 ? " needs" : "s need"} coverage review`;
      // A closed task list is not a closed plan while accepted requests remain uncovered.
      if (!s.rows.length || p.state.tasks.every(t => t.status === "done" || t.status === "cancelled")) s.rows = [{ text: s.summary, tone: "warning" }];
    }
    s.overview = { ...taskOverview(p.state, running), planId: p.id };
    if (gaps.length && !s.overview.rows.length) s.overview.rows = [{ text: s.summary!, tone: "warning" }];
    return withAttention(s);
  };
  function fallback() {
    if (ctx?.mode !== "tui") return;
    const s = snapshot();
    if (!enabled || mounted || !s.rows.length) { ctx.ui.setWidget(WIDGET, undefined); return; }
    ctx.ui.setWidget(WIDGET, (tui) => ({ invalidate() {}, render(width) {
      if (!ctx || !enabled || mounted || width <= 0) return [];
      const th = ctx.ui.theme, current = snapshot();
      if (!current.rows.length) return [];
      const budget = Math.max(3, Math.min(7, Math.floor(tui.terminal.rows / 4)));
      const content = layoutDock(current, Math.max(1, width - 2), budget).map(r => th.fg(r.tone ?? "text", cleanText(r.text)));
      return taskFrame(th, width, content, "Tasks", current.summary ?? "");
    } }), { placement: "aboveEditor" });
  }
  function publish() {
    stopCompletionTimer();
    if (!ctx) return;
    catalogue(); pi.events.emit(DOCK.update, snapshot());
    fallback(); panelTui?.requestRender();
    const p = selectedPlan(book);
    const remaining = p?.closedAt != null && Date.now() >= p.closedAt ? p.closedAt + COMPLETION_MS - Date.now() : 0;
    // One bounded UI-only expiry; never an agent continuation or a history mutation.
    if (enabled && !hidden && !fault && ctx.mode === "tui" && remaining > 0) {
      completionTimer = setTimeout(publish, remaining + 5); completionTimer.unref();
    }
  }
  function commit(next: PlanBook) {
    pi.appendEntry(BOOK_ENTRY, structuredClone(next)); // Persist before publishing/returning success.
    book = next; fault = undefined; publish();
  }
  function restore(context: ExtensionContext, preserveActivity = false) {
    ctx = context; questions = undefined;
    if (!preserveActivity) { running = false; touchedPlanId = undefined; reconciliationRequested = false; focus.reset(); }
    let value: unknown, legacy = false;
    for (const entry of context.sessionManager.getBranch()) if (entry.type === "custom" && (entry.customType === ENTRY || entry.customType === BOOK_ENTRY)) {
      value = entry.data; legacy = entry.customType === ENTRY;
    }
    try { book = value === undefined ? emptyBook() : legacy ? migratePlan(value) : restoreBook(value); fault = undefined; }
    catch (error) { book = emptyBook(); fault = String(error); context.ui.notify(`pi-tasks: ${fault}. History was not overwritten. /tasks clear can explicitly reset it.`, "warning"); }
    publish(); pi.events.emit(POSTED.probe, { version: 1, sessionId: sessionId() });
  }
  function registerTool() {
    pi.registerTool({
      name: TOOL, label: "Plan", renderShell: "self", parameters: Params, exposure: enabled ? "direct" : "hidden", executionMode: "sequential",
      description: ATOMIC_GUIDANCE + " All writes require the current library revision. requirements without inputs reads records; with inputs appends/remaps/supersedes them in the selected plan. create accepts requirements alongside tasks. Track named plans for substantial user requests. For a NEW substantial request use create with a concise title and optional pending items; preserve earlier plans. For a follow-up update the existing plan. plans browses history; list reads tasks and revision; add/update edit only the current plan. One active focus task per plan; inactive plans are paused. blocked requires reason; done requires a truthful note and available evidence references (not independent verification). Before finishing work on a plan, reconcile open tasks with actual results: complete only verified work, revise changed steps, block with reason, or cancel genuinely superseded steps. Continue only work already authorized; otherwise explain the remaining work or ask one consequential question. Preserve user edits and archives. Skip trivial requests. No broader scope from a task alone.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async execute(_callId, params, signal, _onUpdate, context) {
        if (!enabled) throw new Error("Tasks are off. Only the user can enable them with /tasks on.");
        if (signal?.aborted) throw new Error("Task update cancelled.");
        if (!ctx || context.sessionManager.getSessionId() !== sessionId()) throw new Error("Task session changed; retry in the current session.");
        if (fault) throw new Error(`Task history is unreadable: ${fault}. Ask the user before resetting it.`);
        if (params.requirements !== undefined && params.op !== "create" && params.op !== "requirements") throw new Error("Use create or requirements to record accepted requests.");
        const read = params.op === "list" || params.op === "plans" || params.op === "requirements" && params.requirements === undefined;
        const requestedPlanId = params.planId ?? book.selectedId;
        if (!read) {
          if (!params.revision) throw new Error("Writes require the current library revision; read tasks first.");
          let action: BookMutation;
          if (params.op === "create") {
            if (!params.title) throw new Error("create requires a concise plan title.");
            action = { op: "create", title: params.title, items: params.items, requirements: params.requirements };
          } else if (params.op === "requirements") {
            action = { op: "requirements", planId: params.planId, requirements: params.requirements! };
          } else if (params.op === "select" || params.op === "archive" || params.op === "rename") {
            const planId = params.planId ?? book.selectedId;
            if (!planId) throw new Error("Specify planId; use plans to browse history.");
            if (params.op === "rename") { if (!params.title) throw new Error("rename requires title."); action = { op: "rename", planId, title: params.title }; }
            else action = { op: params.op, planId };
          } else {
            let mutation: Mutation;
            if (params.op === "add") {
              if (!params.items?.length) throw new Error("add requires items.");
              mutation = { op: "add", items: params.items };
            } else {
              if (!params.id || !params.changes || !Object.keys(params.changes).length) throw new Error("update requires id and nonempty changes.");
              mutation = { op: "update", id: params.id, changes: params.changes };
            }
            action = { op: "task", planId: params.planId, mutation };
          }
          if (params.op === "update" && ["active", "done"].includes(params.changes?.status ?? "")) {
            const gate = questionRecords().find(q => unresolved(q) && q.planId === requestedPlanId && q.taskIds.includes(params.id!));
            if (gate) {
              if (gate.urgency === "deferred") pi.events.emit(POSTED.needed, { version: 1, sessionId: sessionId(), id: gate.id, revision: gate.revision, planId: requestedPlanId, taskId: params.id });
              throw new Error(`Linked work waits on question ${gate.id}. An answer must be delivered and reported applied before starting/completing this task. No approval is inferred.`);
            }
          }
          if (params.op === "archive" && questionRecords().some(q => q.planId === requestedPlanId && unresolved(q))) throw new Error("This plan has unresolved questions. Apply or explicitly disposition them before agent archival.");
          commit(mutateBook(book, params.revision, action, "agent"));
          if (running && (params.op === "create" || params.op === "add" || params.op === "update" || params.op === "requirements")) touchedPlanId = book.selectedId ?? undefined;
        }
        const offset = read ? params.offset ?? 0 : 0, limit = read ? params.limit ?? 20 : 20;
        const pageInfo = (size: number) => size > offset + limit ? { more: size - offset - limit, nextOffset: offset + limit } : {};
        if (params.op === "plans") {
          const plans = [...book.plans].reverse().slice(offset, offset + limit).map((p) => planInfo(p, book));
          const payload = { revision: book.revision, selectedId: book.selectedId, total: book.plans.length, plans, ...pageInfo(book.plans.length) };
          return { content: [{ type: "text", text: JSON.stringify(payload) }], details: { plans, plan: resultPlan(book) } };
        }
        const p = params.op === "create" ? selectedPlan(book) : requestedPlanId ? book.plans.find((p) => p.id === requestedPlanId) : selectedPlan(book);
        if (params.planId && !p) throw new Error(`Unknown plan ${params.planId}. Use plans.`);
        const plan = resultPlan(book, p), n = params.items?.length ?? 0;
        const coverage = requirementCoverage(p?.requirements ?? [], plan);
        const coverageSummary = { recorded: coverage.length, uncovered: coverage.filter(r => r.state === "uncovered").length,
          needsDisposition: coverage.filter(r => r.state === "needs disposition").length, reportedDone: coverage.filter(r => r.state === "reported done").length };
        if (params.op === "requirements") {
          const requirements = coverage.slice(offset, offset + limit);
          const payload = { revision: book.revision, selectedId: book.selectedId, planId: p?.id ?? null, requirements, coverage: coverageSummary, ...pageInfo(coverage.length) };
          return { content: [{ type: "text", text: JSON.stringify(payload) }], details: { plan, requirements, title: p?.title } };
        }
        const changed = params.op === "list" ? plan.tasks : params.op === "update" ? plan.tasks.filter((t) => t.id === params.id)
          : params.op === "add" || params.op === "create" ? n ? plan.tasks.slice(-n) : [] : [];
        const page = changed.slice(offset, offset + limit).map((t) => ({ ...t,
          reason: t.reason.length > 400 ? t.reason.slice(0, 400) + "… (full text in /tasks)" : t.reason,
          note: t.note.length > 400 ? t.note.slice(0, 400) + "… (full text in /tasks)" : t.note,
          evidence: t.evidence.length > 400 ? t.evidence.slice(0, 400) + "… (full text in /tasks)" : t.evidence }));
        const payload = { revision: book.revision, selectedId: book.selectedId, planId: p?.id ?? null, title: p?.title ?? null, counts: counts(plan), tasks: page, coverage: coverageSummary,
          ...pageInfo(changed.length), ...((params.op === "add" || params.op === "create") ? { addedIds: changed.map((t) => t.id) } : {}) };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: { plan, planId: p?.id, title: p?.title } };
      },
      renderCall(args, theme, context) {
        const labels: Record<string, string> = { requirements: args.requirements ? "Record requirements" : "Read requirement coverage", plans: "Read plan history", list: "Read tasks", create: "Create plan", add: "Add tasks", update: args.changes?.status ? `Mark task ${args.changes.status}` : "Update task", select: "Select plan", rename: "Rename plan", archive: "Archive plan" };
        const operation = labels[args.op ?? ""] ?? "Task operation";
        return { invalidate() {}, render(width: number) {
          // Pi retains the call component beside the result; only show it while pending.
          if (!context.isPartial) return [];
          return taskFrame(theme, width, [theme.fg("accent", `◇ ${operation}`) + theme.fg("muted", " · in progress…")]);
        } };
      },
      renderResult(result, options, theme, context) {
        const details = result.details as TaskCardDetails | undefined;
        if (!details?.plan) return { invalidate() {}, render(width: number) {
          const error = cleanText(result.content.filter(c => c.type === "text").map(c => c.text).join("\n"));
          return taskFrame(theme, width, wrapTextWithAnsi(theme.fg("error", error), Math.max(1, width - 2)));
        } };
        return { invalidate() {}, render(width: number) {
          return taskResultCard(details, context.args, !!options.expanded, theme, width);
        } };
      },
    });
  }
  registerTool(); // No timers, filesystem writes, or UI during factory loading.
  pi.events.on(POSTED.catalogueProbe, (request: any) => { if (request?.version === 1 && request.sessionId === sessionId()) catalogue(); });
  pi.events.on(POSTED.update, value => {
    if (!isQuestionSnapshot(value) || value.sessionId !== sessionId()) return;
    questions = value; publish();
  });
  pi.events.on(DOCK.host, (value) => {
    if (!isHost(value) || !ctx || value.sessionId !== sessionId()) return;
    mounted = false; colors = value.available ? value.colors : undefined;
    if (value.available) publish(); else fallback();
    panelTui?.requestRender();
  });
  pi.events.on(DOCK.ack, (value) => {
    const ack = value as DockAck | undefined;
    if (!ack || ack.version !== 1 || ack.id !== "pi-tasks" || ack.sessionId !== sessionId() || typeof ack.mounted !== "boolean") return;
    mounted = ack.mounted; fallback();
  });
  pi.on("session_start", async (_event, context) => {
    ctx = context; mounted = false; colors = undefined;
    try {
      const p = JSON.parse(await readFile(preferencesPath, "utf8"));
      if (typeof p.enabled !== "boolean") throw new Error("enabled must be boolean"); enabled = p.enabled;
      if (p.appearance !== undefined && !["focus", "compact"].includes(p.appearance)) throw new Error("Invalid task appearance");
      appearance = p.appearance ?? "focus";
      if (p.hidden !== undefined && typeof p.hidden !== "boolean") throw new Error("hidden must be boolean");
      hidden = p.hidden ?? false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") { enabled = false; context.ui.notify(`pi-tasks disabled: couldn't read ${preferencesPath}. ${String(error)}`, "warning"); }
    }
    registerTool(); restore(context); pi.events.emit(DOCK.probe, { version: 1, sessionId: sessionId() });
  });
  pi.on("session_tree", (_event, context) => restore(context));
  pi.on("session_compact", (_event, context) => restore(context, true));
  pi.on("agent_start", (_event, context) => { ctx = context; if (!running) { touchedPlanId = undefined; reconciliationRequested = false; } running = true; publish(); });
  pi.on("agent_before_settle", (event) => {
    const p = selectedPlan(book);
    if (!enabled || fault || !running || reconciliationRequested || event.outcome !== "completed" ||
      event.context.pendingMessages.length || !p || p.id !== touchedPlanId || p.state.userCleared || book.userCleared) return;
    const open = p.state.tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
    if (open.length && open.every(t => t.status === "blocked") && !coverageGaps(p.requirements, p.state).length) return;
    // One extra model request only for a plan the agent edited in this run. Never mutate statuses
    // from lifecycle events: completion, cancellation and blockers require the agent's judgment.
    reconciliationRequested = true;
    return { entries: [{ type: "custom_message" as const, customType: "pi-tasks:reconcile-v1", display: false,
      content: reconciliationMessage(p) }], continue: true };
  });
  pi.on("agent_settled", () => { running = false; touchedPlanId = undefined; reconciliationRequested = false; publish(); });
  pi.on("context", (event) => {
    let lastReconcile = -1;
    if (enabled && !fault && running && reconciliationRequested) event.messages.forEach((m, i) => {
      if (m.role === "custom" && m.customType === "pi-tasks:reconcile-v1") lastReconcile = i;
    });
    const messages = event.messages.filter((m, i) => !(m.role === "custom" && (m.customType === MEMORY || m.customType === "pi-tasks:reconcile-v1" && i !== lastReconcile)));
    if (!enabled || fault || !ctx) return { messages };
    return { messages: [...messages, { role: "custom" as const, customType: MEMORY, content: bookContext(book), display: false, timestamp: 0 }] };
  });
  pi.on("session_shutdown", () => {
    stopCompletionTimer();
    if (ctx) { const s = snapshot(); s.rows = []; pi.events.emit(DOCK.update, s); }
    if (ctx?.mode === "tui") ctx.ui.setWidget(WIDGET, undefined);
    if (ctx) pi.events.emit(POSTED.catalogue, { version: 1, sessionId: sessionId(), available: false, plans: [] });
    questions = undefined; ctx = undefined; mounted = false; touchedPlanId = undefined; reconciliationRequested = false; colors = undefined; panelTui = undefined;
  });

  async function savePreferences(context: ExtensionContext) {
    const preferences = { enabled, appearance, hidden };
    saves = saves.then(async () => {
      const temp = preferencesPath + "." + randomUUID() + ".tmp";
      try {
        await mkdir(getAgentDir(), { recursive: true });
        await writeFile(temp, JSON.stringify(preferences, null, 2) + "\n", { mode: 0o600 }); await rename(temp, preferencesPath);
      } catch (error) { context.ui.notify(`Task appearance/state changed for this runtime, but couldn't save preference: ${String(error)}`, "warning"); }
      finally { await rm(temp, { force: true }).catch(() => {}); }
    });
    await saves;
  }
  async function setEnabled(value: boolean, context: ExtensionContext) {
    enabled = value; registerTool();
    if (!value) pi.setActiveTools(pi.getActiveTools().filter((name) => name !== TOOL));
    publish();
    await savePreferences(context);
    context.ui.notify(value ? "Tasks on · saved plan library restored · no automatic continuation." : "Tasks off · tool, reminders, and UI disabled. All saved plans preserved. Workspace unchanged.", "info");
  }
  async function userChange(context: ExtensionCommandContext, result: Exclude<PanelResult, undefined>, suppliedTitle?: string) {
    if (result === "off") return setEnabled(false, context);
    const revision = result.revision;
    if (revision !== book.revision) throw new Error("The plan changed while the panel was open; review it again.");
    if (result.op === "new") {
      if (fault) throw new Error("Unreadable history is preserved; /tasks clear can explicitly reset it.");
      const title = suppliedTitle ?? await context.ui.input("Name the new plan", "");
      if (title?.trim()) commit(mutateBook(book, revision, { op: "create", title }, "user"));
      return;
    }
    if (result.op === "clear") {
      const confirm = fault ? "Reset the unreadable plan library?" : "Clear this plan's tasks?";
      if (await context.ui.confirm(confirm, "Older session entries remain. The agent cannot recreate cleared work until you use /tasks new or /tasks add.")) {
        if (book.revision !== revision) throw new Error("The plan changed; review it again before clearing.");
        if (fault) { const next = emptyBook(); next.userCleared = true; commit(next); }
        else commit(mutateBook(book, revision, { op: "task", planId: result.planId, mutation: { op: "clear" } }, "user"));
      }
      return;
    }
    if (fault) throw new Error("Task history couldn't be restored; reset only with explicit approval.");
    const p = book.plans.find((p) => p.id === result.planId);
    if (!p) throw new Error("That plan is no longer available on this branch.");
    if (result.op === "select" || result.op === "restore") {
      commit(mutateBook(book, revision, { op: result.op, planId: p.id }, "user")); return;
    }
    if (result.op === "archive") {
      if (!isPlanClosed(p) && !(await context.ui.confirm(`Archive ${p.title}?`, "Unfinished tasks will be paused in history. Nothing is deleted or executed; you can restore it later."))) return;
      commit(mutateBook(book, revision, { op: "archive", planId: p.id }, "user")); return;
    }
    if (result.op === "rename") {
      const title = suppliedTitle ?? await context.ui.input("Plan name", p.title);
      if (title?.trim()) commit(mutateBook(book, revision, { op: "rename", planId: p.id, title }, "user")); return;
    }
    if (result.op === "add") {
      const title = suppliedTitle ?? await context.ui.input("Add a task");
      if (title?.trim()) commit(mutateBook(book, revision, { op: "task", planId: p.id, mutation: { op: "add", items: [{ title }] } }, "user")); return;
    }
    const task = p.state.tasks.find((t) => t.id === result.id);
    if (!task) return;
    const options = ["Change status", "Rename", "Set phase", "Set done-when criterion", "Set dependencies", "Record outcome / evidence"];
    const action = await context.ui.select(`${task.id} · ${task.title}`, options);
    let changes: Change | undefined;
    if (action === options[0]) {
      const status = await context.ui.select("Task status", [...STATUSES]); if (!status) return;
      changes = { status: status as Change["status"] };
      if (status === "blocked") { const reason = await context.ui.input("What is it waiting for?", task.reason); if (!reason) return; changes.reason = reason; }
      if (status === "done") { const note = await context.ui.input("What was completed or accepted?", task.note); if (!note) return; changes.note = note; }
    } else if (action === options[1]) { const title = await context.ui.input("Task title", task.title); if (title !== undefined) changes = { title }; }
    else if (action === options[2]) { const phase = await context.ui.input("Phase (blank removes it)", task.phase); if (phase !== undefined) changes = { phase }; }
    else if (action === options[3]) { const doneWhen = await context.ui.input("Done when…", task.doneWhen); if (doneWhen !== undefined) changes = { doneWhen }; }
    else if (action === options[4]) {
      const value = await context.ui.input("Dependency IDs, comma separated (blank clears)", task.dependsOn.join(", "));
      if (value !== undefined) changes = { dependsOn: value.split(/[\s,]+/).filter(Boolean) };
    } else if (action === options[5]) {
      const note = await context.ui.input("Outcome note (your report, not an automatic verification)", task.note); if (note === undefined) return;
      const evidence = await context.ui.input("Evidence reference: test result, artifact, or acceptance", task.evidence);
      if (evidence !== undefined) changes = { note, evidence };
    }
    if (changes) commit(mutateBook(book, revision, { op: "task", planId: p.id, mutation: { op: "update", id: task.id, changes } }, "user"));
  }
  pi.registerCommand("tasks", {
    description: "Work, Requests and Questions in a native panel. Named session plans: history, new <name>, use/archive/restore <planId>, add <task>, rename <name>, clear, hide, unhide, on, off. Hide only affects the dock. Workspace is independent.",
    getArgumentCompletions: (prefix) => ["show", "requests", "questions", "view focus", "view compact", "history", "new ", "use ", "archive", "restore ", "rename ", "add ", "clear", "hide", "unhide", "on", "off"].filter((s) => s.startsWith(prefix)).map((s) => ({ value: s, label: s })),
    handler: async (args, context) => {
      ctx = context; const command = args.trim();
      try {
        if (command === "on" || command === "off") return await setEnabled(command === "on", context);
        if (command === "hide" || command === "unhide") {
          hidden = command === "hide";
          publish(); await savePreferences(context);
          context.ui.notify(hidden
            ? "Tasks dock hidden · tracking unchanged · /tasks opens the panel · /tasks unhide restores the dock."
            : enabled ? "Tasks dock visible when a plan is open. Tracking unchanged."
            : "Tasks dock visibility restored. Tasks remain off; /tasks on enables tracking.", "info");
          return;
        }
        if (/^view (focus|compact)$/.test(command)) {
          appearance = command.endsWith("focus") ? "focus" : "compact";
          publish(); await savePreferences(context);
          context.ui.notify(`Tasks fallback: ${appearance === "focus" ? "Focus" : "Compact"} · applies when Workspace is off · plan unchanged.`, "info"); return;
        }
        if (["prev", "next", "follow"].includes(command)) {
          if (!enabled) { context.ui.notify("Tasks are off. /tasks on restores them.", "info"); return; }
          const p = selectedPlan(book);
          if (!p) { context.ui.notify("No current plan. /tasks history shows saved plans.", "info"); return; }
          if (command === "follow") focus.follow(p.id, p.state);
          else focus.move(p.id, p.state, command === "prev" ? -1 : 1);
          appearance = "focus"; publish(); return;
        }
        if (!enabled) { context.ui.notify("Tasks are off. /tasks on restores all saved plans. Workspace is independent.", "info"); return; }
        if (command === "new" || command.startsWith("new ")) {
          if (!context.hasUI && command === "new") { context.ui.notify("Specify a name: /tasks new <name>", "info"); return; }
          await userChange(context, { op: "new", revision: book.revision }, command.slice(4).trim() || undefined); return;
        }
        if (command.startsWith("add ")) {
          if (fault) throw new Error("Task history couldn't be restored. /tasks clear can explicitly reset it.");
          if (!selectedPlan(book)) {
            // Manual add explicitly unlocks a fresh plan without destroying earlier plans.
            commit(mutateBook(book, book.revision, { op: "create", title: "Session plan", items: [{ title: command.slice(4) }] }, "user"));
          } else await userChange(context, { op: "add", planId: book.selectedId!, revision: book.revision }, command.slice(4));
          return;
        }
        if (command.startsWith("use ") || command.startsWith("restore ") || command.startsWith("archive ") || command === "archive") {
          const [verb, id] = command.split(/\s+/);
          const planId = id || book.selectedId;
          if (!planId) throw new Error("Specify a plan ID from /tasks history.");
          const op = verb === "use" ? "select" : verb as "restore" | "archive";
          if (!context.hasUI && op === "archive" && !(book.plans.find((p) => p.id === planId)?.closedAt != null)) throw new Error("Archiving unfinished work requires confirmation in interactive or RPC mode.");
          await userChange(context, { op, planId, revision: book.revision }); return;
        }
        if (command.startsWith("rename ")) {
          if (!book.selectedId) throw new Error("Select a plan before renaming it.");
          await userChange(context, { op: "rename", planId: book.selectedId, revision: book.revision }, command.slice(7)); return;
        }
        if (command === "clear") {
          if (!context.hasUI) { context.ui.notify("/tasks clear requires confirmation in interactive or RPC mode.", "warning"); return; }
          if (!fault && !book.selectedId) { context.ui.notify("No current plan to clear. /tasks history shows saved plans.", "info"); return; }
          await userChange(context, { op: "clear", planId: book.selectedId ?? "", revision: book.revision }); return;
        }
        if (command && command !== "show" && command !== "history" && command !== "questions" && command !== "requests") { context.ui.notify("Usage: /tasks [requests|questions|prev|next|follow|view focus|view compact|history|new <name>|use <id>|archive [id]|restore <id>|rename <name>|add <task>|clear|hide|unhide|on|off]", "info"); return; }
        if (fault) { context.ui.notify(`Task history unreadable: ${fault}. /tasks clear can reset it.`, "warning"); return; }
        if (context.mode !== "tui") { context.ui.notify(command === "history" ? JSON.stringify(book.plans.map((p) => planInfo(p, book))) : bookContext(book), "info"); return; }
        const nav: PanelNavigation = { history: command === "history", section: command === "questions" ? "questions" : command === "requests" ? "requests" : "work" };
        for (;;) {
          pi.events.emit(POSTED.interaction, { version: 1, sessionId: sessionId(), id: "pi-tasks:browser", active: true });
          let result: PanelResult;
          try { result = await context.ui.custom<PanelResult>((tui, theme, _kb, done) => {
            panelTui = tui;
            return new TaskPanel(tui, theme, () => book, () => colors, done, nav, () => running, {
              get available() { return !!questions?.available; }, get fault() { return questions?.fault; }, records: questionRecords,
              open(q) { pi.events.emit(POSTED.open, { version: 1, sessionId: sessionId(), id: q.id, revision: q.revision }); },
            });
          }, { overlay: true, overlayOptions: { width: "85%", maxHeight: "85%", anchor: "center" } });
          } finally { pi.events.emit(POSTED.interaction, { version: 1, sessionId: context.sessionManager.getSessionId(), id: "pi-tasks:browser", active: false }); }
          panelTui = undefined;
          if (!result) break;
          await userChange(context, result);
          if (result !== "off" && ["new", "select", "restore"].includes(result.op)) { nav.viewId = book.selectedId ?? undefined; nav.history = false; nav.selected = 0; }
          if (!enabled) break;
        }
      } catch (error) { context.ui.notify(`Tasks: ${String(error)}`, "warning"); }
      finally { panelTui = undefined; }
    },
  });
}
