import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi, type TUI } from "@earendil-works/pi-tui";
import { DOCK } from "../../lib/home-dock.ts";
import { shouldAnimate, type HomeState } from "./state.ts";
import { composerStatus } from "./composer-live.ts";
import { composerInset, composerPadding, composerSurface } from "./composer-style.ts";
import { ActivityClock, FOOTER_DEFAULTS, FOOTER_ENTRY, activityParts, clean, parseGit, type FooterPrefs, type GitState } from "./footer-state.ts";
import { loadWorkspacePrefs, WORKSPACE_SETTINGS, WORKSPACE_VERSION } from "./workspace-preferences.ts";
import { footerRows, timingRows } from "./footer-view.ts";
import { chooseFooter } from "./footer-settings.ts";
import { appearanceRow } from "./appearance-render.ts";
import { clonePrefs } from "./appearance.ts";
import { decorateActivity, moving } from "./footer-effects.ts";

const WIDGET = "pi-home:activity";
export async function saveFooter(path: string, prefs: FooterPrefs): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(temp, JSON.stringify({ version: WORKSPACE_VERSION, ...prefs }, null, 2) + "\n", { mode: 0o600 });
    await rename(temp, path);
  } finally { await rm(temp, { force: true }).catch(() => {}); }
}

/** Shares pi-home's workspace but never owns its editor, Tasks state, or theme. */
export function registerFooter(pi: ExtensionAPI, home: HomeState): void {
  home.footerManaged = true;
  let prefs = { ...FOOTER_DEFAULTS }, ctx: ExtensionContext | undefined, tui: TUI | undefined;
  let clock = new ActivityClock();
  let timer: ReturnType<typeof setInterval> | undefined;
  let git: GitState | undefined, gitUnavailable = false, lastGitAt = 0;
  let gitJob: AbortController | undefined, generation = 0, pickerOpen = false;
  let pickerAbort: AbortController | undefined, pickerBaseline: FooterPrefs | undefined;
  const cancelPicker = () => {
    if (pickerBaseline) { prefs = pickerBaseline; home.layout = prefs; }
    pickerBaseline = undefined; home.footerPickerOpen = false;
    pickerAbort?.abort(); pickerAbort = undefined;
  };
  let mountedWidget = false, unsubscribe: (() => void) | undefined;
  let createdAt: number | undefined, lastUserSentAt: number | undefined, outcome = "done";
  const path = join(getAgentDir(), WORKSPACE_SETTINGS);
  let unreadableSettings = false;
  const refresh = () => tui?.requestRender();
  const persist = () => { if (ctx?.mode === "tui") pi.appendEntry(FOOTER_ENTRY, clock.snapshot(Date.now())); };
  const composer = () => home.footerPickerOpen || home.prefs.enabled;
  let renderFooter: ((width: number) => string[]) | undefined;
  home.appearanceData = () => ({ cwd: ctx?.cwd ?? "", model: ctx?.model?.name || ctx?.model?.id || "no model", thinking: pi.getThinkingLevel(),
    session: ctx?.sessionManager.getSessionName() ?? "", usage: ctx?.getContextUsage(), git, gitUnavailable, frame: frame() });
  const frame = () => {
    const now = Date.now();
    return { now, running: clock.running && !home.promptDepth && home.prefs.motion !== "off"
      && (!composer() || shouldAnimate(home, now, home.editorFocused?.() ?? true)) };
  };
  const activity = (width: number) => {
    if (!ctx) return [];
    let parts = activityParts(prefs, clock, Date.now(), createdAt);
    // In the approved composer, run state/time belongs ONLY to the status row.
    if (composer()) parts = prefs.composerActivity === "minimal" ? []
      : parts.filter(part => !/^(working |waiting for you$|last run |failed |stopped |previous run incomplete$|ready$)/.test(part));
    const inset = composer() ? composerInset(width) : 0;
    return timingRows(decorateActivity(parts, ctx.ui.theme, prefs, frame()), ctx.ui.theme, Math.max(0, width - inset * 2))
      .map(line => " ".repeat(inset) + line);
  };
  function tick() {
    timer = undefined;
    if (!ctx) return;
    refresh(); pollGit();
    const visible = prefs.context !== "off" || (prefs.timing !== "hidden" && prefs.run === "on");
    timer = setTimeout(tick, !composer() && visible && moving(prefs, frame()) ? 100 : 1000); timer.unref();
  }
  function wake() { if (timer) clearTimeout(timer); timer = undefined; if (ctx) tick(); }
  function mountActivity() {
    if (!ctx || ctx.mode !== "tui") return;
    home.layout = prefs;
    home.railStatus = composer() ? () => composerStatus(home, clock) : undefined;
    home.railRunElapsed = composer() ? now => clock.runElapsed(now) : undefined;
    home.lastUserSentAt = composer() ? () => lastUserSentAt : undefined;
    home.statusRows = undefined;
    home.activityRows = prefs.timing === "strip" && home.prefs.enabled ? activity : undefined;
    const wanted = prefs.timing === "strip" && !home.prefs.enabled;
    if (wanted && !mountedWidget) {
      ctx.ui.setWidget(WIDGET, () => ({ invalidate() {}, render: activity }), { placement: "aboveEditor" });
    } else if (!wanted && mountedWidget) ctx.ui.setWidget(WIDGET, undefined);
    mountedWidget = wanted; refresh();
  }
  function afterDock(value: unknown) {
    const v = value as { sessionId?: string };
    if (!ctx || v?.sessionId !== ctx.sessionManager.getSessionId()) return;
    const gen = generation;
    // Tasks may remount their fallback during this event. Mount after all listeners,
    // so activity stays below Tasks even when the Home appearance is disabled.
    queueMicrotask(() => {
      if (gen !== generation || !ctx) return;
      if (mountedWidget && !home.prefs.enabled) { ctx.ui.setWidget(WIDGET, undefined); mountedWidget = false; }
      mountActivity();
    });
  }
  pi.events.on(DOCK.host, afterDock);
  pi.events.on(DOCK.update, afterDock);
  function pollGit(force = false) {
    if (!ctx || prefs.git === "off" || gitJob || (!force && Date.now() - lastGitAt < 10000)) return;
    lastGitAt = Date.now();
    const gen = generation, cwd = ctx.cwd, job = new AbortController(); gitJob = job;
    execFile("git", ["--no-optional-locks", "-C", cwd, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
      { timeout: 3000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8", signal: job.signal, env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" } },
      (error, stdout, stderr) => {
        if (gitJob === job) gitJob = undefined;
        if (gen !== generation) return;
        if (error) { git = undefined; gitUnavailable = !stderr.includes("not a git repository"); }
        else { git = parseGit(stdout); gitUnavailable = false; }
        refresh();
      });
  }
  function restore(context: ExtensionContext) {
    let value: unknown;
    const branch = context.sessionManager.getBranch();
    for (const entry of branch) if (entry.type === "custom" && entry.customType === FOOTER_ENTRY) value = entry.data;
    clock = new ActivityClock(); clock.restore(value, Date.now());
    // Only recorded user messages drive the composer rail. The activity-clock
    // entry may include an input event without an associated transcript message.
    lastUserSentAt = undefined;
    for (const entry of branch) if (entry.type === "message" && entry.message.role === "user"
      && Number.isFinite(entry.message.timestamp) && entry.message.timestamp >= 0) {
      lastUserSentAt = Math.max(lastUserSentAt ?? 0, entry.message.timestamp);
      clock.data.sentAt = Math.max(clock.data.sentAt ?? 0, entry.message.timestamp);
    }
    const timestamp = context.sessionManager.getHeader()?.timestamp;
    const parsed = timestamp ? Date.parse(timestamp) : NaN;
    createdAt = Number.isFinite(parsed) ? parsed : undefined;
    outcome = "done";
  }
  function install(context: ExtensionContext) {
    ctx = context;
    context.ui.setFooter((ui, _theme, data) => {
      tui = ui;
      const disposeBranch = data.onBranchChange(() => { lastGitAt = 0; pollGit(true); refresh(); });
      let disposed = false;
      const dispose = () => { if (disposed) return; disposed = true; disposeBranch(); };
      unsubscribe = dispose;
      return {
        dispose, invalidate() {},
        render: renderFooter = (width) => {
          if (!ctx || width <= 0) return [];
          const inset = composer() ? composerInset(width) : 0;
          const display = composer() ? { ...prefs,
            session: prefs.railTitle === "on" ? "off" as const : prefs.session,
            directory: prefs.railDetails === "on" ? "off" as const : prefs.directory,
            model: prefs.railDetails === "on" ? "off" as const : prefs.model,
            thinking: "off" as const,
            context: prefs.composerContext === "off" ? "off" as const : prefs.context } : prefs;
          const rows = composer() && prefs.appearance
            ? [appearanceRow(ctx.ui.theme, width, home, "footer1", Date.now()), appearanceRow(ctx.ui.theme, width, home, "footer2", Date.now())]
            : footerRows(display, home.appearanceData!(), ctx.ui.theme, Math.max(1, width - 2 * inset));
          if (composer()) for (let i = rows.length - 1; i >= 0; i--) if (!clean(rows[i]).trim()) rows.splice(i, 1);
          if (inset && !prefs.appearance) for (let i = 0; i < rows.length; i++) rows[i] = " ".repeat(inset) + rows[i];
          if (prefs.timing === "footer") rows.push(...activity(width));
          const statuses = [...data.getExtensionStatuses().values()].map(clean).filter(Boolean);
          if (statuses.length) rows.push(...wrapTextWithAnsi(ctx.ui.theme.fg("dim", statuses.join("  ")), width));
          if (composer() && !home.footerPickerOpen && composerPadding(width, ui.terminal.rows, prefs.density)) rows.unshift("");
          return composer() ? rows.map(row => composerSurface(ctx!.ui.theme, row, width)) : rows;
        },
      };
    });
    mountActivity();
  }
  function stop() {
    generation++; cancelPicker();
    if (timer) clearTimeout(timer); timer = undefined;
    gitJob?.abort(); gitJob = undefined;
    unsubscribe?.(); unsubscribe = undefined;
    home.activityRows = undefined;
    home.statusRows = undefined;
    home.railStatus = undefined;
    home.railRunElapsed = undefined;
    home.lastUserSentAt = undefined;
    home.layout = undefined;
    home.appearancePreview = undefined;
    home.appearanceHits = undefined;
    home.footerPickerOpen = false;
    renderFooter = undefined;
    if (mountedWidget && ctx?.mode === "tui") ctx.ui.setWidget(WIDGET, undefined);
    mountedWidget = false; tui = undefined; ctx = undefined;
  }
  pi.on("session_start", async (_event, context) => {
    stop();
    if (context.mode !== "tui") return;
    ctx = context;
    try { prefs = await loadWorkspacePrefs(); unreadableSettings = false; }
    catch (error) {
      prefs = { ...FOOTER_DEFAULTS }; unreadableSettings = true;
      context.ui.notify(`Workspace settings could not be read: ${String(error)}. Using defaults; saved files are unchanged.`, "warning");
    }
    restore(context); git = undefined; gitUnavailable = false; lastGitAt = 0;
    install(context); pollGit(true);
    wake();
  });
  pi.on("session_shutdown", () => { if (clock.running) persist(); stop(); });
  pi.on("session_tree", (_event, context) => {
    if (context.mode !== "tui") return;
    generation++; cancelPicker(); gitJob?.abort(); gitJob = undefined;
    ctx = context; restore(context); mountActivity(); pollGit(true); refresh();
  });
  pi.on("input", (event, context) => {
    if (context.mode === "tui" && event.source === "interactive") { clock.data.sentAt = Date.now(); persist(); refresh(); }
  });
  pi.on("message_start", (event, context) => {
    if (context.mode !== "tui") return;
    ctx = context;
    if (event.message.role === "user") {
      const timestamp = event.message.timestamp;
      if (Number.isFinite(timestamp) && timestamp >= 0) lastUserSentAt = Math.max(lastUserSentAt ?? 0, timestamp);
      clock.data.sentAt = Math.max(clock.data.sentAt ?? 0, timestamp ?? Date.now()); refresh();
    }
  });
  pi.on("agent_start", (_event, context) => {
    if (context.mode !== "tui") return;
    ctx = context;
    if (clock.begin(Date.now())) { outcome = "done"; persist(); }
    wake();
  });
  pi.on("message_end", (event, context) => {
    if (context.mode !== "tui" || event.message.role !== "assistant") return;
    ctx = context;
    outcome = event.message.stopReason === "error" ? "error" : event.message.stopReason === "aborted" ? "stopped" : "done";
    if (event.message.stopReason === "stop" && event.message.content.some(c => c.type === "text" && c.text.trim()) && !event.message.content.some(c => c.type === "toolCall")) clock.data.receivedAt = Date.now();
    refresh();
  });
  pi.on("agent_settled", (_event, context) => {
    if (context.mode !== "tui") return;
    ctx = context;
    if (clock.settle(Date.now(), outcome)) persist();
    pollGit(true); wake();
  });
  pi.on("ui_prompt_start", (_event, context) => { if (context.mode === "tui") { clock.pause(Date.now()); if (clock.running) persist(); } });
  pi.on("ui_prompt_end", (_event, context) => { if (context.mode === "tui") { clock.resume(Date.now()); if (clock.running) persist(); } });
  pi.on("tool_execution_end", (_event, context) => { if (context.mode === "tui" && Date.now() - lastGitAt > 2000) pollGit(true); });
  const contextChanged = (_event: unknown, context: ExtensionContext) => { if (context.mode === "tui") { ctx = context; refresh(); } };
  pi.on("model_select", contextChanged);
  pi.on("thinking_level_select", contextChanged);
  pi.on("session_info_changed", contextChanged);
  pi.on("session_compact", contextChanged);
  pi.on("session_compact_failed", contextChanged);
  pi.registerCommand("workspace", {
    description: "Customize input, footer, Tasks, Ask and Transcript visuals. Save / Discard.",
    handler: async (_args, context) => {
      if (context.mode !== "tui") { context.ui.notify("/workspace requires terminal UI mode.", "info"); return; }
      if (unreadableSettings) { context.ui.notify("Workspace settings could not be read; fix the saved file before editing so it is not overwritten.", "error"); return; }
      if (pickerOpen) return;
      pickerOpen = true; home.footerPickerOpen = true; ctx = context; wake();
      const original = clonePrefs(prefs), gen = generation;
      const abort = new AbortController(); pickerAbort = abort; pickerBaseline = original;
      const native = tui ? home.openAppearancePreview?.(tui) : undefined;
      let committed = false;
      mountActivity();
      try {
        const selected = await chooseFooter(context, prefs, next => { if (gen === generation) { prefs = next; mountActivity(); pollGit(); wake(); } }, {
          render: (width, shimmer) => {
            if (home.appearancePreview) home.appearancePreview.shimmer = shimmer;
            home.appearanceHits = [];
            const editor = native?.render(width) ?? [];
            const footer = renderFooter?.(width) ?? [];
            return { editor, footer, above: prefs.timing === "strip" ? activity(width) : [], hits: home.appearanceHits ?? [] };
          },
          select: (selected, state) => { if (gen === generation) { home.appearancePreview = { selected, state }; refresh(); } },
          temporary: !home.prefs.enabled,
          reducedMotion: home.prefs.motion === "off",
        }, abort.signal);
        if (gen !== generation || !selected) return;
        // Persist first. A failed write cancels the preview rather than pretending it was saved.
        await saveFooter(path, selected);
        if (gen !== generation) return;
        prefs = selected; committed = true;
        context.ui.notify("Workspace saved for all Pi sessions. Other open sessions adopt it after /reload.", "info");
      } catch (error) { context.ui.notify(`Workspace settings were not saved: ${String(error)}`, "error"); }
      finally {
        if (pickerAbort === abort) { pickerAbort = undefined; pickerBaseline = undefined; }
        native?.dispose();
        pickerOpen = false; home.footerPickerOpen = false; home.appearancePreview = undefined; home.appearanceHits = undefined;
        if (gen === generation) { if (!committed) prefs = original; mountActivity(); pollGit(); wake(); }
      }
    },
  });
}
