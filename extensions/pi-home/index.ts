import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  getAgentDir, type ExtensionAPI, type ExtensionContext, type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { EditorComponent, TUI } from "@earendil-works/pi-tui";
import { installPaintGuard } from "./paint-guard.ts";
import { ActivityBlocks } from "./activity-blocks.ts";
import { SentMessageFrames } from "./sent-messages.ts";
import { calendarDay } from "./sent-metadata.ts";
import { GroupedTools } from "./grouped-tools.ts";
import { readTranscript, transcriptDefaults } from "./transcript-presentation.ts";
import { dressComposerEditor, isEditorComponent } from "./composer-editor.ts";
import { createFooter, createHeader, HomeEditor } from "./ui.ts";
import { createWorkspace } from "./workspace.ts";
import { DOCK, isSnapshot, type DockSnapshot } from "../../lib/home-dock.ts";
import { POSTED } from "../../packages/pi-ask/extensions/ask-user-question/posted-protocol.ts";
import { ThemeLease } from "./composer-theme.ts";
import { registerRecaps } from "./recaps.ts";
import { registerFooter } from "./footer.ts";
import {
  DEFAULTS, TIMING_ENTRY, RunClock, preferencesFrom, shouldAnimate,
  type HomeState, type Outcome, type Preferences,
} from "./state.ts";

type EditorFactory = Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0];
const COMMANDS = ["output raw", "output readable", "composer", "details on", "details off", "theme on", "theme off", "motion work", "motion off", "icons nerd", "icons plain", "on", "off"];
const IDENTITY_WIDGET = "pi-home:identity";

export default function home(pi: ExtensionAPI) {
  const state: HomeState = {
    prefs: { ...DEFAULTS }, clock: new RunClock(), phase: "working", tools: new Map(),
    promptDepth: 0, blockingPromptDepth: 0, compacting: false, lastInputAt: 0, thinkingLevel: () => pi.getThinkingLevel(),
  };
  let context: ExtensionContext | undefined;
  const passiveDialogs = new Set<string>(), promptPauses: boolean[] = [];
  pi.events.on(POSTED.interaction, (event: any) => {
    if (event?.version !== 1 || event.sessionId !== context?.sessionManager.getSessionId() || !["pi-tasks:browser", "pi-ask:posted"].includes(event.id) || typeof event.active !== "boolean") return;
    if (event.active) passiveDialogs.add(event.id); else passiveDialogs.delete(event.id);
  });
  let tui: TUI | undefined;
  let editor: HomeEditor | undefined;
  let dressedEditor: (EditorComponent & { focused?: boolean }) | undefined;
  let undressEditor: (() => void) | undefined;
  const activeEditor = () => dressedEditor ?? editor;
  state.editorRows = width => activeEditor()?.render(width).length ?? 4;
  state.openAppearancePreview = ui => {
    const focused = (ui as TUI & { getFocusedComponent?: () => unknown }).getFocusedComponent?.();
    const native = isEditorComponent(focused) ? focused : installed ? activeEditor() : undefined;
    if (!native) return { render: () => [], dispose() {} };
    const undress = native instanceof HomeEditor || native === dressedEditor ? undefined
      : dressComposerEditor(native, current, state, Date.now, () => ui.terminal.rows);
    return { render: width => {
      const wasFocused = native.focused;
      try { native.focused = false; return native.render(width); }
      finally { native.focused = wasFocused; }
    }, dispose: () => undress?.() };
  };
  function syncEditor() {
    if (!installed || !context || state.promptDepth > 0) return;
    if (context.ui.getEditorComponent() === ourFactory) {
      undressEditor?.(); undressEditor = undefined; dressedEditor = undefined;
      return;
    }
    const focused = (tui as (TUI & { getFocusedComponent?: () => unknown }) | undefined)?.getFocusedComponent?.();
    if (!isEditorComponent(focused) || focused === editor || focused === dressedEditor) return;
    undressEditor?.();
    dressedEditor = focused;
    undressEditor = dressComposerEditor(focused, current, state, Date.now, () => tui?.terminal.rows ?? 24);
    refresh();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerDue = Infinity;
  let installed = false;
  let previousEditor: EditorFactory;
  let ourFactory: EditorFactory;
  let footerCleanup: (() => void) | undefined;
  let outcome: Outcome = "done";
  let lastSecond = -1;
  const preferencesPath = join(getAgentDir(), "pi-home.json");
  const docks = new Map<string, DockSnapshot>();
  state.nextHint = () => {
    const task = docks.get("pi-tasks")?.rows.find(row => row.tone === "accent" && /^\s*▸/.test(row.text));
    return task ? task.text.replace(/^\s*▸\s*(?:\d+\s+)?/, "").trim() : "";
  };
  const themeLease = new ThemeLease();
  const sentFrames = new SentMessageFrames();
  const groupedTools = new GroupedTools(() => current().ui.theme, () => state.layout,
    () => !!state.chronomancerDay && state.chronomancerDay !== calendarDay(Date.now()));
  const activityBlocks = new ActivityBlocks(() => current().ui.theme, () => tui?.requestRender(),
    () => state.layout?.toolLabels ?? "semantic", groupedTools.isGrouped,
    () => readTranscript(state.layout?.transcript, state.layout) ?? transcriptDefaults(),
    () => state.layout?.density ?? "spaced");
  let paintCleanup: (() => void) | undefined;
  let lastMessageScan = 0;
  function syncSentFrames(now = Date.now(), beforePaint = false) {
    if (!installed) { groupedTools.dispose(); sentFrames.dispose(); activityBlocks.dispose(); return; }
    if (!tui || !context || (!beforePaint && now - lastMessageScan < 250)) return;
    lastMessageScan = now;
    const groupsChanged = groupedTools.sync(tui);
    const blocksChanged = activityBlocks.sync(tui);
    const messagesChanged = sentFrames.sync(tui, () => current().ui.theme, () => current().model?.name || current().model?.id || "Assistant", () => {
      const now = Date.now();
      return { active: state.phase === "thinking" && state.clock.active && shouldAnimate(state, now, state.editorFocused?.() ?? true),
        now, startAt: state.clock.transitionAt };
    }, () => ({ prefs: state.layout, chronomancerDay: state.chronomancerDay, users: current().sessionManager.getBranch().flatMap(entry => {
      if (entry.type !== "message" || entry.message.role !== "user") return [];
      const message = entry.message;
      const text = typeof message.content === "string" ? message.content
        : message.content.filter(part => part.type === "text").map(part => part.text).join("");
      return Number.isFinite(message.timestamp) && text ? [{ text, timestamp: message.timestamp }] : [];
    }) }));
    if (!beforePaint && (groupsChanged || blocksChanged || messagesChanged)) tui.requestRender();
  }
  function syncTheme(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;
    if (state.prefs.enabled && state.prefs.theme) themeLease.apply(ctx);
    else themeLease.restore(ctx);
  }
  function announce() {
    if (!context) return;
    pi.events.emit(DOCK.host, { version: 1, sessionId: context.sessionManager.getSessionId(), available: installed });
  }
  pi.events.on(DOCK.probe, () => announce());
  pi.events.on("pi-chronomancer:mode", (value) => {
    const v = value as { version?: number; active?: boolean; day?: string; sessionId?: string } | undefined;
    if (!context || v?.version !== 1 || v.sessionId !== context.sessionManager.getSessionId()) return;
    state.chronomancerDay = v.active && /^\d{4}-\d{2}-\d{2}$/.test(v.day ?? "") ? v.day : undefined;
    wake();
  });
  pi.events.on(DOCK.update, (value) => {
    if (!isSnapshot(value) || !context || value.sessionId !== context.sessionManager.getSessionId()) return;
    const accepted = installed && (docks.has(value.id) || docks.size < 6);
    if (accepted && value.rows.length) docks.set(value.id, structuredClone(value)); else docks.delete(value.id);
    pi.events.emit(DOCK.ack, { version: 1, sessionId: value.sessionId, id: value.id, mounted: accepted && !!value.rows.length });
    refresh();
  });

  const refresh = () => { syncSentFrames(); tui?.requestRender(); };
  const current = () => {
    if (!context) throw new Error("pi-home: session is not active");
    return context;
  };
  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined; timerDue = Infinity;
  };
  const tick = () => {
    timer = undefined; timerDue = Infinity;
    if (!installed || !context) return;
    themeLease.settleReload(context);
    syncSentFrames();
    syncEditor(); // Adopt a later-installed Vim editor in place; never replace its state.
    const now = Date.now();
    const focused = activeEditor()?.focused ?? false;
    const taskAnimated = state.taskPanel?.tick(state, now, focused) ?? false;
    const animated = shouldAnimate(state, now, focused) || taskAnimated;
    const second = Math.floor(now / 1000);
    if (state.promptDepth === 0 && (animated || (state.clock.timing && second !== lastSecond))) refresh();
    lastSecond = second;
    const transition = state.clock.transitionAt > 0 && now - state.clock.transitionAt < 800;
    const delay = taskAnimated || animated && transition ? 40 : animated || themeLease.awaitingReload ? 100 : 1000;
    timerDue = now + delay;
    timer = setTimeout(tick, delay);
    timer.unref();
  };
  const wake = () => { lastMessageScan = 0; stopTimer(); refresh(); if (installed) tick(); };

  function restoreTiming(ctx: ExtensionContext) {
    state.taskPanel?.reset();
    activityBlocks.clearHistory();
    let value: unknown;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === TIMING_ENTRY) value = entry.data;
    }
    state.clock.restore(value);
    state.tools.clear();
    state.phase = "working";
    state.compacting = false;
    outcome = "done";
  }

  function mountWorkspace(ctx: ExtensionContext) {
    // Native custom questions replace the editor. Move Home as one unit below
    // that surface, so the question does not split the workspace and footer.
    const question = state.promptDepth > 0 && [...state.tools.values()].some(name => name === "ask_questions" || name === "ask_user_question");
    ctx.ui.setWidget(IDENTITY_WIDGET, (ui) => createWorkspace(ui, current, state, docks, () => activeEditor()?.focused ?? false), { placement: question ? "belowEditor" : "aboveEditor" });
  }

  function install(ctx: ExtensionContext) {
    context = ctx;
    if (installed || ctx.mode !== "tui") return;
    syncTheme(ctx);
    previousEditor = ctx.ui.getEditorComponent();
    ctx.ui.setHeader((ui) => {
      paintCleanup?.(); tui = ui;
      paintCleanup = installPaintGuard(ui, () => { syncEditor(); syncSentFrames(Date.now(), true); }, () => installed);
      return createHeader(current, state);
    });
    state.editorFocused = () => activeEditor()?.focused ?? false;
    const draft = ctx.ui.getEditorText();
    ourFactory = (ui, theme, kb) => {
      tui = ui;
      editor = new HomeEditor(ui, theme, kb, current, state, () => pi.getThinkingLevel());
      return editor;
    };
    // Composer decorates an existing editor (including pi-vim) instead of owning
    // a competing factory. A later-installed editor is adopted by syncEditor.
    if (!previousEditor) ctx.ui.setEditorComponent(ourFactory);
    // Pi copies the collapsed draft when replacing editors. Expand paste markers before they lose their owner.
    if (draft !== ctx.ui.getEditorText()) ctx.ui.setEditorText(draft);
    ctx.ui.setWorkingVisible(false);
    mountWorkspace(ctx);
    if (!state.footerManaged) ctx.ui.setFooter((ui, _theme, data) => {
      const footer = createFooter(ui, current, state, data);
      let disposed = false;
      footerCleanup = () => { if (!disposed) { disposed = true; footer.dispose(); } };
      return { ...footer, dispose: footerCleanup };
    });
    installed = true;
    announce();
    pi.events.emit("pi-chronomancer:probe", { sessionId: ctx.sessionManager.getSessionId() });
    wake();
  }

  function uninstall(ctx: ExtensionContext) {
    state.taskPanel?.reset();
    stopTimer();
    if (!installed) return;
    installed = false;
    paintCleanup?.(); paintCleanup = undefined;
    groupedTools.dispose();
    activityBlocks.dispose();
    sentFrames.dispose(); lastMessageScan = 0;
    undressEditor?.(); undressEditor = undefined; dressedEditor = undefined;
    themeLease.restore(ctx);
    docks.clear();
    announce();
    const draft = ctx.ui.getEditorText();
    if (ctx.ui.getEditorComponent() === ourFactory) {
      ctx.ui.setEditorComponent(previousEditor);
      if (draft !== ctx.ui.getEditorText()) ctx.ui.setEditorText(draft);
    }
    ctx.ui.setHeader(undefined);
    ctx.ui.setWidget(IDENTITY_WIDGET, undefined);
    if (!state.footerManaged) ctx.ui.setFooter(undefined);
    ctx.ui.setWorkingVisible(true);
    footerCleanup?.();
    footerCleanup = undefined;
    editor = undefined;
    tui = undefined;
  }

  async function savePreferences(ctx: ExtensionContext) {
    const temp = preferencesPath + "." + randomUUID() + ".tmp";
    try {
      await mkdir(getAgentDir(), { recursive: true });
      await writeFile(temp, JSON.stringify(state.prefs, null, 2) + "\n", { mode: 0o600 });
      await rename(temp, preferencesPath);
    } catch (error) {
      ctx.ui.notify(`Appearance applied, but could not save ${preferencesPath}: ${String(error)}`, "warning");
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }

  async function apply(next: Preferences, ctx: ExtensionContext) {
    state.prefs = next;
    syncTheme(ctx);
    if (next.enabled) install(ctx); else uninstall(ctx);
    // Appearance changes reuse the SAME editor: undo, cursor, paste storage, and completions survive.
    activeEditor()?.invalidate();
    announce();
    wake();
    await savePreferences(ctx);
  }

  pi.on("session_start", async (event, ctx) => {
    passiveDialogs.clear(); promptPauses.length = 0; state.promptDepth = 0; state.blockingPromptDepth = 0;
    if (ctx.mode !== "tui") return;
    context = ctx;
    state.chronomancerDay = undefined;
    try {
      state.prefs = preferencesFrom(JSON.parse(await readFile(preferencesPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        ctx.ui.notify(`pi-home: couldn't read ${preferencesPath}; using defaults. ${String(error)}`, "warning");
      }
    }
    restoreTiming(ctx);
    if (state.prefs.enabled) install(ctx);
    if (event.reason === "reload") { themeLease.expectReloadReset(); wake(); }
  });

  pi.on("session_shutdown", () => {
    passiveDialogs.clear(); promptPauses.length = 0; state.promptDepth = 0; state.blockingPromptDepth = 0;
    stopTimer();
    paintCleanup?.(); paintCleanup = undefined;
    groupedTools.dispose();
    activityBlocks.dispose();
    sentFrames.dispose(); lastMessageScan = 0;
    undressEditor?.(); undressEditor = undefined; dressedEditor = undefined;
    if (context) themeLease.restore(context);
    footerCleanup?.();
    footerCleanup = undefined;
    installed = false;
    docks.clear();
    announce();
    context = undefined;
    state.chronomancerDay = undefined;
    tui = undefined;
    editor = undefined;
    // Pi clears the extension UI on runtime teardown. Do not resurrect a loader while exiting.
  });

  pi.on("session_tree", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    context = ctx;
    restoreTiming(ctx);
    wake();
  });

  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    context = ctx;
    if (state.clock.begin(Date.now())) pi.appendEntry(TIMING_ENTRY, { ...state.clock.timing });
    state.phase = "working";
    if (installed) ctx.ui.setWorkingVisible(false);
    state.lastInputAt = 0;
    outcome = "done";
    wake();
  });
  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    context = ctx;
    const timing = state.clock.settle(Date.now(), outcome);
    if (timing) pi.appendEntry(TIMING_ENTRY, timing);
    state.tools.clear();
    state.compacting = false;
    wake();
  });
  pi.on("message_update", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const type = event.assistantMessageEvent.type;
    const phase = type.startsWith("thinking_") ? "thinking" : type.startsWith("text_") ? "responding" : undefined;
    if (phase && phase !== state.phase) { state.phase = phase; refresh(); }
  });
  pi.on("message_end", (event, ctx) => {
    if (ctx.mode !== "tui" || event.message.role !== "assistant") return;
    outcome = event.message.stopReason === "aborted" ? "stopped" : event.message.stopReason === "error" ? "error" : "done";
  });
  pi.on("tool_execution_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    activityBlocks.record(event.toolName, event.args, event.parentToolCallId, event.toolCallId);
    state.tools.set(event.toolCallId, event.toolName);
    wake();
  });
  pi.on("tool_execution_end", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    activityBlocks.finish(event.toolCallId, event.parentToolCallId, event.isError);
    state.tools.delete(event.toolCallId);
    state.phase = "working";
    wake();
  });
  pi.on("ui_prompt_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const synchronousAsk = [...state.tools.values()].some(name => name === "ask_user_question" || name === "ask_questions");
    const pauses = event.kind !== "custom" || !passiveDialogs.size || synchronousAsk;
    promptPauses.push(pauses);
    if (pauses) { state.clock.pause(Date.now()); state.blockingPromptDepth = (state.blockingPromptDepth ?? 0) + 1; }
    state.promptDepth++;
    if (installed) mountWorkspace(ctx);
    wake();
  });
  pi.on("ui_prompt_end", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    if (promptPauses.pop() !== false) { state.clock.resume(Date.now()); state.blockingPromptDepth = Math.max(0, (state.blockingPromptDepth ?? 0) - 1); }
    state.promptDepth = Math.max(0, state.promptDepth - 1);
    if (installed) mountWorkspace(ctx);
    wake();
  });
  pi.on("session_before_compact", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    state.compacting = true;
    wake();
  });
  pi.on("session_compact", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    state.compacting = false;
    wake();
  });
  pi.on("session_compact_failed", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    state.compacting = false;
    wake();
  });
  pi.on("model_select", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    context = ctx;
    refresh();
  });
  pi.on("thinking_level_select", (_event, ctx) => { if (ctx.mode === "tui") refresh(); });
  pi.on("session_info_changed", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    context = ctx;
    refresh();
  });

  async function choose(ctx: ExtensionCommandContext): Promise<string | undefined> {
    const options = ["Work motion…", "Home header icons…", "Matching palette…", "Work summary…",
      state.prefs.enabled ? "Turn appearance off" : "Turn appearance on"];
    const result = await ctx.ui.select("Composer controls · choices save immediately", options);
    if (!result) return;
    const index = options.indexOf(result);
    if (index === 0) {
      const motion = await ctx.ui.select("Work motion · readouts stay live", ["work", "off"]);
      return motion ? `motion ${motion}` : undefined;
    }
    if (index === 1) {
      const icons = await ctx.ui.select("Home header icons · frame metadata uses /workspace", ["Nerd Font", "Plain text"]);
      return icons ? `icons ${icons === "Nerd Font" ? "nerd" : "plain"}` : undefined;
    }
    if (index === 2) {
      const theme = await ctx.ui.select("Matching palette · off restores your preceding colors", ["on", "off"]);
      return theme ? `theme ${theme}` : undefined;
    }
    if (index === 3) {
      const details = await ctx.ui.select("Work summary", ["Compact", "Expanded"]);
      return details ? `details ${details === "Expanded" ? "on" : "off"}` : undefined;
    }
    return state.prefs.enabled ? "off" : "on";
  }

  pi.registerCommand("home", {
    description: "Composer appearance: output raw/readable, details, theme, motion, icons, on/off. Tasks are independent; /workspace edits frame and metadata appearance.",
    getArgumentCompletions: (prefix) => COMMANDS.filter((s) => s.startsWith(prefix)).map((s) => ({ value: s, label: s })),
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") { ctx.ui.notify("pi-home appearance is available only in terminal UI mode.", "info"); return; }
      context = ctx;
      const command = args.trim().toLowerCase() || await choose(ctx);
      if (!command) return;
      if (command === "output raw" || command === "output readable") {
        activityBlocks.setOutputMode(command === "output raw");
        ctx.ui.notify(`Expanded tool cards now use ${command === "output raw" ? "raw payloads" : "readable output"}. Use Ctrl+O to expand. Session only.`, "info");
        return;
      }
      const next = { ...state.prefs };
      if (command === "composer") next.enabled = true;
      else if (command === "on" || command === "off") next.enabled = command === "on";
      else if (command === "details on" || command === "details off") next.details = command === "details on";
      else if (command === "theme on" || command === "theme off") {
        themeLease.restore(ctx);
        next.theme = command === "theme on";
      }
      else if (command === "motion work" || command === "motion off") next.motion = command.slice(7) as Preferences["motion"];
      else if (command === "icons nerd" || command === "icons plain") next.icons = command.slice(6) as Preferences["icons"];
      else { ctx.ui.notify("Usage: /home [composer|details on|details off|theme on|theme off|motion work|motion off|icons nerd|icons plain|output raw|output readable|on|off]", "warning"); return; }
      await apply(next, ctx);
    },
  });

  // Registered last: the workspace is ready before the independent footer mounts.
  registerFooter(pi, state);
  registerRecaps(pi, () => state.prefs.enabled);
}
