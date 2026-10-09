import type { ExtensionCommandContext, Theme, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth, type Component, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { cleanLabel, shortPath } from "../ui.ts";
import { Canvas, DIRECTIONS, NAMES, MOODS, MOOD_NAMES, PHASE_STARTS, LOOP_MS, demoFrame, makePalette, type Direction, type Mood, type Palette } from "./design.ts";
import { drawActivity, drawComposer, drawHero, drawTasks } from "./scenes.ts";

export interface LabIdentity { session: string; project: string; model: string }
export interface LabResult { direction: Direction; mood?: Mood }

export class DesignLab implements Component {
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private direction: Direction;
  private playedAt: number;
  private offset = 0;
  private paused = false;
  private still = false;
  private failed = false;
  private palette?: Palette;
  private paletteKey = "";
  private tabs: { x: number; end: number; direction: Direction }[] = [];

  constructor(
    private tui: TUI,
    private theme: () => Theme,
    private identity: () => LabIdentity,
    private kb: KeybindingsManager,
    private done: (result: LabResult | undefined) => void,
    direction: Direction = "prism",
    private now: () => number = () => performance.now(),
    private mood: Mood = "biolume",
  ) {
    this.direction = direction;
    this.playedAt = now();
    this.schedule();
  }

  get columns() { return this.tui.terminal.columns; }
  get selected() { return this.direction; }
  get selectedMood() { return this.mood; }
  private elapsed() { return this.offset + (this.paused ? 0 : this.now() - this.playedAt); }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed || this.paused) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.disposed) return;
      this.tui.requestRender();
      this.schedule();
    }, this.still ? 1000 : 50);
    this.timer.unref();
  }
  invalidate() { this.palette = undefined; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private finish(result?: LabResult) {
    if (this.disposed) return;
    this.dispose();
    this.done(result);
  }
  handleInput(data: string) {
    if (this.disposed) return;
    if (this.kb.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+d")) return this.finish();
    if (this.kb.matches(data, "tui.select.confirm")) return this.finish({
      direction: this.direction, ...(this.direction === "glasshouse" ? { mood: this.mood } : {}),
    });
    const letter = (key: "r" | "m" | "e" | "s" | "g") => matchesKey(data, key) || matchesKey(data, `shift+${key}`);
    const digit = (["1", "2", "3", "4"] as const).find((key) => matchesKey(data, key));
    if (matchesKey(data, "left") || matchesKey(data, "shift+tab")) {
      this.direction = DIRECTIONS[(DIRECTIONS.indexOf(this.direction) + DIRECTIONS.length - 1) % DIRECTIONS.length];
    } else if (matchesKey(data, "right") || matchesKey(data, "tab")) {
      this.direction = DIRECTIONS[(DIRECTIONS.indexOf(this.direction) + 1) % DIRECTIONS.length];
    } else if (digit) this.direction = DIRECTIONS[Number(digit) - 1];
    else if (matchesKey(data, "space")) {
      this.offset = this.elapsed();
      this.playedAt = this.now();
      this.paused = !this.paused;
    } else if (letter("r")) {
      this.offset = 0; this.playedAt = this.now(); this.failed = false; this.paused = false;
    } else if (letter("g")) {
      if (this.direction === "glasshouse") this.mood = MOODS[(MOODS.indexOf(this.mood) + 1) % MOODS.length];
      this.direction = "glasshouse";
    } else if (letter("m")) this.still = !this.still;
    else if (letter("e")) this.failed = !this.failed;
    else if (letter("s")) {
      const current = this.elapsed() % LOOP_MS;
      this.offset = PHASE_STARTS.find((start) => start > current + 10) ?? 0;
      this.playedAt = this.now();
      this.failed = false;
    } else return;
    this.schedule();
    this.tui.requestRender();
  }
  handleMouse(event: TuiMouseEvent) {
    if (event.type !== "click" || event.button !== "left" || event.y !== 2) return undefined;
    const tab = this.tabs.find((item) => event.x >= item.x && event.x < item.end);
    if (!tab) return undefined;
    this.direction = tab.direction;
    this.tui.requestRender();
    return { handled: true, focus: true };
  }
  render(width: number): string[] {
    if (width <= 0) return [];
    const height = Math.max(1, Math.min(this.direction === "glasshouse" ? 36 : 32, this.tui.terminal.rows - 2));
    const theme = this.theme();
    const key = `${this.direction}/${this.mood}/${theme.appearance}`;
    if (!this.palette || this.paletteKey !== key) {
      this.paletteKey = key;
      this.palette = makePalette(this.direction, theme.appearance === "light", this.mood);
    }
    const c = new Canvas(width, height, theme, this.palette);
    const identity = this.identity();
    const elapsed = this.elapsed();
    const frame = demoFrame(elapsed, this.still ? 0 : elapsed, this.failed);
    this.tabs = [];
    if (width < 28 || height < 22) {
      c.text(1, 0, `LAB · ${NAMES[this.direction]}`, "accent", "base", true, width - 2);
      c.text(1, 2, "SIMULATED ACTIVITY", "warning", "base", false, width - 2);
      c.text(1, 4, identity.session, "text", "base", true, width - 2);
      c.text(1, 6, frame.status, "muted", "base", false, width - 2);
      c.text(1, 7, frame.timing, "accent", "base", false, width - 2);
      c.text(1, 9, "Resize for full scene", "faint", "base", false, width - 2);
      if (this.direction === "glasshouse") c.text(1, 10, `G · ${MOOD_NAMES[this.mood]}`, "accent", "base", false, width - 2);
      c.text(1, height - 2, "1–4 looks · R replay", "muted", "base", false, width - 2);
      c.text(1, height - 1, "Esc back", "text", "base", true, width - 2);
      return c.render();
    }

    c.text(2, 0, "◈ HOME / DESIGN LAB", "text", "base", true);
    if (width >= 64) c.right(0, this.paused ? "Ⅱ PAUSED" : this.still ? "MOTION OFF" : "● LIVE PREVIEW", "accent");
    c.text(2, 1, "Simulated activity + tasks · no model calls · no theme changes", "faint", "base", false, width - 4);
    let x = 2;
    for (const [index, direction] of DIRECTIONS.entries()) {
      const label = width < 64 ? `${index + 1}${NAMES[direction][0]}` : `${index + 1} ${NAMES[direction]}`;
      const active = direction === this.direction;
      const count = c.badge(x, 2, label, active ? "accent" : "muted", active ? "input" : "panel");
      this.tabs.push({ x, end: x + count, direction });
      x += count + 2;
    }
    c.rule(2, 3, width - 4);
    c.text(2, 4, `◆ ${cleanLabel(identity.session)}`, "text", "base", true, width - 4);
    c.text(2, 5, identity.project, "muted", "base", false, width - 4);
    if (this.direction === "glasshouse") {
      c.text(2, 6, `Glasshouse / ${MOOD_NAMES[this.mood]}`, "accent", "base", true, width - (width >= 76 ? 24 : 4));
      if (width >= 76) c.right(6, "G · change lighting", "muted");
    }

    const editorTop = height - 9;
    const cardHeight = height >= 30 ? 7 : height >= 25 ? 5 : 4;
    const cardTop = editorTop - cardHeight - 1;
    const heroHeight = Math.max(0, cardTop - 8);
    if (heroHeight) drawHero(c, { x: 2, y: 7, width: width - 4, height: heroHeight }, this.direction, frame, this.mood);
    else if (this.direction !== "glasshouse") c.text(2, 6, "Resize taller for the animated scene", "faint", "base", false, width - 4);
    if (width >= 76) {
      const left = Math.floor((width - 6) * 0.55);
      drawTasks(c, { x: 2, y: cardTop, width: left, height: cardHeight }, this.direction, frame);
      drawActivity(c, { x: left + 4, y: cardTop, width: width - left - 6, height: cardHeight }, this.direction, frame);
    } else {
      drawTasks(c, { x: 2, y: cardTop, width: width - 4, height: cardHeight }, this.direction, frame);
    }
    drawComposer(c, { x: 2, y: editorTop, width: width - 4, height: 4 }, this.direction, frame, cleanLabel(identity.model));
    c.text(2, height - 4, frame.timing, frame.failed ? "error" : "accent", "base", true, width - 4);
    if (width >= 76) c.right(height - 4, "demo clock · sample composer", "faint");
    const hints = width >= 84 ? "←/→ looks  G lighting  R replay  S step  Space pause  M motion  E error" : "1–4 looks · G light · Space pause";
    c.text(2, height - 2, hints, "muted", "base", false, width - 4);
    const back = "Esc back";
    const choose = "Enter shortlist — does not apply";
    c.text(2, height - 1, width >= 50 ? choose : "Enter shortlist", "text", "base", false, Math.max(0, width - visibleWidth(back) - 6));
    c.right(height - 1, back, "accent");
    return c.render();
  }
}

export async function showDesignLab(ctx: ExtensionCommandContext, initial: Direction = "prism", mood: Mood = "biolume"): Promise<LabResult | undefined> {
  let screen: DesignLab | undefined;
  try {
    return await ctx.ui.custom<LabResult | undefined>((tui, _theme, kb, done) => {
      screen = new DesignLab(tui, () => ctx.ui.theme, () => ({
        session: ctx.sessionManager.getSessionName()?.trim() || "Untitled session",
        project: shortPath(ctx.cwd), model: ctx.model?.id ?? "your model",
      }), kb, done, initial, undefined, mood);
      return screen;
    }, {
      overlay: true,
      overlayOptions: () => ({
        width: Math.max(1, Math.min(124, (screen?.columns ?? 84) - 4)),
        maxHeight: "100%", anchor: "center",
      }),
    });
  } finally { screen?.dispose(); }
}
