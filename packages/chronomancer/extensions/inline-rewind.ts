import { Container, Editor, ScrollView, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { getSelectListTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { frameRows } from "./frame.ts";
import { writingColor } from "./passes.ts";
import { renderThought, thoughtColor } from "./thought-frame.ts";
import type { Entry } from "./journal.ts";

type Thought = Entry & { day: string; visit?: boolean };
type FocusedTUI = TUI & { getFocusedComponent?: () => Component | null; layoutRoot?: Container };
type ThoughtNode = { component: Container; children: Container; descendants: Map<string, { wrapper: IndentedGroup; node: ThoughtNode }> };

/** Indent a branch without narrowing its right edge. Remains a real Container
 * so the host can focus the editor mounted inside it. */
class IndentedGroup extends Container {
  innerWidth(width: number) { return width - Math.min(2, Math.max(0, width - 25)); }
  render(width: number) {
    const indent = width - this.innerWidth(width);
    return super.render(this.innerWidth(width)).map(row => " ".repeat(indent) + row);
  }
}

/** The native Pi editor owns input, undo, cursor and IME. Its frame belongs to
 * the parent thought, while the red editor stays mounted at the bottom. */
class InlineSlot implements Component {
  private editor?: Editor;
  private ui?: TUI;
  private _focused = false;
  constructor(readonly parent: Thought, private readonly owner: InlineRewind) {}
  get focused() { return this._focused; }
  set focused(value: boolean) { this._focused = value; if (this.editor) this.editor.focused = value; }
  bind(ui: TUI) {
    if (this.ui === ui && this.editor) return;
    const draft = this.editor?.getExpandedText() ?? "";
    this.ui = ui;
    this.editor = new Editor(ui, { borderColor: text => text, selectList: getSelectListTheme() }, { paddingX: 1 });
    this.editor.setText(draft);
    this.editor.focused = this._focused;
    this.editor.onSubmit = text => void this.owner.save(this.parent, text, this);
  }
  getDraft() { return this.editor?.getExpandedText() ?? ""; }
  restore(text: string) { this.editor?.setText(text); this.ui?.requestRender(); }
  handleInput(data: string) { this.editor?.handleInput(data); }
  invalidate() { this.editor?.invalidate(); }
  render(width: number): string[] {
    if (this.owner.activeId !== this.parent.id || !this.editor || !this.ui) return [];
    const indent = Math.min(2, Math.max(0, width - 25)), available = width - indent;
    if (available < 12) return this.editor.render(Math.max(3, available)).map(line => " ".repeat(indent) + truncateToWidth(line, available, ""));
    const theme = this.owner.theme(), color = thoughtColor(theme, this.parent.depth + 1);
    // Keep native editor body rows and its focused hardware cursor marker.
    const body = this.editor.render(available - 2).slice(1, -1);
    const rows = frameRows({ theme, width: available, rows: body, color,
      corners: { topLeft: theme.style(` ↳ ${writingColor(this.parent.depth + 1)} · reply to ${this.parent.time} `, { fg: color, bold: true }),
        bottomRight: theme.style(" Enter saves · Shift+↑/↓ moves ", { fg: color }) } });
    return rows.map(line => " ".repeat(indent) + line);
  }
}

/** The original transcript root owns a real tree of focusable editors and
 * saved descendants. No journal entry is re-ordered, duplicated or rewritten. */
export class InlineRewind {
  activeId?: string;
  private ui?: FocusedTUI;
  private bottom?: Component;
  private readonly slots = new Map<string, Set<InlineSlot>>();
  private readonly roots = new Map<string, Set<ThoughtNode>>();
  private readonly entries = new Map<string, Thought>();
  private latestTheme?: Theme;
  constructor(private readonly themeNow: () => Theme | undefined,
    private readonly onSave: (parent: Thought, text: string) => Promise<void>,
    private readonly onError: (error: unknown) => void) {}
  theme(): Theme { return this.themeNow() ?? this.latestTheme!; }

  private makeNode(entry: Thought, theme: Theme): ThoughtNode {
    const component = new Container(), children = new Container(), slot = new InlineSlot(entry, this);
    component.addChild({ invalidate() {}, render: width => renderThought(entry, this.ui ? this.theme() : theme, width) });
    // The live response belongs immediately below its parent, before older
    // saved descendants. An empty slot takes no space until selected.
    component.addChild(slot); component.addChild(children);
    const set = this.slots.get(entry.id) ?? new Set<InlineSlot>(); set.add(slot); this.slots.set(entry.id, set);
    if (this.ui) slot.bind(this.ui);
    return { component, children, descendants: new Map() };
  }
  private sync(entry: Thought, node: ThoughtNode, byParent: Map<string, Thought[]>) {
    node.children.clear();
    for (const child of byParent.get(entry.id) ?? []) {
      let branch = node.descendants.get(child.id);
      if (!branch) {
        const wrapper = new IndentedGroup(), childNode = this.makeNode(child, this.theme());
        wrapper.addChild(childNode.component);
        branch = { wrapper, node: childNode }; node.descendants.set(child.id, branch);
      }
      this.sync(child, branch.node, byParent);
      node.children.addChild(branch.wrapper);
    }
  }
  showDay(day: string, entries: Thought[]) {
    for (const [id, entry] of this.entries) if (entry.day === day) this.entries.delete(id);
    for (const entry of entries) this.entries.set(entry.id, { ...entry, day });
    const byParent = new Map<string, Thought[]>();
    for (const entry of this.entries.values()) if (entry.parent) {
      const children = byParent.get(entry.parent) ?? []; children.push(entry); byParent.set(entry.parent, children);
    }
    for (const [id, groups] of this.roots) {
      const root = this.entries.get(id);
      if (root) for (const group of groups) this.sync(root, group, byParent);
    }
    this.ui?.requestRender();
  }
  bind(ui: TUI) {
    this.ui = ui as FocusedTUI;
    // The dock editor exists before the first rewind. Remember it while it has
    // focus so Shift+Up can begin a pass without first typing /rewind.
    if (!this.bottom && this.ui.mode === "fullscreen") {
      const focused = this.ui.getFocusedComponent?.();
      if (focused && !(focused instanceof InlineSlot) && this.mounted(focused)) this.bottom = focused;
    }
    for (const set of this.slots.values()) for (const slot of set) slot.bind(ui);
  }
  render(entry: Thought, theme: Theme): Component {
    this.latestTheme = theme;
    if (entry.depth !== 1 || entry.visit) return { invalidate() {}, render: width =>
      entry.depth > 1 && !entry.visit && this.hasRoot(entry.root) && this.entries.has(entry.id)
        ? [] : renderThought(entry, this.ui ? this.theme() : theme, width) };
    const node = this.makeNode(entry, theme);
    const set = this.roots.get(entry.id) ?? new Set<ThoughtNode>(); set.add(node); this.roots.set(entry.id, set);
    return node.component;
  }
  private mounted(target: Component) {
    const contains = (node: Component): boolean => node === target || node instanceof Container && node.children.some(contains);
    return !!this.ui?.children.some(contains);
  }
  private slot(id: string): InlineSlot | undefined {
    return [...(this.slots.get(id) ?? [])].find(slot => this.mounted(slot));
  }
  hasRoot(id: string) { return !!this.slot(id); }
  getDraft(id: string) { return this.slot(id)?.getDraft(); }
  private scrollTo(slot: InlineSlot) {
    const ui = this.ui;
    if (!ui || ui.mode !== "fullscreen") return;
    // Guard Pi 1.0's fullscreen ScrollView layout; missing hosts remain usable
    // through manual scrolling, rather than mutating transcript or settings.
    const view = ui.layoutRoot?.children.find(child => child instanceof ScrollView) as ScrollView | undefined;
    const document = view?.children[0];
    if (!view || !(document instanceof Container)) return;
    const locate = (node: Component, width: number): { top: number; width: number } | undefined => {
      if (node === slot) return { top: 0, width };
      if (!(node instanceof Container)) return;
      const inner = node instanceof IndentedGroup ? node.innerWidth(width) : width;
      let offset = 0;
      for (const child of node.children) {
        const found = locate(child, inner);
        if (found) return { top: offset + found.top, width: found.width };
        offset += child.render(inner).length;
      }
    };
    const width = view.getContentWidth(ui.terminal.columns), position = locate(document, width);
    if (!position) return;
    const height = slot.render(position.width).length, viewport = view.viewportHeight;
    if (position.top < view.scrollTop || position.top + height > view.scrollTop + viewport)
      view.scrollTo(Math.max(0, position.top + height - Math.max(1, viewport) + 1), { disableFollow: true });
  }
  focus(id: string): boolean {
    const ui = this.ui;
    if (!ui || ui.mode !== "fullscreen") return false;
    const slot = this.slot(id);
    if (!slot) return false;
    const current = ui.getFocusedComponent?.();
    if (current && !(current instanceof InlineSlot)) this.bottom = current;
    this.activeId = id;
    slot.bind(ui); ui.setFocus(slot);
    // The newly shown editor changes transcript height; recalculate before
    // scrolling or ScrollView clamps to the previous content height.
    ui.renderNow(); this.scrollTo(slot); ui.requestRender();
    return true;
  }
  focusBottom() {
    // Blur but keep the current colored composer visible and its draft intact.
    if (this.bottom && this.ui && this.mounted(this.bottom)) this.ui.setFocus(this.bottom);
    this.ui?.requestRender();
  }
  isFullscreen() { return this.ui?.mode === "fullscreen"; }
  isInlineFocused() { return this.ui?.getFocusedComponent?.() instanceof InlineSlot; }
  isBottomFocused() { return !!this.bottom && this.ui?.getFocusedComponent?.() === this.bottom; }
  reset() { this.focusBottom(); this.activeId = undefined; this.bottom = undefined; this.ui?.requestRender(); }
  async save(parent: Thought, text: string, slot: InlineSlot) {
    if (!text.trim()) return;
    try { await this.onSave(parent, text); }
    catch (error) { slot.restore(text); this.onError(error); }
  }
}
