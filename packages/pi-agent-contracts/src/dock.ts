import { wrapTextWithAnsi, truncateToWidth } from "@earendil-works/pi-tui";

/** Egregore-owned, data-only UI bridge. Neither extension imports the other's implementation.
 * The established pi-home:dock:v1 wire IDs remain stable for independently loaded providers;
 * Home is no longer an extension owner or entry point.
 */
export const DOCK = {
  probe: "pi-home:dock:v1:probe", host: "pi-home:dock:v1:host",
  update: "pi-home:dock:v1:update", ack: "pi-home:dock:v1:ack",
} as const;
export type Tone = "text" | "muted" | "accent" | "success" | "warning" | "error";
export interface DockRow { text: string; tone?: Tone }
export type DockColors = Record<Tone | "base" | "panel", string>;
export interface DockHost { version: 1; sessionId: string; available: boolean; colors?: DockColors }
export interface DockSnapshot {
  version: 1; sessionId: string; id: string; title: string; rows: DockRow[]; hint?: string;
  summary?: string; more?: number; overview?: TaskOverview;
}
export interface TaskOverview {
  revision: string; planId?: string; total: number; done: number; blocked: number; cancelled: number;
  activeId?: string; activeTitle?: string; questions?: { blocking: number; deferred: number };
}
export interface DockAck { version: 1; sessionId: string; id: string; mounted: boolean }
export function validOverview(v: TaskOverview): boolean {
  return !!v && typeof v === "object" && typeof v.revision === "string" && v.revision.length <= 200 &&
    (v.planId === undefined || typeof v.planId === "string" && /^p[1-9]\d*$/.test(v.planId)) &&
    [v.total, v.done, v.blocked, v.cancelled].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000) &&
    v.done + v.blocked + v.cancelled <= v.total && (v.activeId === undefined || typeof v.activeId === "string" && /^t[1-9]\d*$/.test(v.activeId)) &&
    (v.activeTitle === undefined || typeof v.activeTitle === "string" && v.activeTitle.length >= 1 && v.activeTitle.length <= 200) &&
    (v.questions === undefined || !!v.questions && [v.questions.blocking, v.questions.deferred].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100));
}
export function cleanText(text: string): string {
  return text.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ");
}
export function isSnapshot(value: unknown): value is DockSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as DockSnapshot;
  return v.version === 1 && typeof v.sessionId === "string" && typeof v.id === "string" && /^[\w:-]{1,80}$/.test(v.id) &&
    typeof v.title === "string" && v.title.length <= 400 && (v.hint === undefined || typeof v.hint === "string" && v.hint.length <= 200) &&
    (v.summary === undefined || typeof v.summary === "string" && v.summary.length <= 100) &&
    (v.overview === undefined || validOverview(v.overview)) &&
    (v.more === undefined || Number.isSafeInteger(v.more) && v.more >= 0 && v.more <= 10000) &&
    Array.isArray(v.rows) && v.rows.length <= 12 && v.rows.every((r) => r && typeof r.text === "string" && r.text.length <= 600 &&
      (r.tone === undefined || ["text", "muted", "accent", "success", "warning", "error"].includes(r.tone)));
}
/** Reserve an explicit overflow row only when the list does not fit. */
export function fitDock(snapshot: DockSnapshot, maxRows: number): DockRow[] {
  const total = snapshot.rows.length + (snapshot.more ?? 0);
  const count = total <= maxRows ? snapshot.rows.length : Math.max(0, maxRows - 1);
  const rows = snapshot.rows.slice(0, count);
  const hidden = total - rows.length;
  if (hidden && maxRows > 0) rows.push({ text: `+ ${hidden} more${snapshot.hint ? " · " + cleanText(snapshot.hint) : ""}`, tone: "muted" });
  return rows;
}
/** Physical-line budget shared by native and Egregore hosts. Keep task order; give active text spare lines first. */
export function layoutDock(snapshot: DockSnapshot, width: number, maxRows: number): DockRow[] {
  if (width <= 0 || maxRows <= 0) return [];
  const groups = snapshot.rows.map(row => wrapTextWithAnsi(cleanText(row.text), Math.max(1, width - 2)));
  const budgets = groups.map(() => 1);
  let spare = Math.max(0, maxRows - groups.length);
  const order = groups.map((_, i) => i).sort((a, b) => Number(snapshot.rows[b].tone === "accent") - Number(snapshot.rows[a].tone === "accent"));
  for (const i of order) { const extra = Math.min(spare, groups[i].length - 1); budgets[i] += extra; spare -= extra; }
  const rows = groups.flatMap((lines, i) => lines.slice(0, budgets[i]).map((text, j) => ({
    tone: snapshot.rows[i].tone,
    text: j === budgets[i] - 1 && lines.length > budgets[i]
      ? truncateToWidth((j ? "  " : "") + text, Math.max(0, width - 2), "") + " …"
      : (j ? "  " : "") + text,
  })));
  const visible = rows.slice(0, maxRows).map(row => ({ ...row, text: truncateToWidth(row.text, width, "…") }));
  return visible;
}
export function isHost(value: unknown): value is DockHost {
  if (!value || typeof value !== "object") return false;
  const v = value as DockHost;
  return v.version === 1 && typeof v.sessionId === "string" && typeof v.available === "boolean" &&
    (v.colors === undefined || !!v.colors && ["text", "muted", "accent", "success", "warning", "error", "base", "panel"].every(
      (k) => /^#[0-9a-f]{6}$/i.test(v.colors![k as keyof DockColors] ?? "")));
}
