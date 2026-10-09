import type { ExtensionAPI, ExtensionCommandContext, KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { Input, matchesKey, type Component, type Focusable, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { drawComposerPreview, type PreviewView, type Treatment } from "./composer-preview-view.ts";

export const PREVIEW_PHASES = ["typing", "working", "tools", "waiting", "finished", "error"] as const;
export type PreviewPhase = typeof PREVIEW_PHASES[number];
export interface PreviewRuntime {
  now(): number;
  set(callback: () => void, delay: number): unknown;
  clear(handle: unknown): void;
}
const runtime: PreviewRuntime = {
  now: () => performance.now(),
  set: (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref(); return timer; },
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const TOUR_STEP_MS = 4000;
const TREATMENTS: Treatment[] = ["luminous", "firefly", "wave"];

/** A local simulation only. No agent, task, persistence, or production-editor access. */
export class ComposerPreview implements Component, Focusable {
  private phase: PreviewPhase;
  private input = new Input({ prompt: "", placeholder: "Try a draft here — it never sends" });
  private focus = false;
  private editing = false;
  private disposed = false;
  private timer?: unknown;
  private entered: number;
  private offset = 0;
  private frozen = false;
  private touring = false;
  private motion: boolean;
  private icons: boolean;
  private details = false;
  private treatment: Treatment = "luminous";
  private viewport = 0;
  private view?: PreviewView;

  constructor(
    private tui: TUI,
    private theme: () => Theme,
    private kb: KeybindingsManager,
    private done: () => void,
    initial: PreviewPhase = "typing",
    private clock: PreviewRuntime = runtime,
    options: { motion?: boolean; icons?: boolean } = {},
  ) {
    this.phase = initial;
    this.entered = clock.now();
    this.motion = options.motion !== false;
    this.icons = options.icons !== false;
    this.input.setValue("Make the composer feel calm when I type.");
    this.input.onSubmit = () => this.leaveInput();
    this.input.onEscape = () => this.leaveInput();
    this.schedule();
  }
  get columns() { return this.tui.terminal.columns; }
  get selected() { return this.phase; }
  get draft() { return this.input.getValue(); }
  get isEditing() { return this.editing; }
  get focused() { return this.focus; }
  set focused(value: boolean) { this.focus = value; this.input.focused = value && this.editing; }
  private elapsed() { return this.offset + (this.frozen ? 0 : Math.max(0, this.clock.now() - this.entered)); }
  private running() { return this.phase === "working" || this.phase === "tools"; }
  private stopTimer() {
    if (this.timer !== undefined) this.clock.clear(this.timer);
    this.timer = undefined;
  }
  private schedule() {
    this.stopTimer();
    if (this.disposed || this.editing || this.frozen) return;
    const animating = this.motion && (this.running() || (this.phase === "finished" && this.elapsed() < 800));
    if (!animating && !this.touring && !this.running()) return;
    const delay = Math.max(1, Math.min(animating ? 100 : 1000,
      this.touring ? TOUR_STEP_MS - this.elapsed() : Infinity,
      this.motion && this.phase === "finished" && this.elapsed() < 800 ? 800 - this.elapsed() : Infinity));
    this.timer = this.clock.set(() => {
      this.timer = undefined;
      if (this.disposed) return;
      if (this.touring && this.elapsed() >= TOUR_STEP_MS) {
        const next = PREVIEW_PHASES.indexOf(this.phase) + 1;
        if (next < PREVIEW_PHASES.length) this.select(PREVIEW_PHASES[next], false);
        else this.touring = false;
      }
      this.tui.requestRender();
      this.schedule();
    }, delay);
  }
  private select(phase: PreviewPhase, manual = true) {
    this.phase = phase;
    this.entered = this.clock.now();
    this.offset = 0;
    if (manual) { this.touring = false; this.frozen = false; }
  }
  private leaveInput() {
    this.editing = false;
    this.input.focused = false;
    this.tui.requestRender();
    this.schedule();
  }
  private enterInput() {
    if (!this.view?.input) return;
    this.select("typing");
    this.editing = true;
    this.input.focused = this.focus;
    this.stopTimer();
  }
  private toggleTour() {
    if (this.touring) {
      this.offset = this.elapsed();
      this.entered = this.clock.now();
      this.frozen = true;
      this.touring = false;
    } else {
      if (this.phase === "error") this.select("typing");
      if (!this.frozen) this.offset = 0;
      this.entered = this.clock.now();
      this.frozen = false;
      this.touring = true;
    }
  }
  invalidate() { this.input.invalidate(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.input.focused = false;
    this.stopTimer();
  }
  close() { if (!this.disposed) { this.dispose(); this.done(); } }
  handleInput(data: string) {
    if (this.disposed) return;
    if (matchesKey(data, "ctrl+c") || matchesKey(data, "ctrl+d")) return this.close();
    if (this.editing) {
      // The input owns all keys in edit mode, including digits and preview shortcuts.
      if (this.kb.matches(data, "tui.select.cancel")) this.leaveInput();
      else if (this.view?.input) this.input.handleInput(data);
      this.tui.requestRender();
      return;
    }
    if (this.kb.matches(data, "tui.select.cancel")) return this.close();
    const digit = (["1", "2", "3", "4", "5", "6"] as const).find(key => matchesKey(data, key));
    if (digit) this.select(PREVIEW_PHASES[Number(digit) - 1]);
    else if (matchesKey(data, "right") || matchesKey(data, "tab")) this.select(PREVIEW_PHASES[(PREVIEW_PHASES.indexOf(this.phase) + 1) % PREVIEW_PHASES.length]);
    else if (matchesKey(data, "left") || matchesKey(data, "shift+tab")) this.select(PREVIEW_PHASES[(PREVIEW_PHASES.indexOf(this.phase) + PREVIEW_PHASES.length - 1) % PREVIEW_PHASES.length]);
    else if (matchesKey(data, "space")) this.toggleTour();
    else if (matchesKey(data, "r")) { this.select("typing"); this.touring = true; }
    else if (matchesKey(data, "m")) this.motion = !this.motion;
    else if (matchesKey(data, "i")) this.icons = !this.icons;
    else if (matchesKey(data, "v")) this.treatment = TREATMENTS[(TREATMENTS.indexOf(this.treatment) + 1) % TREATMENTS.length];
    else if (matchesKey(data, "d")) this.details = !this.details;
    else if (matchesKey(data, "e")) this.enterInput();
    else if (matchesKey(data, "n")) this.viewport = this.viewport ? 0 : 58;
    else return;
    this.schedule();
    this.tui.requestRender();
  }
  handleMouse(event: TuiMouseEvent) {
    if (this.disposed || event.type !== "click" || event.button !== "left" || !this.view) return undefined;
    const tab = this.view.tabs.find(item => event.y === item.y && event.x >= item.x && event.x < item.end);
    if (tab) {
      this.leaveInput(); this.select(tab.phase); this.schedule(); this.tui.requestRender();
      return { handled: true, focus: true };
    }
    const box = this.view.input;
    if (box && event.y === box.y && event.x >= box.x && event.x < box.x + box.width) {
      this.enterInput();
      this.input.handleMouse({ ...event, x: event.x - box.x, y: 0, width: box.width, height: 1 });
      this.tui.requestRender();
      return { handled: true, focus: true };
    }
    return undefined;
  }
  render(width: number): string[] {
    const size = this.viewport ? Math.min(width, this.viewport) : width;
    this.view = drawComposerPreview({
      width: Math.max(0, size), height: Math.max(1, Math.min(22, this.tui.terminal.rows - 2)),
      phase: this.phase, elapsed: this.elapsed(), motion: this.motion && !this.frozen,
      icons: this.icons, treatment: this.treatment, details: this.details, editing: this.editing,
      tour: this.touring ? "playing" : this.frozen ? "paused" : "manual",
      draft: this.input.getValue(),
    }, this.theme());
    const box = this.view.input;
    this.input.focused = !!box && this.focus && this.editing && !this.disposed;
    if (box && this.editing) {
      // Use Pi's input implementation: Unicode editing, paste, cursor marker and IME placement.
      // Only this demo line is replaced; the real editor is never read or modified.
      const row = this.view.lines[box.y];
      this.view.lines[box.y] = this.view.spliceInput(row, this.input.render(box.width)[0], box);
    }
    return this.view.lines;
  }
}

export function registerComposerPreview(pi: ExtensionAPI, preferences: () => { motion: boolean; icons: boolean }) {
  let screen: ComposerPreview | undefined;
  let opening = false;
  pi.on("session_shutdown", () => screen?.close());
  pi.registerCommand("composer-preview", {
    description: "Preview the whole composer with simulated states. No model calls, saved settings, or real editor changes.",
    getArgumentCompletions: prefix => PREVIEW_PHASES.filter(phase => phase.startsWith(prefix)).map(value => ({ value, label: value })),
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") { ctx.ui.notify("Composer preview requires Pi's terminal UI.", "info"); return; }
      if (opening) { ctx.ui.notify("Composer preview is already open.", "info"); return; }
      const initial = args.trim() || "typing";
      if (!PREVIEW_PHASES.includes(initial as PreviewPhase)) {
        ctx.ui.notify(`Usage: /composer-preview [${PREVIEW_PHASES.join("|")}]`, "warning"); return;
      }
      opening = true;
      try {
        await ctx.ui.custom<void>((tui, _theme, kb, done) => {
          screen = new ComposerPreview(tui, () => ctx.ui.theme, kb, () => done(), initial as PreviewPhase, runtime, preferences());
          return screen;
        }, {
          overlay: true,
          overlayOptions: () => ({ width: Math.max(1, Math.min(120, (screen?.columns ?? 84) - 4)), maxHeight: "100%", anchor: "center" }),
        });
      } finally { screen?.dispose(); screen = undefined; opening = false; }
    },
  });
}
