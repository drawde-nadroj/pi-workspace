import { homedir } from "node:os";
import { stripVTControlCharacters } from "node:util";
import { readAppearance, type Appearance } from "./appearance.ts";
import { readTaskPanel, type TaskPanelPrefs } from "./task-presentation.ts";

export const FOOTER_ENTRY = "pi-footer:timing-v1";
import { COMPOSER_ICONS } from "./composer-icons.ts";

export const OPTIONS = {
  style: ["quiet", "powerline", "dashboard", "structured"],
  color: ["semantic", "theme", "cyan", "violet", "green", "mono"],
  layout: ["paired", "ordered"],
  shape: ["pill", "rail"],
  icons: ["nerd", "plain"],
  directory: ["path", "folder", "off"],
  git: ["detailed", "counts", "simple", "off"],
  gitLabels: ["symbols", "labels"],
  session: ["on", "off"], model: ["on", "off"], thinking: ["on", "off"],
  context: ["adaptive", "counts", "percent", "off"],
  bar: ["blocks", "dots", "thin"],
  effect: ["luminous", "firefly", "wave", "classic"],
  motion: ["work", "off"],
  topOrder: ["directory,git,session", "session,directory,git", "git,directory,session", "directory,session,git", "session,git,directory", "git,session,directory"],
  bottomOrder: ["model,thinking,context", "context,model,thinking", "thinking,model,context", "model,context,thinking", "context,thinking,model", "thinking,context,model"],
  timing: ["strip", "footer", "hidden"],
  sent: ["on", "off"], received: ["on", "off"], run: ["on", "off"], active: ["auto", "on", "off"],
  elapsed: ["off", "opened", "created"], timestamps: ["24h", "12h", "relative"],
  railTitle: ["on", "off"], railDetails: ["on", "off"], railHint: ["on", "off"], composerActivity: ["minimal", "full"], composerContext: ["off", "on"],
  messageTime: ["on", "off"], toolLabels: ["semantic", "matched"], questionLabels: ["hierarchy", "matched"],
  selectionShimmer: ["on", "off"],
} as const;
export type FooterOption = keyof typeof OPTIONS;
export type FooterPrefs = { [K in FooterOption]: (typeof OPTIONS)[K][number] } & { appearance?: Appearance; tasks?: TaskPanelPrefs };
export const FOOTER_DEFAULTS: FooterPrefs = {
  style: "quiet", color: "semantic", layout: "paired", shape: "rail", icons: "nerd", directory: "path", git: "detailed", gitLabels: "symbols",
  session: "on", model: "on", thinking: "on", context: "adaptive", bar: "blocks",
  effect: "luminous", motion: "work", selectionShimmer: "on",
  topOrder: "session,directory,git", bottomOrder: "context,model,thinking",
  timing: "strip", sent: "on", received: "on", run: "on", active: "auto", elapsed: "off", timestamps: "24h",
  railTitle: "on", railDetails: "on", railHint: "on", composerActivity: "minimal", composerContext: "off", messageTime: "on", toolLabels: "semantic", questionLabels: "matched",
};
export function footerPrefs(value: unknown): FooterPrefs {
  const result = { ...FOOTER_DEFAULTS };
  if (value && typeof value === "object") for (const key of Object.keys(OPTIONS) as (keyof FooterPrefs)[]) {
    const v = (value as Record<string, unknown>)[key];
    if ((OPTIONS[key as FooterOption] as readonly unknown[]).includes(v)) (result as Record<string, unknown>)[key] = v;
  }
  const appearance = readAppearance((value as FooterPrefs | undefined)?.appearance, result);
  if (appearance) result.appearance = appearance;
  if ((value as FooterPrefs | undefined)?.tasks) result.tasks = readTaskPanel((value as FooterPrefs).tasks);
  return result;
}
export function clean(value: string): string {
  return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ");
}
export function homePath(path: string): string {
  const home = homedir();
  return clean(path === home ? "~" : path.startsWith(home + "/") ? "~" + path.slice(home.length) : path);
}
export function duration(ms: number): string {
  const s = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor(s / 3600) % 24}h`;
}
export interface GitState {
  branch: string; staged: number; changed: number; untracked: number; conflicts: number;
  ahead: number; behind: number; detached: boolean;
}
/** --porcelain=v2 -z: consume rename source records separately, never parse filenames as status. */
export function parseGit(text: string): GitState {
  const g: GitState = { branch: "", staged: 0, changed: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0, detached: false };
  const records = text.split("\0"); let oid = "";
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.startsWith("# branch.head ")) { g.branch = clean(r.slice(14)); g.detached = g.branch === "(detached)"; }
    else if (r.startsWith("# branch.oid ")) oid = r.slice(13, 20);
    else if (r.startsWith("# branch.ab ")) {
      const m = r.match(/^# branch\.ab \+(\d+) -(\d+)/); if (m) { g.ahead = Number(m[1]); g.behind = Number(m[2]); }
    } else if (r.startsWith("? ")) g.untracked++;
    else if (r.startsWith("u ")) g.conflicts++;
    else if (r.startsWith("1 ") || r.startsWith("2 ")) {
      const xy = r.split(" ")[1];
      if (xy?.[0] !== ".") g.staged++;
      if (xy?.[1] !== "." || r.split(" ")[2]?.match(/^S.*[MU]/)) g.changed++;
      if (r.startsWith("2 ")) i++;
    }
  }
  if (g.detached) g.branch = `@${oid || "detached"}`;
  return g;
}
export function gitLabel(g: GitState, prefs: FooterPrefs, compact = false): string {
  const bits = [g.branch];
  if (g.conflicts) bits.push(`!${g.conflicts}`);
  const dirty = g.staged + g.changed + g.untracked + g.conflicts > 0;
  if (prefs.git === "simple" || compact) { if (dirty) bits.push("*"); }
  else {
    const labels = prefs.gitLabels === "labels";
    if (g.staged) bits.push(`${labels ? "staged:" : "+"}${g.staged}`);
    if (g.changed) bits.push(`${labels ? "changed:" : "~"}${g.changed}`);
    if (g.untracked) bits.push(`${labels ? "new:" : "?"}${g.untracked}`);
  }
  if (!dirty) bits.push("✓");
  if (prefs.git === "detailed" && !compact) { if (g.ahead) bits.push(`↑${g.ahead}`); if (g.behind) bits.push(`↓${g.behind}`); }
  return bits.join(" ");
}

export interface ClockSnapshot {
  trackedSince: number; totalMs: number; partial: boolean; runStarted?: number;
  lastRunMs?: number; lastRunBasis?: "active"; lastOutcome?: string; sentAt?: number; receivedAt?: number;
}
export class ActivityClock {
  data: ClockSnapshot;
  private segment?: number;
  private paused = 0;
  private runStartTotal?: number;
  openedAt: number;
  constructor(now = Date.now()) { this.openedAt = now; this.data = { trackedSince: now, totalMs: 0, partial: false }; }
  get running() { return this.data.runStarted !== undefined; }
  get waiting() { return this.running && this.paused > 0; }
  runElapsed(now: number) { return this.running ? Math.max(0, this.total(now) - (this.runStartTotal ?? this.total(now))) : undefined; }
  restore(value: unknown, now: number) {
    this.data = { trackedSince: now, totalMs: 0, partial: false };
    this.openedAt = now; this.segment = undefined; this.paused = 0; this.runStartTotal = undefined;
    if (!value || typeof value !== "object") return;
    const v = value as ClockSnapshot;
    if (!Number.isFinite(v.trackedSince) || !Number.isFinite(v.totalMs) || v.totalMs < 0) return;
    this.data = { trackedSince: v.trackedSince, totalMs: v.totalMs, partial: v.partial === true || v.runStarted !== undefined };
    for (const k of ["sentAt", "receivedAt"] as const) if (Number.isFinite(v[k]) && v[k]! >= 0) this.data[k] = v[k];
    // Older snapshots stored a wall-clock last run. Its user-wait share is
    // unknown, so do not present it as an agent-active duration after reload.
    if (v.lastRunBasis === "active" && Number.isFinite(v.lastRunMs) && v.lastRunMs! >= 0) {
      this.data.lastRunMs = v.lastRunMs; this.data.lastRunBasis = "active";
      if (["done", "stopped", "error"].includes(v.lastOutcome ?? "")) this.data.lastOutcome = v.lastOutcome;
    }
  }
  begin(now: number) { if (this.running) return false; this.runStartTotal = this.total(now); this.data.runStarted = now; this.segment = this.paused ? undefined : now; return true; }
  private flush(now: number) { if (this.segment !== undefined) { this.data.totalMs += Math.max(0, now - this.segment); this.segment = now; } }
  pause(now: number) { this.flush(now); this.segment = undefined; this.paused++; }
  resume(now: number) { this.paused = Math.max(0, this.paused - 1); if (!this.paused && this.running && this.segment === undefined) this.segment = now; }
  settle(now: number, outcome: string) {
    if (!this.running) return false;
    this.flush(now); this.data.lastRunMs = Math.max(0, this.data.totalMs - (this.runStartTotal ?? this.data.totalMs));
    this.data.lastRunBasis = "active"; this.data.lastOutcome = outcome;
    delete this.data.runStarted; this.segment = undefined; this.runStartTotal = undefined; return true;
  }
  total(now: number) { return this.data.totalMs + (this.segment === undefined ? 0 : Math.max(0, now - this.segment)); }
  snapshot(now: number): ClockSnapshot { return { ...this.data, totalMs: this.total(now) }; }
}
export function stamp(value: number | undefined, format: FooterPrefs["timestamps"], now: number): string {
  if (value === undefined) return "—";
  if (format === "relative") return `${duration(now - value)} ago`;
  const date = new Date(value);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: format === "12h" });
  return date.toDateString() === new Date(now).toDateString() ? time : `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}
export function activityParts(p: FooterPrefs, clock: ActivityClock, now: number, createdAt?: number): string[] {
  const d = clock.data, parts: string[] = [];
  if (p.sent === "on") parts.push(`${p.icons === "nerd" ? COMPOSER_ICONS.sent : "sent"} ${stamp(d.sentAt, p.timestamps, now)}`);
  if (p.received === "on") parts.push(`${p.icons === "nerd" ? COMPOSER_ICONS.reply : "reply"} ${stamp(d.receivedAt, p.timestamps, now)}`);
  if (p.run === "on") {
    if (clock.waiting) parts.push("waiting for you");
    else if (clock.running) parts.push(`working ${duration(clock.runElapsed(now)!)}`);
    else if (d.lastRunMs !== undefined) parts.push(`${d.lastOutcome === "error" ? "failed" : d.lastOutcome === "stopped" ? "stopped" : "last run"} ${duration(d.lastRunMs)}`);
    else parts.push(d.partial ? "previous run incomplete" : "ready");
  }
  const total = clock.total(now);
  // A total adds useful history only when it differs by at least a displayed second.
  // Partial totals remain visible at idle so an interrupted gap is not concealed.
  const usefulTotal = d.partial || p.run === "off" || (d.lastRunMs !== undefined && Math.abs(total - d.lastRunMs) >= 1000);
  if (p.active === "on" || (p.active === "auto" && !clock.running && usefulTotal)) {
    parts.push(`total active ${d.partial ? "≥" : ""}${duration(total)}`);
  }
  if (p.elapsed !== "off") parts.push(`${p.elapsed === "created" ? "session age" : "open"} ${p.elapsed === "created" && createdAt === undefined ? "—" : duration(now - (p.elapsed === "created" ? createdAt! : clock.openedAt))}`);
  return parts;
}
