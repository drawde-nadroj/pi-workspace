import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { ScrollView, isKeyRelease, matchesKey, truncateToWidth, wrapTextWithAnsi,
  type Component, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import type { MirroredEntry } from "./journal-observer.ts";
import { renderThought, thoughtColor } from "./thought-frame.ts";

const key = (entry: MirroredEntry) => `${entry.day}:${entry.id}`;
const stage = (depth: number) => ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"][depth - 1] ?? "THOUGHT";
// Journal text is data. Do not allow terminal controls, including cursor markers,
// to turn a read-only reader into an input surface. Preserve newlines and tabs.
export const readableBody = (body: string) => stripVTControlCharacters(body)
  .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "").replace(/\t/g, "    ");
export function mirrorThoughtLines(entry: MirroredEntry, theme: Theme, width: number): string[] {
  const body = readableBody(entry.body);
  const lines = width < 12 ? body.split("\n").flatMap(line => wrapTextWithAnsi(line, width))
    : renderThought({ ...entry, body }, theme, width);
  // Native user-message rendering adds shell prompt zones. A mirror is not an
  // actual prompt/transcript entry, so keep its styling but omit those zones.
  return lines.map(line => line.replace(/\x1b\]133;[A-Z]\x07/g, ""));
}
type Anchor = { key: string; day: string; line: number; end: number };

/** A complete, read-only projection. ScrollView owns clamping/scroll state;
 * explicit viewport slicing also works in regular Pi's overlay renderer. */
export class MirrorReader implements Component {
  private entries: MirroredEntry[] = [];
  private lines: string[] = [];
  private anchors: Anchor[] = [];
  private width = 0;
  private dirty = true;
  private disposed = false;
  private help = false;
  private helpOffset = 0;
  private helpHeight = 1;
  private helpLength = 0;
  private warning = "";
  private days = 0;
  private selectedKey?: string;
  private readonly scroll = new ScrollView({ render: () => this.lines, invalidate() {} }, { follow: "end" });
  private initial = true;

  constructor(private readonly tui: Pick<TUI, "terminal" | "requestRender">,
    private readonly theme: Theme, private readonly done: () => void) {}

  update(entries: MirroredEntry[], warning = "") {
    if (this.disposed) return;
    // Sorting days is stable: preserve the journal's parent/child order within a day.
    this.entries = [...entries].sort((a, b) => a.day.localeCompare(b.day));
    this.days = new Set(entries.map(e => e.day)).size;
    this.warning = readableBody(warning).replace(/\s+/g, " ");
    this.dirty = true;
    this.tui.requestRender();
  }
  private current() {
    return this.anchors.find(a => a.key === this.selectedKey)
      ?? this.anchors.find(a => a.end > this.scroll.scrollTop) ?? this.anchors.at(-1);
  }
  private layout(width: number, height: number) {
    const previous = this.current();
    const within = previous ? Math.max(0, this.scroll.scrollTop - previous.line) : 0;
    const following = !this.initial && this.scroll.isFollowingEnd;
    if (this.dirty || width !== this.width) {
      this.width = width; this.dirty = false;
      this.lines = []; this.anchors = [];
      const numbers = new Map(this.entries.map((e, i) => [key(e), i + 1]));
      for (const [i, entry] of this.entries.entries()) {
        const start = this.lines.length;
        const parent = entry.parent ? numbers.get(`${entry.day}:${entry.parent}`) : undefined;
        const relation = entry.parent ? parent ? `reply to #${parent}` : "parent unavailable" : "root";
        const label = `#${i + 1} · ${entry.day} · ${stage(entry.depth)} · ${entry.time} · ${relation}`;
        this.lines.push(...wrapTextWithAnsi(this.theme.style(label, { fg: thoughtColor(this.theme, entry.depth), bold: true }), width));
        if (entry.legacyTitle) this.lines.push(...wrapTextWithAnsi(`Original heading: ${readableBody(entry.legacyTitle)}`, width));
        this.lines.push(...mirrorThoughtLines(entry, this.theme, width));
        this.lines.push("");
        this.anchors.push({ key: key(entry), day: entry.day, line: start, end: this.lines.length });
      }
      if (!this.lines.length) this.lines = wrapTextWithAnsi("No saved thoughts in this journal yet.", width);
      this.scroll.updateLayout(this.lines.length, height, () => this.tui.requestRender());
      if (this.initial) {
        // Start with the entire journal, not just its last few lines.
        this.scroll.scrollTo(0, { disableFollow: true }); this.initial = false;
      } else if (!following && previous) {
        const anchor = this.anchors.find(a => a.key === previous.key);
        this.scroll.scrollTo(anchor ? Math.min(anchor.end - 1, anchor.line + within) : this.scroll.scrollTop, { disableFollow: true });
      }
    } else this.scroll.updateLayout(this.lines.length, height, () => this.tui.requestRender());
  }
  render(width: number): string[] {
    if (width < 1 || this.disposed) return [];
    const rows = Math.max(1, Math.floor(this.tui.terminal.rows * 0.85));
    const footer = width < 65 ? "↑↓ scroll · ? help · Esc close" : "↑↓ scroll · PgUp/PgDn page · N/P thought · [/] day · ? help · Esc close";
    const header = this.theme.style(`JOURNAL · ${this.entries.length} thought${this.entries.length === 1 ? "" : "s"} · ${this.days} day${this.days === 1 ? "" : "s"} · read only`, { fg: "accent", bold: true });
    const reserve = rows >= 5 ? 4 : rows >= 2 ? 1 : 0;
    this.layout(width, Math.max(1, rows - reserve));
    const start = this.scroll.scrollTop, end = Math.min(this.lines.length, start + this.scroll.viewportHeight);
    const status = this.warning ? `Warning: ${this.warning}` :
      `#${this.anchors.indexOf(this.current()!) + 1} · ${this.current()?.day ?? "Journal"} · lines ${start + 1}–${end}/${this.lines.length} · ${this.scroll.isFollowingEnd ? "Following new saves" : "Reading · End follows latest"}`;
    const content = this.help ? [
      "Journal reader — all saved days and complete thoughts",
      ...(this.warning ? [`Warning: ${this.warning}`] : []),
      "Up / Down or J / K: scroll one line",
      "PageUp / PageDown or Space: scroll a page",
      "N / P: next / previous thought",
      "[ / ]: previous / next saved day",
      "Home: start of journal; End: latest and follow new saves",
      "B: jump to this thought's parent",
      "Mouse wheel: scroll in fullscreen Pi",
      "? or Escape: return from help; Escape / Q: close reader",
      "Reading never changes journal data or sends it to a model.",
    ].flatMap(line => wrapTextWithAnsi(line, width)) : this.lines.slice(start, end);
    const top = reserve === 4 ? [header, this.theme.style(status, { fg: this.warning ? "warning" : "muted" })] : [];
    const bottom = reserve >= 4 ? ["", this.theme.style(footer, { fg: "muted" })] : reserve >= 1 ? [this.theme.style("Esc close · ? help", { fg: "muted" })] : [];
    const bodyHeight = Math.max(1, rows - top.length - bottom.length);
    this.helpHeight = bodyHeight; this.helpLength = content.length;
    this.helpOffset = Math.min(this.helpOffset, Math.max(0, content.length - bodyHeight));
    const visible = this.help ? content.slice(this.helpOffset, this.helpOffset + bodyHeight) : content.slice(0, bodyHeight);
    return [...top, ...visible, ...Array(Math.max(0, bodyHeight - visible.length)).fill(""), ...bottom]
      .slice(0, rows).map(line => truncateToWidth(line, width, ""));
  }
  handleInput(data: string) {
    if (this.disposed || isKeyRelease(data)) return;
    if (!this.help && (["j", "k", " "].includes(data) || matchesKey(data, "up") || matchesKey(data, "down") ||
      matchesKey(data, "pageUp") || matchesKey(data, "pageDown") || matchesKey(data, "home") || matchesKey(data, "end"))) this.selectedKey = undefined;
    if (this.help) {
      if (data === "?" || data === "q" || matchesKey(data, "escape")) this.help = false;
      else if (matchesKey(data, "up") || data === "k") this.helpOffset--;
      else if (matchesKey(data, "down") || data === "j") this.helpOffset++;
      else if (matchesKey(data, "pageUp")) this.helpOffset -= this.helpHeight;
      else if (matchesKey(data, "pageDown") || data === " ") this.helpOffset += this.helpHeight;
      this.helpOffset = Math.max(0, Math.min(this.helpOffset, this.helpLength - this.helpHeight));
    }
    else if (matchesKey(data, "escape") || data === "q") { this.done(); return; }
    else if (data === "?") { this.help = true; this.helpOffset = 0; }
    else if (matchesKey(data, "up") || data === "k") this.scroll.scrollBy(-1);
    else if (matchesKey(data, "down") || data === "j") this.scroll.scrollBy(1);
    else if (matchesKey(data, "pageUp")) this.scroll.scrollBy(-Math.max(1, this.scroll.viewportHeight - 1));
    else if (matchesKey(data, "pageDown") || data === " ") this.scroll.scrollBy(Math.max(1, this.scroll.viewportHeight - 1));
    else if (matchesKey(data, "home")) this.scroll.scrollTo(0, { disableFollow: true });
    else if (matchesKey(data, "end")) this.scroll.scrollToEnd();
    else if (["n", "p", "[", "]", "b"].includes(data)) {
      const current = this.current();
      const index = this.anchors.indexOf(current!);
      let target: Anchor | undefined;
      if (data === "n") target = this.anchors[index + 1];
      if (data === "p") target = this.anchors[index - 1];
      const days = this.anchors.filter((a, i, all) => !i || a.day !== all[i - 1].day);
      if (data === "]") target = days.find(a => a.day > (current?.day ?? ""));
      if (data === "[") target = days.filter(a => a.day < (current?.day ?? "")).at(-1);
      if (data === "b") {
        const entry = this.entries.find(e => key(e) === current?.key);
        target = entry?.parent ? this.anchors.find(a => a.key === `${entry.day}:${entry.parent}`) : undefined;
      }
      if (target) {
        // Several short entries can share the final viewport. Remember the
        // selected thought even when scrolling clamps before its heading.
        this.selectedKey = target.key;
        this.scroll.scrollTo(target.line, { disableFollow: true });
      }
    }
    this.tui.requestRender();
  }
  handleMouse(event: TuiMouseEvent) {
    if (!this.disposed && !this.help && event.type === "wheel") {
      this.selectedKey = undefined;
      this.scroll.scrollBy(event.wheelDelta ?? 0);
      this.tui.requestRender();
      return { handled: true };
    }
    return undefined;
  }
  invalidate() { this.dirty = true; }
  dispose() { this.disposed = true; }
}
