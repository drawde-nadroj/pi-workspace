import { Canvas, type DemoFrame, type Direction, type Mood } from "./design.ts";
import { drawCat } from "./sprites.ts";
import { drawGlasshouse } from "./garden.ts";

export interface Region { x: number; y: number; width: number; height: number }
const TAU = Math.PI * 2;
const busy = (f: DemoFrame) => ["thinking", "tools", "responding"].includes(f.phase);
const tone = (f: DemoFrame) => f.failed ? "error" : f.phase === "waiting" ? "warning" : f.phase === "complete" ? "success" : "accent";

export function drawHero(c: Canvas, r: Region, direction: Direction, f: DemoFrame, mood: Mood = "biolume"): void {
  c.fill(r.x, r.y, r.width, r.height, "inset");
  if (r.height < 5 || r.width < 42) {
    c.text(r.x + 2, r.y, direction === "prism" ? "◈ PRISM" : direction === "terrarium" ? "⌂ THE NIGHT DESK" : direction === "glasshouse" ? "✿ GLASSHOUSE" : "▣ ARCADE STUDIO", tone(f), "inset", true, r.width - 4);
    if (r.height > 1) c.text(r.x + 2, r.y + 1, f.status, "muted", "inset", false, r.width - 4);
    if (r.height > 2) scanner(c, r.x + 2, r.y + r.height - 1, r.width - 4, f, direction === "arcade");
    return;
  }
  if (direction === "prism") prism(c, r, f);
  if (direction === "terrarium") terrarium(c, r, f);
  if (direction === "arcade") arcade(c, r, f);
  if (direction === "glasshouse") drawGlasshouse(c, r, f, mood);
}

function scanner(c: Canvas, x: number, y: number, width: number, f: DemoFrame, blocks = false) {
  const cycle = Math.max(1, width - 1) * 2;
  const travel = Math.floor(f.visual / 65) % cycle;
  const forward = travel < width;
  const head = forward ? travel : cycle - travel;
  for (let i = 0; i < width; i++) {
    const distance = forward ? head - i : i - head;
    const active = busy(f) && distance >= 0 && distance < 8;
    const color = f.phase === "complete" ? "success" : f.failed ? "error" : active ? `shine${Math.round(16 - distance * 2)}` : "line";
    c.text(x + i, y, blocks ? (i % 3 === 2 ? " " : "▪") : "━", color);
  }
}

function prism(c: Canvas, r: Region, f: DemoFrame) {
  const cx = r.x + 12, cy = r.y + Math.floor(r.height / 2);
  const turn = f.visual / (busy(f) ? 1500 : 4000);
  // A custom orbital sigil: the geometry moves; the rest of the interface stays anchored.
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU + (ring ? -turn : turn);
      const rx = ring ? 6 : 10;
      const ry = Math.max(1, r.height / 2 - 1.2) * (ring ? 0.65 : 1);
      const x = cx + Math.round(Math.cos(a) * rx);
      const y = cy + Math.round(Math.sin(a + ring * 0.9) * ry);
      c.text(x, y, i % 7 === 0 ? "◆" : "·", i % 7 === 0 ? (ring ? "secondary" : tone(f)) : "line");
    }
  }
  const pulse = Math.round(8 + 8 * (Math.sin(f.visual / 450) + 1) / 2);
  c.text(cx - 2, cy, f.failed ? "[ ! ]" : f.phase === "complete" ? "[ ✓ ]" : "‹ π ›", f.failed ? "error" : `shine${pulse}`, "inset", true);
  const tx = r.x + 27, available = r.width - 29;
  c.text(tx, r.y + 1, "P R I S M", "text", "inset", true, available);
  c.text(tx, r.y + 2, f.status, tone(f), "inset", false, available);
  if (r.height >= 7) c.text(tx, r.y + 4, "One quiet surface. A little electricity.", "faint", "inset", false, available);
  scanner(c, tx, r.y + r.height - 2, Math.max(1, available), f);
}

function terrarium(c: Canvas, r: Region, f: DemoFrame) {
  const floor = r.y + r.height - 1;
  const sleeping = f.phase === "idle";
  const bounce = f.phase === "complete" && r.height >= 8 ? Math.round((Math.sin(f.visual / 110) + 1) / 2) : 0;
  const drift = sleeping || f.phase === "waiting" ? 0 : Math.round(Math.sin(f.visual / 1400) * 2);
  const sx = r.x + 3 + drift;
  drawCat(c, sx, Math.max(r.y, floor - 6 - bounce), Math.min(6, r.height - 1), r.width - 5, sleeping || Math.floor(f.visual / 140) % 31 === 0);
  c.rule(r.x, floor, r.width, "line", "▔");
  c.text(sx + 13, floor - 2, Math.floor(f.visual / 450) % 2 ? "╮" : "─", "fur");
  const tx = r.x + 23, available = r.width - (r.width >= 64 ? 36 : 25);
  c.text(tx, r.y + 1, "the night desk", "accent", "inset", true, available);
  c.text(tx, r.y + 2, f.status, f.failed ? "error" : "muted", "inset", false, available);
  const action = sleeping ? "z Z" : f.failed ? "!" : f.phase === "waiting" ? "?" : f.phase === "complete" ? "♥" : f.phase === "tools" ? "⚒" : "...";
  if (r.height >= 7) c.text(sx + 16, r.y + 1, action, tone(f));
  if (r.height >= 6) {
    for (let i = 0; i < 5; i++) c.text(tx + i * 3, floor - 1, i < f.done ? "▣" : "□", i < f.done ? "accent" : "line");
    c.text(tx + 17, floor - 1, "little wins", "faint", "inset", false, Math.max(0, available - 17));
  }
  if (r.width >= 64) {
    const px = r.x + r.width - 10;
    c.text(px + 1, floor - 3, "▄█▄", "leaf");
    c.text(px, floor - 2, "▀█▀█▀", "secondary");
    c.text(px + 1, floor - 1, "▐▄▄▌", "pot");
    for (let i = 0; i < 5; i++) {
      const spark = Math.floor(f.visual / 700 + i * 2) % 7 === 0;
      c.text(px - 3 + (i * 3) % 10, r.y + i % 2, spark ? "✧" : "·", spark ? "accent" : "line");
    }
  }
  if (f.phase === "complete") {
    for (let i = 0; i < 7; i++) c.text(r.x + 2 + (i * 13) % (r.width - 4), r.y + (i + Math.floor(f.visual / 200)) % Math.max(1, r.height - 2), "✦", i % 2 ? "secondary" : "accent");
  }
}

const WORDMARK = ["█ █  ███  █   █  ███", "█ █  █ █  ██ ██  █  ", "███  █ █  █ █ █  ██ ", "█ █  █ █  █   █  █  ", "█ █  ███  █   █  ███"];
function arcade(c: Canvas, r: Region, f: DemoFrame) {
  const sweep = Math.floor(f.visual / 90) % 30;
  for (let row = 0; row < WORDMARK.length && row < r.height - 1; row++) {
    for (let col = 0; col < WORDMARK[row].length; col++) {
      const ch = WORDMARK[row][col];
      if (ch !== " ") c.text(r.x + 2 + col, r.y + row, ch, Math.abs(col - sweep) < 3 ? "glow" : row % 2 ? "secondary" : "accent");
    }
  }
  const tx = r.x + 28, available = r.width - 30;
  const label = { thinking: "01 / DREAM UP", tools: "02 / BUILD MODE", waiting: "03 / YOUR MOVE", responding: "04 / FINAL PASS", complete: "STAGE CLEAR", idle: "CONTINUE?", error: "CHECK FAILED" }[f.phase];
  c.text(tx, r.y + 1, label, tone(f), "inset", true, available);
  c.text(tx, r.y + 2, f.status, "muted", "inset", false, available);
  if (r.height >= 6) {
    c.text(tx, r.y + 4, `${f.done} / 5 TASKS`, "secondary", "inset", true, available);
    c.progress(tx + 14, r.y + 4, Math.max(0, Math.min(18, available - 14)), f.done / 5, true);
  }
  scanner(c, r.x + 2, r.y + r.height - 1, r.width - 4, f, true);
}

const TASKS = ["Define the visual language", "Shape the editor", "Bring motion to life", "Build the shared components", "Wire the future task plugin"];
export function drawTasks(c: Canvas, r: Region, direction: Direction, f: DemoFrame) {
  c.panel(r.x, r.y, r.width, r.height, direction === "arcade" ? "Mission board · sample" : "Tasks · sample plugin", direction);
  const titleY = r.y + (direction === "arcade" ? 0 : 1);
  if (r.width >= 32) c.text(r.x + r.width - 7, titleY, `${f.done}/5`, "success", "panel", true);
  const startY = r.y + 2;
  const count = Math.max(1, Math.min(4, r.height - 3));
  const first = Math.max(0, Math.min(TASKS.length - count, f.done - 1));
  for (let row = 0; row < count; row++) {
    const index = row + first, complete = index < f.done, active = index === f.done;
    const icon = complete ? "✓" : active ? (f.failed ? "!" : "›") : "○";
    const fg = complete ? "success" : active ? (f.failed ? "error" : "accent") : "faint";
    c.text(r.x + 2, startY + row, icon, fg, "panel", true);
    c.text(r.x + 5, startY + row, TASKS[index], complete ? "muted" : active ? "text" : "faint", "panel", active, r.width - 7);
  }
  c.progress(r.x + 2, r.y + r.height - 1, r.width - 4, f.done / 5, direction === "arcade");
}

export function drawActivity(c: Canvas, r: Region, direction: Direction, f: DemoFrame) {
  c.panel(r.x, r.y, r.width, r.height, "Activity · sample plugin", direction);
  const items = ["read    ui.ts", "edit    composer.ts", "check   layout.spec.ts"];
  for (let i = 0; i < Math.min(3, r.height - 3); i++) {
    const complete = f.elapsed >= 6500 + i * 1900;
    const active = f.phase === "tools" && !complete;
    const glyph = i === 2 && f.failed ? "!" : complete ? "✓" : active ? ["◐", "◓", "◑", "◒"][Math.floor(f.visual / 140) % 4] : "·";
    c.text(r.x + 2, r.y + 2 + i, glyph, f.failed && i === 2 ? "error" : complete ? "success" : "accent");
    c.text(r.x + 5, r.y + 2 + i, items[i], "muted", "panel", false, r.width - 7);
  }
  if (r.height >= 7) c.text(r.x + 2, r.y + r.height - 1, f.phase === "waiting" ? "? A question needs you" : f.failed ? "Inspect the error, then retry" : "One language. Any extension.", tone(f), "panel", false, r.width - 4);
}

export function drawComposer(c: Canvas, r: Region, direction: Direction, f: DemoFrame, model: string) {
  c.fill(r.x, r.y, r.width, r.height, "input");
  if (direction === "prism" || direction === "glasshouse") {
    for (let row = 0; row < r.height; row++) {
      const n = Math.round((Math.sin(f.visual / 350 - row * 0.8) + 1) * 8);
      c.text(r.x, r.y + row, "▌", busy(f) ? `shine${n}` : "accent", "input");
    }
    if (direction === "glasshouse") {
      c.text(r.x + 2, r.y, "a little room to grow", "accent", "input", false, r.width - 4);
    }
  } else if (direction === "terrarium") {
    c.text(r.x, r.y, "╭", "line"); c.text(r.x + r.width - 1, r.y, "╮", "line");
    c.text(r.x, r.y + r.height - 1, "╰", "line"); c.text(r.x + r.width - 1, r.y + r.height - 1, "╯", "line");
    c.text(r.x + 2, r.y, " a place for your next thought ", "accent", "input", false, r.width - 4);
  } else {
    c.rule(r.x, r.y, r.width, "secondary", "═");
    c.badge(r.x + 2, r.y, "COMMAND DECK", "accent", "input");
  }
  const prompt = direction === "arcade" ? "❯" : direction === "terrarium" ? "›" : "▸";
  c.text(r.x + 2, r.y + 1, prompt, "accent", "input", true);
  c.text(r.x + 5, r.y + 1, "Make this workspace feel like mine.", "text", "input", false, r.width - 7);
  if (r.height >= 4) c.text(r.x + 2, r.y + r.height - 1, `${model} · high`, "muted", "input", false, r.width - 4);
}
