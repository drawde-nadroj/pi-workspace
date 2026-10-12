import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi, type Component, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { type MirroredEntry } from "./journal-observer.ts";
import { mirrorThoughtLines } from "./mirror-reader.ts";

/** A bounded launcher, not the journal itself. Complete history lives in the reader. */
export class MirrorWidget implements Component {
  private cached?: { width: number; budget: number; lines: string[] };
  constructor(private readonly entry: MirroredEntry | undefined, private readonly theme: Theme,
    private readonly parent?: MirroredEntry, private readonly count = entry ? 1 : 0,
    private readonly open?: () => void, private readonly rows: () => number = () => 40) {}
  render(width: number): string[] {
    if (width < 1) return [];
    const budget = Math.max(1, Math.min(10, Math.floor(this.rows() / 4)));
    if (this.cached?.width === width && this.cached.budget === budget) return this.cached.lines;
    const cue = this.theme.style("/chronomancer mirror read · full journal", { fg: "accent" });
    if (budget < 4) return wrapTextWithAnsi(cue, width).slice(0, budget);
    const header = this.theme.style(`JOURNAL MIRROR · ${this.count} thoughts · ${this.entry?.day ?? "no saved thoughts"}`, { fg: "muted" });
    const source = stripVTControlCharacters(this.parent?.body.replace(/\s+/g, " ") ?? "");
    const parent = this.parent
      ? this.theme.style(`↳ ${["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"][this.parent.depth - 1]} · ${source}`, { fg: "muted" })
      : undefined;
    const lines = this.entry ? mirrorThoughtLines(this.entry, this.theme, width)
      : wrapTextWithAnsi("No saved thoughts yet.", width);
    const available = Math.max(0, budget - (parent ? 4 : 3));
    const limited = lines.length > available;
    const rendered = [header, ...(parent ? [parent] : []), ...lines.slice(0, available),
      this.theme.style(limited ? "Latest thought · excerpt; open full journal below" : "Latest thought · all history available below", { fg: "muted" }), cue]
      .map(line => truncateToWidth(line, width, ""));
    this.cached = { width, budget, lines: rendered };
    return rendered;
  }
  handleMouse(event: TuiMouseEvent) {
    if (event.type === "click" && event.button === "left" && this.open) {
      this.open(); return { handled: true };
    }
    return undefined;
  }
  invalidate() { this.cached = undefined; }
}
