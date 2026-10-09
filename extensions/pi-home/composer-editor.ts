import { stripVTControlCharacters } from "node:util";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, sliceByColumn, truncateToWidth, visibleWidth, type EditorComponent, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { composerBottomRail, composerFrame, composerThinkingBorder, composerMessageRail, composerPadding, composerSurface } from "./composer-style.ts";
import type { HomeState } from "./state.ts";

export function isEditorComponent(value: unknown): value is EditorComponent & { focused?: boolean } {
  const c = value as EditorComponent | undefined;
  return !!c && typeof c.render === "function" && typeof c.handleInput === "function" && typeof c.getText === "function" && typeof c.setText === "function";
}

/** Decorate the EXISTING editor, not a replacement. Vim keeps its instance, undo,
 * registers, cursor, callbacks, visual selection, paste storage and completions.
 * Only public render/input/mouse methods are wrapped; cleanup is reversible.
 */
export function dressComposerEditor(editor: EditorComponent, ctx: () => ExtensionContext, home: HomeState, now: () => number = Date.now, terminalRows: () => number = () => 24): () => void {
  const original = { render: editor.render, handleInput: editor.handleInput, handleMouse: editor.handleMouse, setText: editor.setText };
  const padded = editor as EditorComponent & { getPaddingX?: () => number; setPaddingX?: (n: number) => void };
  const oldPadding = padded.getPaddingX?.();
  const canFrame = oldPadding !== undefined && typeof padded.setPaddingX === "function";
  let appliedPadding = oldPadding;
  let framed = false, verticalPad = 0, nativeBottom = 0;
  const render = function(width: number): string[] {
    verticalPad = 0;
    framed = canFrame && (home.footerPickerOpen || home.prefs.enabled && home.prefs.look === "composer") && width >= 8;
    if (canFrame) {
      const nativeWidth = framed ? width - 2 : Math.max(3, width);
      // The native wrapper needs at least three content cells for CJK + cursor.
      appliedPadding = home.footerPickerOpen || home.prefs.enabled && home.prefs.look === "composer"
        ? Math.min(2, Math.max(0, Math.floor((nativeWidth - 3) / 2))) : oldPadding;
      padded.setPaddingX!(appliedPadding!);
    }
    if (!framed) return original.render.call(editor, Math.max(3, width)).map(line => truncateToWidth(line, Math.max(0, width), ""));
    const inner = width - 2, theme = ctx().ui.theme;
    const lines = original.render.call(editor, inner);
    // Pi's public editor renders top and bottom rules. Vim adds its mode label
    // to the last row; keep that label and any menu rows after the bottom rule.
    const plain = (line: string) => stripVTControlCharacters(line);
    const isRule = (line: string) => /^[─━]/u.test(plain(line));
    // Framed text rows have inset cells, so a draft containing
    // literal box rules cannot be mistaken for a structural border.
    const bottom = lines.findIndex((line, i) => i > 0 && isRule(line));
    if (!lines.length || !isRule(lines[0]) || bottom < 0) {
      // Unknown editor shape: don't guess or remove its content.
      framed = false;
      return original.render.call(editor, width);
    }
    verticalPad = composerPadding(width, terminalRows());
    nativeBottom = bottom;
    const edge = theme.style("│", { fg: composerThinkingBorder(theme, home.thinkingLevel?.()) });
    const blank = composerSurface(theme, edge + composerSurface(theme, "", inner, true) + edge, width);
    const caption = (line: string) => plain(line).replace(/^[─━\s]+|[─━\s]+$/gu, "").trim();
    const topHint = caption(lines[0]);
    const bottomCaption = caption(lines[bottom]);
    const bottomHint = bottomCaption.match(/↓\s+\d+\s+more/)?.[0] ?? "";
    const mode = bottomCaption.replace(bottomHint, "").replace(/[─━]/g, "").trim();
    home.appearanceMode = mode;
    const result = [composerMessageRail(theme, width, home, now(),
      ctx().sessionManager.getSessionName?.() ?? "Untitled session", topHint)];
    if (verticalPad) result.push(blank);
    for (let i = 1; i < bottom; i++) {
      const line = lines[i];
      // Do not slice the generated IME marker off an otherwise fitting line.
      const safe = visibleWidth(line) <= inner ? line : sliceByColumn(line, 0, inner, true);
      result.push(composerSurface(theme, edge + composerSurface(theme, safe, inner, true) + edge, width));
    }
    if (verticalPad) result.push(blank);
    result.push(composerBottomRail(theme, width, home, ctx(), mode, bottomHint));
    for (const line of lines.slice(bottom + 1)) result.push(composerSurface(theme, " " + line + " ", width, true));
    return composerFrame(theme, result, width, home, now(), bottom + 2 * verticalPad);
  };
  const handleInput = function(data: string) {
    if (!isKeyRelease(data)) home.lastInputAt = now();
    return original.handleInput?.call(editor, data);
  };
  const handleMouse = function(event: TuiMouseEvent) {
    if (!framed) return original.handleMouse?.call(editor, event);
    const bottom = nativeBottom + 2 * verticalPad;
    if (verticalPad && (event.y === 1 || event.y === bottom - 1) && event.type === "click") return { handled: true, focus: true };
    return original.handleMouse?.call(editor, { ...event, x: Math.max(0, event.x - 1),
      y: event.y > bottom ? event.y - 2 * verticalPad : Math.max(0, event.y - verticalPad),
      width: Math.max(1, event.width - 2), height: Math.max(1, event.height - 2 * verticalPad) });
  };
  const setText = function(text: string) {
    // Native custom-screen restoration writes the unchanged draft back. Avoid
    // resetting Vim undo/repeat/cursor for that no-op while a dialog owns input.
    if (home.promptDepth > 0 && text === editor.getText()) return;
    return original.setText.call(editor, text);
  };
  editor.setText = setText;
  editor.render = render;
  editor.handleInput = handleInput;
  editor.handleMouse = handleMouse;
  editor.invalidate();
  return () => {
    if (canFrame && padded.getPaddingX?.() === appliedPadding) padded.setPaddingX!(oldPadding);
    if (editor.setText === setText) editor.setText = original.setText;
    if (editor.render === render) editor.render = original.render;
    if (editor.handleInput === handleInput) editor.handleInput = original.handleInput;
    if (editor.handleMouse === handleMouse) editor.handleMouse = original.handleMouse;
    editor.invalidate();
  };
}
