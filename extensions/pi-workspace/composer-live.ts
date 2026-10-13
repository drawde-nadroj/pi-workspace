import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { shouldAnimate, type WorkspaceState } from "./state.ts";
import { clean, duration, type ActivityClock, type FooterPrefs } from "./footer-state.ts";
import { splitRow } from "./ui.ts";
import { composerGlow } from "./composer-style.ts";
import type { AppearanceState } from "./appearance.ts";

/** Real events only: the preview's sequence, task counts and sample values never enter here. */
export function composerStatus(workspace: WorkspaceState, clock: ActivityClock): { state: AppearanceState; text: string; tone: "success" | "warning" | "error" | "toolTitle" | "muted" } {
  const d = clock.data;
  const waiting = clock.running && (workspace.blockingPromptDepth ?? workspace.promptDepth) > 0 && !workspace.footerPickerOpen;
  const failed = d.lastOutcome === "error" && !clock.running;
  const stopped = d.lastOutcome === "stopped" && !clock.running;
  const incomplete = workspace.clock.interrupted || (d.partial && d.lastRunMs === undefined && !clock.running);
  const text = waiting ? "Waiting for you" : workspace.compacting ? "Compacting context"
    : workspace.tools.size ? `${workspace.tools.size} tool${workspace.tools.size === 1 ? "" : "s"} running`
    : clock.running ? workspace.phase === "thinking" ? "Thinking" : workspace.phase === "responding" ? "Writing reply" : "Working"
    : incomplete ? "Previous run incomplete" : failed ? "Run failed" : stopped ? "What happened?" : d.lastRunMs !== undefined ? "your turn" : "What’s next?";
  const tone = waiting || stopped || incomplete ? "warning" : failed ? "error" : clock.running || workspace.compacting ? "toolTitle" : d.lastRunMs !== undefined ? "success" : "muted";
  const state: AppearanceState = waiting ? "waiting" : workspace.compacting ? "compacting" : workspace.tools.size ? "tools"
    : clock.running ? workspace.phase : incomplete ? "interrupted" : failed ? "error" : stopped ? "stopped" : d.lastRunMs !== undefined ? "done" : "idle";
  return { state, text, tone };
}

export function composerStatusRows(workspace: WorkspaceState, clock: ActivityClock, prefs: FooterPrefs, now: number, theme: Theme, width: number): string[] {
  if (width <= 0) return [];
  const d = clock.data;
  const waiting = clock.running && (workspace.blockingPromptDepth ?? workspace.promptDepth) > 0;
  // The question frame owns the only prompt heading.
  if (waiting && [...workspace.tools.values()].some(name => name === "ask_questions" || name === "ask_user_question")) return [];
  const busy = (clock.running || workspace.compacting) && !waiting;
  const failed = d.lastOutcome === "error" && !clock.running;
  const stopped = d.lastOutcome === "stopped" && !clock.running;
  const incomplete = workspace.clock.interrupted || (d.partial && d.lastRunMs === undefined && !clock.running);
  const label = composerStatus(workspace, clock).text;
  const animate = busy && shouldAnimate(workspace, now, workspace.editorFocused?.() ?? true);
  const tone = waiting || stopped || incomplete ? "warning" : failed ? "error" : busy ? "toolTitle" : d.lastRunMs !== undefined ? "success" : "muted";
  const glyph = waiting ? "" : failed ? "! " : stopped || incomplete ? "○ " : busy ? "" : d.lastRunMs !== undefined ? "✓ " : "";
  const quiet = now - workspace.lastInputAt < 1200;
  const pulse = animate ? composerGlow(theme, now, quiet) : theme.colors.toolTitle;
  const left = waiting ? theme.style(label, { fg: theme.colors.accent, bold: true }) : busy ? theme.style(label, { fg: pulse, bold: true }) : theme.fg(tone, `${glyph}${label}`);
  const showTime = prefs.run === "on" && prefs.timing !== "hidden";
  const time = !showTime || waiting ? "" : clock.running ? duration(clock.runElapsed(now)!)
    : d.lastRunMs !== undefined ? `${failed ? "failed" : stopped ? "stopped" : "last run"} ${duration(d.lastRunMs)}` : "";
  const right = busy ? theme.style(time, { fg: pulse, bold: true }) : theme.fg("muted", time);
  // Only current tools belong here. Their results stay in the transcript;
  // a recoverable tool failure is not the outcome of the whole agent run.
  // Reserve the row so starting/finishing tools cannot shift the input.
  const detail = workspace.tools.size ? theme.fg("muted", [...workspace.tools.values()].map(name =>
    name === "ask_questions" ? "Questions" : name === "ask_user_question" ? "Question" : clean(name)).join(" · ")) : "";
  const inset = width >= 8 ? 2 : 0;
  return [splitRow(left, right, Math.max(0, width - 2 * inset)), detail]
    .map(line => " ".repeat(inset) + truncateToWidth(line, Math.max(0, width - 2 * inset), ""));
}
