import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, sliceByColumn, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Canvas, makePalette, type Palette } from "./lab/design.ts";
import { middle } from "./footer-view.ts";
import { clean } from "./footer-state.ts";
import type { PreviewPhase } from "./composer-preview.ts";

export type Treatment = "luminous" | "firefly" | "wave";
interface PreviewFrame {
  width: number; height: number; phase: PreviewPhase; elapsed: number; motion: boolean;
  icons: boolean; treatment: Treatment; details: boolean; editing: boolean;
  tour: "manual" | "playing" | "paused"; draft: string;
}
interface InputBox { x: number; y: number; width: number }
export interface PreviewView {
  lines: string[];
  tabs: { x: number; y: number; end: number; phase: PreviewPhase }[];
  input?: InputBox;
  spliceInput(row: string, input: string, box: InputBox): string;
}
const labels: Record<PreviewPhase, string> = {
  typing: "Typing", working: "Working", tools: "Tools", waiting: "Waiting", finished: "Finished", error: "Error",
};
const content: Record<PreviewPhase, { status: string; tasks: string; detail: string; hint: string }> = {
  typing: { status: "What’s next?", tasks: "Tasks  1/3 · sample plan", detail: "Next: refine the composer", hint: "E to try typing · demo draft stays here" },
  working: { status: "Working", tasks: "Tasks  1/3 · sample plan", detail: "Current: refine the composer", hint: "A real draft would remain available during work" },
  tools: { status: "2 tools running", tasks: "Tasks  1/3 · sample plan", detail: "read · composer.ts    bash · tests (sample)", hint: "Tool details stay above the input, not inside it" },
  waiting: { status: "Your answer is needed", tasks: "Tasks  1/3 · waiting for a decision", detail: "Sample question: compact or spacious layout?", hint: "Sample only · no answer is submitted from this preview" },
  finished: { status: "your turn", tasks: "Tasks  2/3 · sample plan", detail: "Next: review the result", hint: "A finished run does not mean every task is done" },
  error: { status: "A tool failed", tasks: "Tasks  1/3 · sample plan", detail: "Sample failure: test process exited with code 1", hint: "Failure stays visible · no automatic retry is implied" },
};
const palettes = new Map<boolean, Palette>();
function palette(light: boolean) {
  let p = palettes.get(light);
  if (p) return p;
  p = makePalette("prism", light);
  for (let i = 0; i < 16; i++) {
    p[`flow${i}`] = mixColors(p.line, p.secondary, 0.3 + i / 15 * 0.7);
    p[`finish${i}`] = mixColors(p.line, p.success, i / 15);
  }
  palettes.set(light, p);
  return p;
}
function glyph(f: PreviewFrame, running: boolean) {
  if (!running) return f.phase === "finished" ? "✓" : f.phase === "error" ? "!" : f.phase === "waiting" ? "?" : "○";
  if (!f.motion) return "◌";
  const step = Math.floor(f.elapsed / 100);
  const frames = f.treatment === "firefly" ? ["•··", "·•·", "··•", "·•·"]
    : f.treatment === "wave" ? ["⡀⣀⣠", "⣀⣠⣤", "⣠⣤⣆", "⣤⣆⡀", "⣆⡀⣀"]
    : ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return frames[step % frames.length];
}
function contextRail(c: Canvas, x: number, y: number, width: number, f: PreviewFrame, running: boolean) {
  const length = width >= 30 ? 16 : width >= 22 ? 8 : 0;
  const label = `${length ? " " : "ctx "}42%`;
  // Bare rail: no caps or tinted capsule around context.
  const filled = Math.round(length * 0.42);
  for (let i = 0; i < length; i++) {
    // Only brightness moves. The synthetic context occupancy stays at 42%.
    const phase = running && f.motion ? f.elapsed / (f.treatment === "firefly" ? 190 : 300) : 0;
    const light = running && f.motion ? (Math.sin(i * 0.6 - phase) + 1) / 2 : 0.7;
    const cell = f.treatment === "wave" ? (i < filled ? "⣶" : "⠂") : i < filled - 1 ? "━" : i < filled ? "●" : "─";
    c.text(x + i, y, cell, i < filled ? `flow${Math.round(light * 15)}` : "line");
  }
  c.text(x + length, y, label, "secondary", undefined, true);
}

/** Fixed region positions within each viewport. Only color/emphasis changes across states. */
export function drawComposerPreview(f: PreviewFrame, theme: Theme): PreviewView {
  const { width, height } = f;
  const c = new Canvas(width, height, theme, palette(theme.appearance === "light"));
  const view: PreviewView = {
    lines: [], tabs: [],
    spliceInput(row, input, box) {
      return sliceByColumn(row, 0, box.x) + theme.style(input, { fg: c.palette.text, bg: c.palette.input })
        + sliceByColumn(row, box.x + box.width, visibleWidth(row));
    },
  };
  if (width <= 0) return view;
  const m = width < 60 ? 1 : 2;
  const usable = width - m * 2;
  const info = content[f.phase];
  const running = f.phase === "working" || f.phase === "tools";
  const tone = f.phase === "error" ? "error" : f.phase === "waiting" ? "warning" : f.phase === "finished" ? "success" : running ? "secondary" : "muted";
  if (width < 38 || height < 20) {
    c.text(0, 0, "SIMULATED · Esc back", "warning", undefined, true, width);
    if (height > 3) c.text(m, 2, `${labels[f.phase]} · ${info.status}`, tone, undefined, false, usable);
    if (height > 5) c.text(m, 4, "Resize for full composer", "muted", undefined, false, usable);
    if (height > 7) c.text(m, 6, "1–6 states · no calls/saves", "muted", undefined, false, usable);
    view.lines = c.render();
    return view;
  }
  c.text(m, 0, width < 70 ? "COMPOSER · SIMULATED" : "COMPOSER PREVIEW  /  SIMULATED", "accent", undefined, true, usable);
  if (width >= 84) c.right(0, `${f.treatment} · motion ${f.motion ? "on" : "off"}`, "secondary", m);
  c.text(m, 1, "All data is sample · no model calls · nothing saved", "muted", undefined, false, usable);
  let tabX = m;
  for (const [i, phase] of (Object.keys(labels) as PreviewPhase[]).entries()) {
    const label = width < 80 ? `${i + 1}${labels[phase][0]}` : `${i + 1} ${labels[phase]}`;
    const count = c.badge(tabX, 2, label, phase === f.phase ? "text" : "muted", phase === f.phase ? "input" : "base");
    view.tabs.push({ x: tabX, end: tabX + count, y: 2, phase });
    tabX += count + (width < 60 ? 0 : 1);
  }

  const top = height - 17;
  const border = running && f.motion ? `flow${Math.round(9 + 6 * Math.sin(f.elapsed / 900))}`
    : f.phase === "finished" ? (f.motion && f.elapsed < 800 ? `finish${Math.round(15 * (1 - f.elapsed / 800))}` : "line") : tone;
  const status = `${glyph(f, running).padEnd(3)} ${info.status}`;
  const duration = running ? `${Math.floor((12000 + f.elapsed) / 1000)}s` : f.phase === "finished" ? "last run 24s" : f.phase === "waiting" ? "paused" : f.phase === "error" ? "stopped" : "";
  c.text(m, top + 3, status, tone, undefined, true, Math.max(0, usable - visibleWidth(duration) - 2));
  c.right(top + 3, duration, tone, m);
  c.text(m, top, info.tasks, "muted", undefined, false, usable);
  const showDetail = f.details || f.phase === "waiting" || f.phase === "error";
  c.text(m, top + 1, showDetail ? info.detail : "D · expand sample task / tool detail", showDetail ? tone : "faint", undefined, false, usable);
  const sent = f.icons ? "\uf1d8" : "sent", reply = f.icons ? "\uf075" : "reply";
  const activity = `${sent} 10:42   ${reply} ${f.phase === "finished" ? "10:43" : "10:40"}`
    + (f.phase === "finished" ? "   total active 2m 18s" : "");
  c.text(m, top + 2, activity, "muted", undefined, false, usable);

  // Stable input block, even while task detail expands or a question/error takes priority.
  c.rule(m, top + 5, usable, border);
  c.text(m, top + 5, "╭", border);
  c.text(width - m - 1, top + 5, "╮", border);
  c.text(m + 2, top + 5, f.editing ? " DEMO INPUT · Enter/Esc returns " : " DRAFT · local preview ", f.editing ? "text" : "muted", "base", false, usable - 4);
  c.fill(m + 1, top + 6, usable - 2, 1, "input");
  c.text(m, top + 6, "│", border);
  c.text(width - m - 1, top + 6, "│", border);
  const box = { x: m + 2, y: top + 6, width: Math.max(1, usable - 4) };
  view.input = box;
  c.text(box.x, box.y, truncateToWidth(clean(f.draft), box.width, "…"), "text", "input", false, box.width);
  c.text(m, top + 7, f.editing ? "Nothing is sent. This demo draft is discarded on exit." : info.hint, "muted", undefined, false, usable);
  c.rule(m, top + 8, usable, "line");
  c.text(m, top + 8, "╰", border);
  c.text(width - m - 1, top + 8, "╯", border);

  // Shared right column: directory directly above model, with identical starts.
  const rightWidth = Math.max(12, Math.floor(usable * 0.43));
  const rightX = width - m - rightWidth;
  const leftWidth = rightX - m - 2;
  const footer = top + 10;
  c.text(m, footer, middle("A calmer workspace", leftWidth), "accent", undefined, true, leftWidth);
  contextRail(c, m, footer + 1, leftWidth, f, running);
  c.text(rightX, footer, middle("~/work/composer", rightWidth), "muted", undefined, false, rightWidth);
  c.text(rightX, footer + 1, middle("demo-model · high", rightWidth), "text", undefined, false, rightWidth);
  // Detailed Git symbols use separate space, never the directory/model column.
  if (width >= 100) {
    const git = "main +2 ~1 ?1";
    const x = rightX - visibleWidth(git) - 3;
    c.text(x, footer, git, "warning");
  }
  c.text(m, top + 13, `Sample context 42% · ${f.treatment} · tour ${f.tour}`, "faint", undefined, false, usable);
  c.text(m, height - 2, width >= 84 ? "1–6 / ←→ states   Space tour/pause   E type   D details   N narrow" : "1–6 states · Space tour · E type · N narrow", "muted", undefined, false, usable);
  c.text(m, height - 1, width >= 70 ? "V treatment · M motion · I icons · R replay                Esc back" : "V look · M motion · I icons · Esc back", "text", undefined, false, usable);
  view.lines = c.render();
  return view;
}
