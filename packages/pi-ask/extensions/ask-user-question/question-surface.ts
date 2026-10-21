import { stripVTControlCharacters } from "node:util";
import { savedWorkspaceVisuals, type AskAppearance } from "./appearance.ts";
import { frameRows } from "./frame.ts";
import { backgroundAnsi, foregroundAnsi, Key, matchesKey, mixColors, parseColor, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export const questionAccent = (theme: any) => theme.colors?.accent ?? parseColor(theme.appearance === "light" ? "#6546aa" : "#bbadff");

/** Share Pi's active accent with Composer, assistant chat and Tasks; keep warning/error roles semantic. */
export function questionTheme(theme: any, appearance?: AskAppearance): any {
  return new Proxy(theme, {
    get(target, property) {
      if (property === "askAppearance") return appearance;
      if (property === "fg") return (role: string, text: string) => (role === "accent" || role === "borderAccent") && target.style ? target.style(text, { fg: questionAccent(target) }) : target.fg(role, text);
      if (property === "bg") return (role: string, text: string) => {
        if (role !== "selectedBg" || !target.colors || !target.getColorMode) return target.bg(role, text);
        const bg = backgroundAnsi(mixColors(target.colors.customMessageBg, questionAccent(target), .14, "srgb"), target.getColorMode());
        // Cursor and foreground styling can reset the background mid-row.
        return bg + text.replace(/\x1b\[(?:0|49)?m/g, (reset: string) => reset + bg) + "\x1b[49m";
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** The same semantic roles as the live composer; no dependency on the Workspace implementation. */
function surface(theme: any, text: string, width: number, raised = false): string {
  const safe = visibleWidth(text) <= width ? text : truncateToWidth(text, Math.max(0, width), "");
  const padded = safe + " ".repeat(Math.max(0, width - visibleWidth(safe)));
  if (!theme.colors || !theme.getColorMode) return "\x1b[49m" + padded;
  const fg = foregroundAnsi(theme.colors.text, theme.getColorMode());
  const bg = raised ? backgroundAnsi(mixColors(theme.colors.customMessageBg, theme.colors.text, .08, "srgb"), theme.getColorMode()) : "\x1b[49m";
  // Reapply only inherited colors after SGR resets. Preserve styled choices and the native IME marker.
  const inherited = padded.replace(/\x1b\[([0-9;:]*)m/g, (escape, params: string) => {
    const parts = params === "" ? ["0"] : params.split(";");
    let resetFg = false, resetBg = false;
    for (let i = 0; i < parts.length; i++) {
      const code = Number(parts[i].split(":")[0] || 0);
      if (code === 0) { resetFg = true; resetBg = true; }
      else if (code === 39) resetFg = true;
      else if (code === 49) resetBg = true;
      else if (code === 38 || code === 48 || code === 58) {
        if (code === 38) resetFg = false;
        if (code === 48) resetBg = false;
        if (!parts[i].includes(":")) i += parts[i + 1] === "2" ? 4 : parts[i + 1] === "5" ? 2 : 0;
      } else if (code >= 30 && code <= 37 || code >= 90 && code <= 97) resetFg = false;
      else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) resetBg = false;
    }
    return escape + (resetFg ? fg : "") + (resetBg ? bg : "");
  });
  return fg + bg + inherited + "\x1b[49m\x1b[39m";
}

export function questionHeight(tui: any): number {
  return Math.max(1, Math.min(26, (tui.terminal?.rows ?? 30) - 4));
}

/** Keep the existing question state machine and editors; supply only a bounded viewport. */
export function questionViewport(tui: any): any {
  const terminal = new Proxy(tui.terminal ?? {}, {
    get(target, property) {
      if (property === "rows") return Math.max(1, questionHeight(tui) - 2);
      return Reflect.get(target, property);
    },
  });
  return new Proxy(tui, {
    get(target, property) {
      if (property === "terminal") return terminal;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Quiet while waiting for a person. No timer, animation loop, or changed answer semantics. */
export interface MoreAction { label: string; key?: string; hint?: string; danger?: boolean; run?: () => void }

/** Session-only presentation state; never written to preferences. Live frames only. */
let panelPinned = true;

export function frameQuestion(component: any, theme: any, tui: any, previewAppearance?: AskAppearance, raised = false): any {
  // Preview injection is display-only; live interactions read their own settings once.
  const saved = savedWorkspaceVisuals();
  const appearance = previewAppearance ?? theme.askAppearance ?? saved.appearance;
  const density = saved.density;
  const preview = previewAppearance !== undefined;
  let disposed = false, framed = false, removedHeader = false;
  let menu: MoreAction[] | undefined, selected = 0, focused = false;
  // A preview always shows the full panel and never reads or writes the live pin.
  let pinned = preview ? true : panelPinned;
  let expanded = true;
  let pinHit: { x: number; width: number } | undefined;

  /** One predicate for every frame control: a pending close confirmation is modal. */
  const confirmingDismiss = () => component.isConfirmingDismiss?.() === true;

  const pageLines = () => Math.max(1, (tui.terminal?.rows ?? 24) - 2);
  const scrollTranscript = (lines: number) => {
    if (typeof tui.scrollBy !== "function") return false;
    tui.scrollBy(lines);
    return true;
  };
  const setPinned = (value: boolean) => {
    if (pinned === value) return;
    pinned = value;
    if (!preview) panelPinned = value;
  };
  const setExpanded = (value: boolean) => {
    if (expanded === value) return;
    // The pending confirmation is modal: its banner outranks every frame control.
    if (!value && confirmingDismiss()) return;
    expanded = value;
    // Focus belongs to the frame's mode: a compact bar holds no editable field.
    component.focused = focused && !menu && expanded;
    component.invalidate?.();
    if (typeof tui.requestRender === "function") tui.requestRender();
  };
  const closeMenu = () => { menu = undefined; component.focused = focused && expanded; component.invalidate?.(); tui.requestRender(); };
  const openMenu = () => {
    if (confirmingDismiss()) return;
    const actions: MoreAction[] = component.getMoreActions?.() ?? [
      { label: "Add or edit note", key: "\t", hint: "Tab" },
      { label: "Ask for clarification", key: "\x1b[47;5u", hint: "Ctrl+?" },
      { label: "Clear this field", key: "\x03", hint: "Ctrl+C" },
      { label: "Insert a new line", key: "\x1b[13;2u", hint: "Shift+Enter" },
    ];
    if (!actions.length) return;
    menu = [...actions, { label: pinned ? "Unpin to compact bar" : "Pin panel open", run: () => (pinned ? (setPinned(false), setExpanded(false)) : setPinned(true)) }];
    selected = 0; component.focused = false; tui.requestRender();
  };
  const menuLines = (width: number) => {
    const rows: string[] = [];
    const budget = Math.max(1, questionHeight(tui) - 5);
    // A destructive row keeps its own tone; the cursor is the only selection cue.
    const entries = menu!.map((action, index) => wrapTextWithAnsi(
      action.danger ? theme.fg("error", `${index === selected ? "›" : " "} ${action.label}${action.hint ? ` · ${action.hint}` : ""}`)
        : theme.fg(index === selected ? "accent" : "muted", `${index === selected ? "›" : " "} ${action.label}${action.hint ? ` · ${action.hint}` : ""}`),
      width));
    const before = entries.slice(0, selected).flat().length;
    const all = entries.flat();
    const start = Math.max(0, Math.min(before, all.length - budget));
    rows.push(...all.slice(start, start + budget));
    rows.push(...wrapTextWithAnsi(theme.fg("accent", "↑↓ choose · Enter select · Esc back"), width));
    return rows;
  };
  /** One line that keeps the question reachable while the transcript scrolls. */
  const compactBar = (width: number): string[] => {
    const tone = (role: string) => (text: string) => theme.fg(role, text);
    const candidates = [
      { label: "Pin", style: tone("accent") },
      { label: "Esc dismiss", style: tone("error") },
      { label: appearance.title, style: tone("muted") },
      { label: component.getHeaderLabel?.() ?? "1 of 1", style: tone("muted") },
      { label: "Enter open", style: tone("dim") },
      ...(typeof tui.scrollBy === "function" ? [{ label: "PgUp/PgDn scroll", style: tone("dim") }] : []),
      { label: "F2 More", style: tone("dim") },
    ];
    const pieces: string[] = [];
    let cells = 0;
    for (const candidate of candidates) {
      const separator = pieces.length ? 3 : 0;
      const cellsWith = cells + separator + visibleWidth(candidate.label);
      // Priority order: a wider terminal adds controls back from the right.
      if (cellsWith > width) break;
      pieces.push(`${pieces.length ? theme.fg("dim", " · ") : ""}${candidate.style(candidate.label)}`);
      cells = cellsWith;
    }
    if (!pieces.length) return [truncateToWidth(theme.fg("accent", "Pin"), Math.max(0, width), "")];
    return [truncateToWidth(`${pieces.join("")}${" ".repeat(Math.max(0, width - cells))}`, width)];
  };
  // Wire collapse-on-advance once: the pin decides whether the next question reopens.
  component.setAdvanceListener?.(() => { if (!pinned) setExpanded(false); });

  return {
    get focused() { return focused; },
    set focused(value: boolean) { focused = value; component.focused = value && !menu && expanded; },
    invalidate() { component.invalidate?.(); },
    handleInput(data: string) {
      if (disposed) return;
      // A pending confirmation owns the keyboard: the form decides every key, so no
      // frame control (F2, the menu, the pin) can run an action or hide the banner.
      if (confirmingDismiss()) { component.handleInput?.(data); return; }
      if (!expanded) {
        // The bar is display and navigation only; it never edits an answer.
        if (matchesKey(data, Key.f2)) { setExpanded(true); openMenu(); return; }
        if (matchesKey(data, Key.escape)) { setExpanded(true); component.handleInput?.("\x1b"); return; }
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) { setExpanded(true); return; }
        if (matchesKey(data, Key.pageUp)) scrollTranscript(-pageLines());
        else if (matchesKey(data, Key.pageDown)) scrollTranscript(pageLines());
        return;
      }
      if (matchesKey(data, Key.f2)) { if (menu) closeMenu(); else openMenu(); return; }
      if (menu) {
        if (matchesKey(data, Key.escape)) { closeMenu(); return; }
        if (matchesKey(data, Key.up)) selected = (selected - 1 + menu.length) % menu.length;
        else if (matchesKey(data, Key.down)) selected = (selected + 1) % menu.length;
        else if (matchesKey(data, Key.enter)) {
          const action = menu[selected]; closeMenu();
          if (action.run) action.run(); else if (action.key) component.handleInput?.(action.key);
          return;
        }
        tui.requestRender(); return;
      }
      component.handleInput?.(data);
    },
    handleMouse(event: any) {
      if (disposed) return;
      // A pending close confirmation must not be hidden by collapsing the panel.
      const confirming = confirmingDismiss();
      if (!expanded) {
        if (event.type === "wheel") return scrollTranscript(event.wheelDelta ?? 0) ? { handled: true } : undefined;
        if (event.type !== "click" || event.button !== "left" || event.y !== 0) return undefined;
        if (!confirming && event.x >= 0 && event.x < 3) { setPinned(true); setExpanded(true); return { handled: true, focus: true }; }
        setExpanded(true);
        return { handled: true, focus: true };
      }
      if (menu) return undefined;
      if (event.type === "click" && event.button === "left" && pinHit && !confirming
        && event.y === 0 && event.x >= pinHit.x && event.x < pinHit.x + pinHit.width) {
        if (pinned) { setPinned(false); setExpanded(false); } else setPinned(true);
        return { handled: true, focus: true };
      }
      if (!component.handleMouse) return undefined;
      return component.handleMouse(framed ? { ...event, x: event.x - 2, y: event.y - 1 + Number(removedHeader), width: Math.max(1, event.width - 4), height: Math.max(1, event.height - 2) } : event);
    },
    dispose() { if (!disposed) { disposed = true; component.dispose?.(); } },
    render(width: number): string[] {
      if (width <= 0) return [];
      if (!expanded) { pinHit = undefined; return compactBar(width); }
      framed = width >= 10 && questionHeight(tui) >= 5;
      if (!framed) { pinHit = undefined; return menu ? menuLines(width).slice(0, questionHeight(tui)) : component.render(width); }
      const inner = width - 4;
      const lines: string[] = menu ? menuLines(inner) : [...component.render(inner)];
      const rule = (line: string | undefined) => !!line && /^\s*[─━]+\s*$/.test(stripVTControlCharacters(line));
      removedHeader = rule(lines[0]);
      if (removedHeader) lines.shift();
      if (rule(lines.at(-1))) lines.pop();
      const limit = Math.max(0, questionHeight(tui) - 2);
      // A small stable body avoids jumps between short tabs. Pad after content, never move the cursor.
      if (density === "spaced") while (lines.length < Math.min(12, limit)) lines.push("");
      const title = truncateToWidth(menu ? " More actions " : ` ${appearance.title} `, Math.max(0, width - 2), "");
      const position = menu ? "" : truncateToWidth(` ${component.getHeaderLabel?.() ?? "1 of 1"} `, Math.max(0, width - 2), "");
      const accent = questionAccent(theme);
      const progress = appearance.labels === "matched" ? accent
        : theme.colors?.muted ? mixColors(accent, theme.colors.muted, .55) : accent;
      const pinLabel = menu ? "" : pinned ? " Pinned " : " Pin ";
      // A truncated pin label is not a target: keep the title readable and let F2 More stand in.
      const pinFits = pinLabel !== "" && visibleWidth(title) + visibleWidth(pinLabel) <= inner - 2;
      const rendered = frameRows({ theme, width, rows: lines, inset: 1, color: accent,
        corners: { [appearance.titlePosition]: theme.style ? theme.style(title, { fg: accent, bold: true }) : theme.fg("accent", title),
          [appearance.progressPosition]: theme.style ? theme.style(position, { fg: progress, bold: true }) : theme.fg(appearance.labels === "matched" ? "accent" : "muted", position),
          ...(pinFits ? { topRight: theme.style ? theme.style(pinLabel, { fg: accent, bold: true }) : theme.fg("accent", pinLabel) } : {}) },
        surface: (text, cells) => surface(theme, text, cells, raised) });
      // The corner label is the only mouse target; truncation leaves F2 More as the path.
      pinHit = undefined;
      if (pinFits) {
        const top = stripVTControlCharacters(rendered[0] ?? "");
        const at = top.lastIndexOf(pinLabel.trim());
        if (at >= 0) pinHit = { x: visibleWidth(top.slice(0, at)), width: visibleWidth(pinLabel.trim()) };
      }
      return rendered;
    },
  };
}
