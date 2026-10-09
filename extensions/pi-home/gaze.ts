import type { GazeMode } from "./state.ts";

/** Fractional art-pixel offset; the sprite blends coverage between neighboring pixels. */
export type GazeOffset = { x: number; y: number };
export const GAZE_FRAME_MS = 32;
const SPRING = 30; // Critically damped: responsive, with no oscillation or head/body motion.
const EPSILON = 1 / 512;
type Point = { x: number; y: number };
type Target = { at: number; order: number };
type Scene = { width: number; terminalRows: number; rows: number; eye: Point; followingRows?: number };
const REST_AFTER = 4500;
const axis = (delta: number, previous: number, enter: number, leave: number): -1 | 0 | 1 =>
  delta > (previous === 1 ? leave : enter) ? 1 : delta < -(previous === -1 ? leave : enter) ? -1 : 0;

/** Coordinates only. No text, terminal writes, input capture or independent animation clock. */
export class GazeTracker {
  private mouse?: Target & Point;
  private typing?: Target;
  private caret?: Point;
  private order = 0;
  private scene?: Scene;
  private editorRows = 0;
  private footerRows = 0;
  private correction = { x: 0, y: 0 };
  private offset?: GazeOffset;
  private goal: GazeOffset = { x: 0, y: 0 };
  private velocity: GazeOffset = { x: 0, y: 0 };
  private sampledAt?: number;
  private releasedAt?: number;
  private source?: "mouse" | "typing";
  private focused = true;
  constructor(private wake: () => void = () => {}, private now: () => number = Date.now) {}

  pointer(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return;
    if (this.mouse?.x === x && this.mouse.y === y && this.source === "mouse") return;
    this.mouse = { x, y, at: this.now(), order: ++this.order }; this.wake();
  }
  typed(active = true) {
    if (!active) {
      this.mouse = undefined; this.typing = undefined; this.caret = undefined; this.releasedAt = this.now();
    } else this.typing = { at: this.now(), order: ++this.order };
    this.wake();
  }
  setCaret(point: Point | undefined, rows: number) { this.caret = point; this.editorRows = rows; }
  setFooterRows(rows: number) { this.footerRows = rows; }
  setScene(scene: Scene | undefined) {
    if (scene?.width !== this.scene?.width || scene?.terminalRows !== this.scene?.terminalRows) this.correction = { x: 0, y: 0 };
    this.scene = scene;
  }
  /** Normalized events give exact widget placement, including other extensions' widgets. */
  calibrate(screenX: number, screenY: number, localX: number, localY: number) {
    if (!this.scene) return;
    this.correction = { x: screenX - localX, y: screenY - localY - this.estimatedTop() };
  }
  private estimatedTop() { return this.scene ? this.scene.terminalRows - this.scene.rows - (this.scene.followingRows ?? this.editorRows + this.footerRows) : 0; }
  focus(value: boolean, notify = true) { this.focused = value; if (!value) this.clear(); if (notify) this.wake(); }
  clear() {
    this.mouse = undefined; this.typing = undefined; this.caret = undefined;
    this.resetPose();
  }
  private resetPose() {
    this.offset = undefined; this.source = undefined; this.sampledAt = undefined; this.releasedAt = undefined;
    this.goal = { x: 0, y: 0 }; this.velocity = { x: 0, y: 0 };
  }
  get eyes(): GazeOffset | undefined { return this.offset; }

  /** Closed-form integration, independent of frame rate. Retargeting retains position AND velocity. */
  private sample(now: number) {
    if (!this.offset) return;
    const dt = Math.min(1, Math.max(0, now - (this.sampledAt ?? now)) / 1000);
    this.sampledAt = now;
    const decay = Math.exp(-SPRING * dt);
    const next = { ...this.offset };
    for (const key of ["x", "y"] as const) {
      const error = this.offset[key] - this.goal[key];
      const slope = this.velocity[key] + SPRING * error;
      const value = this.goal[key] + (error + slope * dt) * decay;
      this.velocity[key] = (this.velocity[key] - SPRING * slope * dt) * decay;
      next[key] = Math.max(-1, Math.min(1, value));
      if (value !== next[key]) this.velocity[key] = 0;
      if (Math.abs(next[key] - this.goal[key]) < EPSILON && Math.abs(this.velocity[key]) < 0.06) {
        next[key] = this.goal[key]; this.velocity[key] = 0;
      }
    }
    this.offset = next;
  }

  /** Shared-clock animation. Hysteresis stabilizes the destination; it never delays the first frame. */
  advance(mode: GazeMode, allowed: boolean, now = this.now(), resting: GazeOffset = { x: 0, y: 0 }): { changed: boolean; soon: boolean } {
    const before = this.offset && `${this.offset.x},${this.offset.y}`;
    if (!allowed || !this.focused || mode === "off" || !this.scene) {
      this.resetPose();
      return { changed: before !== undefined, soon: false };
    }
    const mouse = mode === "both" || mode === "mouse" ? this.mouse : undefined;
    const typing = mode === "both" || mode === "typing" ? this.typing : undefined;
    const source = mouse && (!typing || mouse.order > typing.order) ? "mouse" : typing ? "typing" : undefined;
    const target = source === "mouse" ? mouse : source === "typing" ? typing : undefined;
    const point = source === "mouse" && mouse ? { x: mouse.x - this.correction.x, y: mouse.y - this.estimatedTop() - this.correction.y }
      : this.caret ? { x: this.caret.x, y: this.scene.rows + this.caret.y } : undefined;
    const tracking = !!target && !!point && now - target.at < REST_AFTER;
    if (!tracking && !this.offset) return { changed: false, soon: false };
    const eye = this.scene.eye, old = this.source === source ? this.goal : undefined;
    const desired = tracking && point ? {
      x: axis(point.x - eye.x, old?.x ?? 0, 4, 2), y: axis(point.y - eye.y, old?.y ?? 0, 1.1, 0.5),
    } : resting;
    // Start from the current expression, not an invented intermediate pose. No sprite changes on idle frames.
    if (!this.offset) {
      this.offset = { ...resting }; this.goal = { ...resting };
      this.sampledAt = target?.at ?? now;
    }
    if (desired.x !== this.goal.x || desired.y !== this.goal.y) {
      // Integrate the old trajectory up to the input event, then turn toward the newest destination.
      const changedAt = Math.max(this.sampledAt ?? now, Math.min(now, tracking ? target!.at : this.releasedAt ?? now));
      this.sample(changedAt);
      this.goal = { ...desired };
    }
    this.source = tracking ? source : undefined;
    this.releasedAt = undefined;
    this.sample(now);
    const soon = this.offset!.x !== this.goal.x || this.offset!.y !== this.goal.y;
    if (!tracking && !soon) this.resetPose();
    return { changed: before !== (this.offset && `${this.offset.x},${this.offset.y}`), soon };
  }
}

/** Bounded SGR/focus observer, not a keyboard parser. Discards ordinary input and pasted content.
 * Pi's fullscreen listener consumes mouse reports before ctx.ui.onTerminalInput sees them.
 * Observe stdin passively; never change its mode/encoding, consume events or log bytes. */
export class PointerReports {
  private sequence = "";
  private paste = false;
  private string = false;
  private stringEscape = false;
  constructor(private move: (x: number, y: number) => void, private focus: (value: boolean) => void) {}
  feed(data: string | Buffer) {
    const text = typeof data === "string" ? data : data.toString("utf8");
    for (const ch of text) {
      if (this.string) {
        if (ch === "\x07" || this.stringEscape && ch === "\\") this.string = false;
        this.stringEscape = ch === "\x1b";
        continue;
      }
      if (ch === "\x1b") { this.sequence = ch; continue; }
      if (!this.sequence) continue;
      this.sequence += ch;
      if (this.sequence.length === 2) {
        if (!this.paste && "]P_X^".includes(ch)) { this.string = true; this.sequence = ""; }
        else if (ch !== "[") this.sequence = "";
        continue;
      }
      if (this.sequence.length > 64) { this.sequence = ""; continue; }
      if (ch < "@" || ch > "~") continue;
      const sequence = this.sequence; this.sequence = "";
      if (sequence === "\x1b[201~") { this.paste = false; continue; }
      if (this.paste) continue;
      if (sequence === "\x1b[200~") { this.paste = true; continue; }
      if (sequence === "\x1b[I" || sequence === "\x1b[O") { this.focus(sequence.endsWith("I")); continue; }
      const match = /^\x1b\[<(\d{1,4});(\d{1,6});(\d{1,6})M$/.exec(sequence);
      if (!match) continue;
      const code = Number(match[1]);
      // Only free pointer motion. Dragging/selecting/clicking/wheeling belongs entirely to pi.
      if ((code & ~63) !== 0 || (code & 32) === 0 || (code & 3) !== 3) continue;
      const x = Number(match[2]) - 1, y = Number(match[3]) - 1;
      if (x >= 0 && y >= 0) this.move(x, y);
    }
  }
  reset() { this.sequence = ""; this.paste = false; this.string = false; this.stringEscape = false; }
}

export function observePointer(move: (x: number, y: number) => void, focus: (value: boolean) => void,
  input: Pick<NodeJS.ReadStream, "on" | "off"> = process.stdin): () => void {
  const reports = new PointerReports(move, focus);
  const listener = (data: string | Buffer) => reports.feed(data);
  input.on("data", listener);
  let disposed = false;
  return () => { if (disposed) return; disposed = true; input.off("data", listener); reports.reset(); };
}
