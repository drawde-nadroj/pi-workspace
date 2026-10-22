import type { TaskPanel } from "./task-presentation.ts";
import type { DictationController } from "./dictation.ts";
import type { FooterPrefs } from "./footer-state.ts";
import type { AppearanceState, AppearancePreview, AppearanceHit } from "./appearance.ts";
import type { FooterData } from "./footer-view.ts";
import type { TUI } from "@earendil-works/pi-tui";

export type Motion = "work" | "off";
export interface Preferences {
  enabled: boolean;
  look: "composer";
  motion: Motion;
  icons: "nerd" | "plain";
  details: boolean;
  theme: boolean;
}
export const DEFAULTS: Preferences = {
  enabled: true, look: "composer", motion: "work", icons: "nerd", details: false, theme: true,
};
// Durable session key retained for existing histories, not an active Home owner.
export const TIMING_ENTRY = "pi-home:timing-v1";
export type Outcome = "done" | "stopped" | "error";
export interface Timing {
  startedAt: number;
  endedAt?: number;
  activeMs?: number;
  outcome?: Outcome;
}

export function preferencesFrom(value: unknown): Preferences {
  const p = (value && typeof value === "object" ? value : {}) as Partial<Preferences>;
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : DEFAULTS.enabled,
    // Old Workspace looks and gallery-only fields are ignored, never written back on save.
    look: "composer",
    motion: p.motion === "off" ? "off" : "work",
    icons: p.icons === "plain" ? "plain" : "nerd",
    details: typeof p.details === "boolean" ? p.details : DEFAULTS.details,
    theme: typeof p.theme === "boolean" ? p.theme : DEFAULTS.theme,
  };
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h`;
}

export function validTiming(value: unknown): value is Timing {
  if (!value || typeof value !== "object") return false;
  const v = value as Timing;
  return Number.isFinite(v.startedAt) && v.startedAt >= 0 &&
    (v.endedAt === undefined || (Number.isFinite(v.endedAt) && v.endedAt >= v.startedAt)) &&
    (v.activeMs === undefined || (v.endedAt !== undefined && Number.isFinite(v.activeMs) && v.activeMs >= 0 && v.activeMs <= v.endedAt - v.startedAt)) &&
    (v.outcome === undefined || ["done", "stopped", "error"].includes(v.outcome));
}

/** The whole request, not each tool/model round. Settlement includes retries and continuations. */
export class RunClock {
  timing?: Timing;
  active = false;
  interrupted = false;
  transitionAt = 0;
  private activeMs = 0;
  private activeSegment?: number;
  private paused = 0;

  private flush(now: number): void {
    if (this.activeSegment !== undefined) {
      this.activeMs += Math.max(0, now - this.activeSegment);
      this.activeSegment = now;
    }
  }

  pause(now: number): void { this.flush(now); this.activeSegment = undefined; this.paused++; }
  resume(now: number): void {
    this.paused = Math.max(0, this.paused - 1);
    if (this.paused === 0 && this.active && this.activeSegment === undefined) this.activeSegment = now;
  }
  elapsed(now: number): number { return this.activeMs + (this.activeSegment === undefined ? 0 : Math.max(0, now - this.activeSegment)); }

  begin(now: number): boolean {
    if (this.active) return false;
    this.timing = { startedAt: now };
    this.activeMs = 0;
    this.activeSegment = this.paused ? undefined : now;
    this.active = true;
    this.interrupted = false;
    this.transitionAt = now;
    return true;
  }

  settle(now: number, outcome: Outcome): Timing | undefined {
    if (!this.active || !this.timing) return undefined;
    this.flush(now);
    this.timing = { ...this.timing, endedAt: Math.max(this.timing.startedAt, now), activeMs: this.activeMs, outcome };
    this.active = false;
    this.activeSegment = undefined;
    this.transitionAt = now;
    return this.timing;
  }

  restore(value: unknown): void {
    this.timing = validTiming(value) ? { ...value } : undefined;
    this.active = false;
    this.activeMs = 0;
    this.activeSegment = undefined;
    this.paused = 0;
    this.interrupted = !!this.timing && this.timing.endedAt === undefined;
    this.transitionAt = 0;
  }

  label(now: number): string {
    if (!this.timing) return "ready";
    if (this.active) return this.paused ? "waiting for you" : `working ${formatDuration(this.elapsed(now))}`;
    if (this.timing.endedAt === undefined) return "previous run unfinished";
    const verb = this.timing.outcome === "stopped" ? "stopped after" : this.timing.outcome === "error" ? "failed after" : "took";
    const historical = this.timing.activeMs === undefined;
    return `${historical ? "elapsed" : verb} ${formatDuration(historical ? this.timing.endedAt - this.timing.startedAt : this.timing.activeMs!)} · idle ${formatDuration(now - this.timing.endedAt)}`;
  }
}

export interface WorkspaceState {
  taskPanel?: TaskPanel;
  dictation?: DictationController;
  /** True only where the host dispatches pointer clicks (viewport TUI). */
  mouseReporting?: () => boolean;
  footerManaged?: boolean;
  activityRows?: (width: number) => string[];
  statusRows?: (width: number) => string[];
  railStatus?: () => { state?: AppearanceState; text: string; tone: "success" | "warning" | "error" | "toolTitle" | "muted" };
  railRunElapsed?: (now: number) => number | undefined;
  nextHint?: () => string;
  lastUserSentAt?: () => number | undefined;
  /** Display-only mode announced by the optional standalone Chronomancer package. */
  chronomancerDay?: string;
  layout?: FooterPrefs;
  editorFocused?: () => boolean;
  editorRows?: (width: number) => number;
  footerPickerOpen?: boolean;
  appearancePreview?: AppearancePreview;
  appearanceHits?: AppearanceHit[];
  appearanceData?: () => FooterData;
  appearanceMode?: string;
  openAppearancePreview?: (tui: TUI) => { render: (width: number) => string[]; dispose: () => void };
  thinkingLevel?: () => string;
  prefs: Preferences;
  clock: RunClock;
  phase: "working" | "thinking" | "responding";
  tools: Map<string, string>;
  promptDepth: number;
  /** Input-owning overlays need not stop independent agent work. Absent retains legacy behavior. */
  blockingPromptDepth?: number;
  /** Shared execution policy; focus/motion suppression remains independent. */
  promptBlocksWork?: (kind: string) => boolean;
  compacting: boolean;
  lastInputAt: number;
  /** Coalesced real tool-start feedback; ephemeral and never persisted. */
  activityEventAt?: number;
}

export function activity(state: WorkspaceState): string {
  if ((state.blockingPromptDepth ?? state.promptDepth) && state.clock.active) return "your turn";
  if (state.compacting) return "compacting";
  if (state.tools.size) {
    if (state.tools.size > 1) return `${state.tools.size} tools`;
    const tool = [...state.tools.values()][0];
    return ({ read: "reading", bash: "running", edit: "editing", write: "writing" } as Record<string, string>)[tool] ?? tool;
  }
  if (state.clock.active) return state.phase;
  if (state.clock.interrupted) return "unfinished";
  return state.clock.timing?.outcome === "error" ? "error" : state.clock.timing?.outcome === "stopped" ? "stopped" : "ready";
}

export function shouldAnimate(state: WorkspaceState, now: number, focused: boolean): boolean {
  return !state.footerPickerOpen && state.prefs.enabled && state.prefs.motion !== "off" && state.layout?.motion !== "off" &&
    state.promptDepth === 0 && (state.clock.active || state.compacting);
}
