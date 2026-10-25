import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, Input, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { frameRows, createFrameController, type FrameState } from "../../lib/frame.ts";
import { taskPanelDefaults, taskPanelPreview, taskDemo, type TaskElementId } from "./task-presentation.ts";
import { taskControls, taskControlElement, TASK_ELEMENTS } from "./task-settings.ts";
import { readAskAppearance } from "../../packages/pi-ask/extensions/ask-user-question/appearance.ts";
import { questionPreview, type AskElementId } from "../../packages/pi-ask/extensions/ask-user-question/question-preview.ts";
import { readTranscript, transcriptPreview, type TranscriptElementId } from "./transcript-presentation.ts";
import { type FooterPrefs } from "./footer-state.ts";
import { ELEMENTS, POSITIONS, STATES, COLORS, appearanceDefaults, clonePrefs, safeText, validColor,
  type ElementId, type AppearanceState, type AppearanceColor, type AppearanceHit } from "./appearance.ts";
import { appearanceColor } from "./appearance-render.ts";
import { SelectionPulse, selectionHighlight, selectionRow } from "./footer-selection.ts";
import { connectPreview } from "./preview-selection.ts";
import { settingValue, partName, settingHeading, settingRow } from "./workspace-setting-layout.ts";
import { generalPreview } from "./workspace-general-preview.ts";

export interface FooterPreview {
  render(width: number, shimmer?: number): { editor: string[]; footer: string[]; above?: string[]; hits: AppearanceHit[] };
  select(selected: ElementId | "frame", state?: AppearanceState): void;
  temporary?: boolean;
  reducedMotion?: boolean;
}
import type { Selection, Control, Inspection, ChoiceAudition } from "./workspace-room-types.ts";
import { inputControls, INFO, nameOf } from "./workspace-input-room.ts";
import { askControls as buildAskControls, transcriptControls as buildTranscriptControls, askElements, transcriptElements } from "./workspace-message-rooms.ts";
import { preferenceControls, type PreferenceGroup } from "./workspace-preference-rooms.ts";
export { OTHER_OPTIONS } from "./workspace-preference-rooms.ts";
interface Target { x: number; y: number; width: number; inspect?: Inspection; choice?: number; help?: string; action(): void }
const SECTIONS = ["elements", "tasks", "ask", "transcript", "other", "workspace"] as const;
type Section = typeof SECTIONS[number];
const sectionOf = (pane: Section | "properties"): Section => pane === "properties" ? "elements" : pane;
const friendlyValue = (value: string) => ({ matched: "Match frame color", quiet: "Quieter color", semantic: "Status color", hierarchy: "Quieter progress", topLeft: "Top left", topCenter: "Top center", bottomLeft: "Bottom left", bottomCenter: "Bottom center", bottomRight: "Bottom right", topRight: "Top right", rail: "Along the border", adaptive: "Automatic", work: "While working", changes: "When progress changes", on: "On", off: "Off", clockwise: "Clockwise", counterclockwise: "Counterclockwise" } as Record<string, string>)[value] ?? value;

/** One transaction, one native-editor instance, one full-width preview. No model requests. */
export async function chooseFooter(ctx: ExtensionCommandContext, initial: FooterPrefs, preview: (p: FooterPrefs) => void,
  surface?: FooterPreview, signal?: AbortSignal): Promise<FooterPrefs | undefined> {
  let draft = clonePrefs(initial);
  draft.appearance ??= appearanceDefaults(draft);
  draft.tasks ??= taskPanelDefaults();
  const baseline = JSON.stringify(draft);
  const undo: FooterPrefs[] = [];
  let release = () => {};
  try { return await ctx.ui.custom<FooterPrefs | undefined>((tui, theme, _kb, done) => {
    let selected: Selection = "status", state: AppearanceState | undefined, pane: "elements" | "properties" | "workspace" | "other" | "tasks" | "ask" | "transcript" = "elements";
    let elementIndex = 0, propertyIndex = 0, workspaceIndex = 0, otherIndex = 0, more = false, taskAdvanced = false, otherAdvanced = false, query = "", message = "";
    let targets: Target[] = [], inputY = -1, inputX = 0, inputWidth = 0;
    let preferenceGroup: PreferenceGroup = "all";
    let edit: { input: Input; title: string; help: string; accept(value: string): boolean } | undefined;
    let choices: { title: string; items: Array<{ label: string; value: string }>; index: number; current: string; accept(value: string): void; audition?: ChoiceAudition; geometry?: { size: string; height: number } } | undefined;
    let choiceHover: number | undefined, auditionState: { value?: AppearanceState } | undefined, auditionPrefs: FooterPrefs | undefined, demoAudition: FrameState | undefined;
    const previewState = () => auditionState ? auditionState.value : state;
    const auditionChoice = () => {
      if (closed || !focused || !choices?.audition) return;
      const value = choices.items[choiceHover ?? choices.index].value;
      if (value === choices.current) choices.audition.restore(); else choices.audition.show(value);
    };
    const restoreChoice = () => { choices?.audition?.restore(); choiceHover = undefined; };
    let discardConfirm = false, closed = false, focused = true, dimensions = "";
    let hovered: Inspection | undefined, hoverHelp = "", hoverKey = "", lastNativeTarget: Selection = selected;
    const inputInspection = (): Inspection => (pane === "properties" ? propertyControls()[propertyIndex]?.inspect : pane === "other" ? otherControls()[otherIndex]?.inspect : undefined) ?? { room: "input", id: selected };
    const syncNativeSelection = (force = false) => {
      const target = hovered?.room === "input" ? hovered : inputInspection();
      const id = target.room === "input" ? target.id : selected;
      if (force || id !== lastNativeTarget) { lastNativeTarget = id; surface?.select(id, previewState()); }
    };
    const clearHover = () => { hovered = undefined; hoverHelp = ""; hoverKey = ""; if (choiceHover !== undefined) { choiceHover = undefined; restoreChoice(); auditionChoice(); } syncNativeSelection(); };
    const rooms = [{ label: "Input", value: "elements" }, { label: "Tasks", value: "tasks" }, { label: "Ask", value: "ask" },
      { label: "Transcript", value: "transcript" }, { label: "More settings", value: "other" }, { label: "General", value: "workspace" }];
    const chooseRoom = () => choose("Choose a room", rooms, sectionOf(pane), next => { pane = next as typeof pane; });
    let taskIndex = 0, taskSelected: TaskElementId = "frame", taskFocus: "elements" | "properties" = "properties";
    let askSelected: AskElementId = "title", askIndex = 0, askFocus: "elements" | "properties" = "properties";
    let transcriptSelected: TranscriptElementId = "chatIdentity", transcriptIndex = 0, transcriptFocus: "elements" | "properties" = "properties";
    let demoState: FrameState = "working", demoRevision = 0;
    const demoMotion = createFrameController({ automatic: true, requestRender: () => {
      if (!closed && focused && pane === "tasks") tui.requestRender(); else demoMotion.reset();
    } });
    const pulse = new SelectionPulse(() => {
      if (closed || !focused || edit || discardConfirm || draft.selectionShimmer === "off") { pulse.stop(); return; }
      tui.requestRender();
    });
    const focusKey = () => choices ? `choice:${choices.title}:${choices.index}` : `${pane}:${pane === "tasks" ? `${taskSelected}:${taskFocus}:${taskIndex}` : pane === "ask" ? `${askSelected}:${askFocus}:${askIndex}` : pane === "transcript" ? `${transcriptSelected}:${transcriptFocus}:${transcriptIndex}` : `${selected}:${pane === "properties" ? propertyIndex : pane === "workspace" ? workspaceIndex : pane === "other" ? otherIndex : elementIndex}`}`;
    const afterInteraction = (before: string, previous: Selection, previousTask: TaskElementId, previousAsk: AskElementId, previousTranscript: TranscriptElementId) => {
      clearHover();
      if (before !== focusKey()) message = "";
      if (closed || !focused || edit || discardConfirm || draft.selectionShimmer === "off") pulse.stop();
      else if (previous !== selected || before !== focusKey()) pulse.start(previous !== selected || previousTask !== taskSelected || previousAsk !== askSelected || previousTranscript !== transcriptSelected ? "element" : "focus");
      if (!closed) tui.requestRender();
    };
    const dirty = () => JSON.stringify(draft) !== baseline;
    const design = () => draft.appearance!;
    const changed = (mutate: () => void) => {
      undo.push(clonePrefs(draft)); if (undo.length > 50) undo.shift();
      mutate(); message = "Preview updated · not saved"; publish();
    };
    const publish = () => { preview(clonePrefs(draft)); syncNativeSelection(true); tui.requestRender(); };
    const select = (id: Selection) => {
      selected = id; propertyIndex = 0; pane = "properties"; query = "";
      elementIndex = elements().indexOf(id); syncNativeSelection(); tui.requestRender();
    };
    const selectTask = (id: TaskElementId) => {
      taskSelected = id; pane = "tasks"; taskFocus = "properties";
      const controls = taskProperties(), preferred = TASK_ELEMENTS.find(item => item.id === id)?.control;
      taskIndex = Math.max(0, controls.findIndex(control => control.label === preferred));
      tui.requestRender();
    };
    const selectAsk = (id: AskElementId) => { askSelected = id; askFocus = "properties"; askIndex = 0; pane = "ask"; tui.requestRender(); };
    const askStyle = (display = false) => { const prefs = display ? auditionPrefs ?? draft : draft; return readAskAppearance(prefs.ask, prefs.questionLabels); };
    const transcriptStyle = (display = false) => { const prefs = display ? auditionPrefs ?? draft : draft; return readTranscript(prefs.transcript, prefs); };
    const selectTranscript = (id: TranscriptElementId) => { transcriptSelected = id; transcriptFocus = "properties"; transcriptIndex = 0; pane = "transcript"; tui.requestRender(); };
    const roomEditor = { get: () => draft, change: changed, choose: (...args: Parameters<typeof choose>) => choose(...args), text: (...args: Parameters<typeof textEditor>) => textEditor(...args), message: (value: string) => { message = value; },
      visual: (patch: (candidate: FooterPrefs, value: string) => void): ChoiceAudition => ({
        show: value => { const candidate = clonePrefs(draft); patch(candidate, value); auditionPrefs = candidate; preview(candidate); tui.requestRender(); },
        restore: () => { if (auditionPrefs) { auditionPrefs = undefined; preview(clonePrefs(draft)); tui.requestRender(); } },
      }) };
    const askControls = () => buildAskControls(roomEditor, askSelected);
    const transcriptControls = () => buildTranscriptControls(roomEditor, transcriptSelected);
    const elements = () => ([...Object.keys(ELEMENTS), "frame"] as Selection[]).filter(id => nameOf(id).toLowerCase().includes(query.toLowerCase()));
    const choose = (title: string, items: Array<{ label: string; value: string }>, value: string, accept: (value: string) => void, audition?: ChoiceAudition) => {
      restoreChoice();
      choices = { title, items, index: Math.max(0, items.findIndex(item => item.value === value)), current: value, accept, audition };
      auditionChoice();
    };
    const textEditor = (title: string, value: string, help: string, accept: (value: string) => boolean) => {
      const input = new Input({ prompt: "> " }); input.setValue(value);
      edit = { input, title, help, accept };
    };
    const colorEditor = (value: AppearanceColor | undefined, accept: (value: AppearanceColor | undefined) => void, inherit = false,
      patch?: (candidate: FooterPrefs, value: AppearanceColor | undefined) => void) => choose("Choose a color",
      [...(inherit ? [{ label: "Use normal appearance", value: "inherit" }] : []), ...Object.entries(COLORS).map(([value, label]) => ({ value, label })),
        { value: "custom", label: "More color options… (#RRGGBB)" }], value ?? "inherit", next => {
        if (next !== "custom") { changed(() => accept(next === "inherit" ? undefined : next as AppearanceColor)); return; }
        textEditor("Custom color", value?.startsWith("#") ? value : "#", "Enter six hexadecimal digits, for example #8755cc. Named colors adapt to light/dark themes.", value => {
          if (!/^#[0-9a-f]{6}$/i.test(value)) { message = "Use # followed by six digits (0–9 or a–f)."; return false; }
          changed(() => accept(value as AppearanceColor)); return true;
        });
      }, patch ? roomEditor.visual((candidate, next) => { if (next !== "custom") patch(candidate, next === "inherit" ? undefined : next as AppearanceColor); }) : undefined);
    const propertyControls = (): Control[] => inputControls({ ...roomEditor, selected, state, more, color: colorEditor, reorder,
      preview: next => { state = next; propertyIndex = 0; syncNativeSelection(true); tui.requestRender(); },
      audition: next => { auditionState = { value: next }; syncNativeSelection(true); tui.requestRender(); },
      restore: () => { auditionState = undefined; syncNativeSelection(true); tui.requestRender(); }, expand: value => { more = value; } });
    const taskProperties = (): Control[] => {
      const controls = taskControls({ get: () => draft.tasks!, change: changed, choose: (title, items, value, accept, audition) => choose(title, items, value, accept,
        title === "Demo state" ? { show: next => { demoAudition = next as FrameState; tui.requestRender(); }, restore: () => { demoAudition = undefined; tui.requestRender(); } } : audition), text: textEditor,
        visual: patch => roomEditor.visual((candidate, next) => patch(candidate.tasks!, next)),
      state: demoState, preview: next => { demoState = next; demoRevision++; tui.requestRender(); },
      replay: () => { demoRevision++; tui.requestRender(); } });
      const common = new Set(["Demo state", "Motion", "Border color", "Title position", "Title color", "Count position", "Count color", "More-work hint position", "Visible tasks", "Body text color", "Bold active task", "Active task color"]);
      return [...controls.filter(control => taskControlElement(control) === taskSelected && (taskAdvanced || common.has(control.label))),
        { label: "Advanced settings", value: taskAdvanced ? "Hide…" : "Show…", help: "More motion, color, emphasis and per-state choices. Your saved settings are unchanged until Save.", element: taskSelected, activate: () => { taskAdvanced = !taskAdvanced; taskIndex = 0; } }];
    };
    function reorder(id: ElementId, direction: number) {
      const e = design().elements[id], peers = (Object.keys(ELEMENTS) as ElementId[]).filter(k => design().elements[k].position === e.position)
        .sort((a, b) => design().elements[a].order - design().elements[b].order);
      const at = peers.indexOf(id), next = at + direction;
      if (next < 0 || next >= peers.length) { message = "Already at the end of this group."; return; }
      changed(() => { [peers[at], peers[next]] = [peers[next], peers[at]]; peers.forEach((k, i) => { design().elements[k].order = i; }); });
    }
    const workspaceControls = () => preferenceControls(roomEditor, "general", otherAdvanced, value => { otherAdvanced = value; otherIndex = 0; });
    const otherControls = () => preferenceControls(roomEditor, "other", otherAdvanced, value => { otherAdvanced = value; otherIndex = 0; },
      preferenceGroup, value => { preferenceGroup = value; otherIndex = 0; });
    const close = (save: boolean) => {
      if (closed) return;
      if (save && draft.ask !== undefined && !askStyle()) { message = "Unknown Ask settings version; Save is blocked to preserve it."; tui.requestRender(); return; }
      if (save && draft.transcript !== undefined && !transcriptStyle()) { message = "Unknown transcript settings version; Save is blocked to preserve it."; tui.requestRender(); return; }
      if (save && edit) { if (!edit.accept(edit.input.getValue())) return; edit = undefined; }
      restoreChoice(); closed = true; release(); surface?.select(selected, undefined); done(save ? clonePrefs(draft) : undefined);
    };
    const discard = () => { if (dirty()) discardConfirm = true; else close(false); };
    const undoChange = () => { const last = undo.pop(); if (last) { draft = last; message = "Last change undone"; publish(); } else message = "No changes to undo"; };
    const onAbort = () => close(false);
    release = () => { closed = true; restoreChoice(); clearHover(); pulse.stop(); demoMotion.dispose(); signal?.removeEventListener("abort", onAbort); };
    signal?.addEventListener("abort", onAbort, { once: true });
    publish();
    const component = {
      get focused() { return focused; },
      set focused(value: boolean) { focused = value; if (!value) { clearHover(); restoreChoice(); pulse.stop(); demoMotion.reset(); } else auditionChoice(); },
      invalidate() { clearHover(); restoreChoice(); pulse.stop(); demoMotion.reset(); edit?.input.invalidate(); },
      dispose() { closed = true; release(); surface?.select(selected, undefined); },
      render(width: number): string[] {
        targets = []; inputY = -1;
        if (width <= 0) return [];
        const height = Math.max(1, tui.terminal.rows), padding = width >= 6 ? 1 : 0, inner = Math.max(1, width - 2 - padding * 2), wide = width >= 92;
        const size = `${width}x${height}`;
        if (dimensions && dimensions !== size) { clearHover(); restoreChoice(); pulse.stop(); }
        dimensions = size;
        const phase = pulse.phase;
        const clip = (text: string, n = width) => truncateToWidth(text, Math.max(0, n), "…");
        const cover = (text: string) => clip(text) + " ".repeat(Math.max(0, width - visibleWidth(clip(text))));
        const buttonLine = (buttons: Array<[string, () => void]>, y: number) => {
          let line = "";
          for (const [label, action] of buttons) {
            const text = `[${label}]`;
            if (visibleWidth(line) + visibleWidth(text) > inner) break;
            targets.push({ x: visibleWidth(line) + 1, y, width: visibleWidth(text), action });
            const active = !edit && !choices && !discardConfirm && (label === "Input" && (pane === "elements" || pane === "properties") || label === "Tasks" && pane === "tasks" || label === "Ask" && pane === "ask" || label === "Transcript" && pane === "transcript" || label === "General" && pane === "workspace" || label === "More settings" && pane === "other");
            line += (active ? selectionHighlight(theme, theme.style(text, { fg: theme.colors.text, bold: true })) : theme.fg("accent", text)) + " ";
          }
          return line;
        };
        if (pane !== "tasks") demoMotion.reset();
        const shownDemo = demoAudition ?? demoState, displayPrefs = auditionPrefs ?? draft;
        const demoFrame = pane === "tasks" ? demoMotion.update({ state: shownDemo, revision: demoRevision,
          suspended: !focused || !!edit || !!choices || discardConfirm, reducedMotion: displayPrefs.motion === "off" || surface?.reducedMotion, visible: width >= 16 && height >= 12 }, displayPrefs.tasks!.presentation) : undefined;
        const inspected: Inspection | undefined = hovered ?? (pane === "tasks" ? { room: "tasks", id: taskSelected }
          : pane === "ask" ? { room: "ask", id: askSelected } : pane === "transcript" ? { room: "transcript", id: transcriptSelected }
          : pane === "workspace" ? { room: "general", id: workspaceIndex === 0 ? "identity" : "spacing" }
          : pane === "other" ? otherControls()[otherIndex]?.inspect : pane === "elements" || pane === "properties" ? inputInspection() : undefined);
        const targetPhase = !hovered && pulse.kind === "element" ? phase : undefined;
        const taskTarget = inspected?.room === "tasks" ? inspected.id : taskSelected;
        const askTarget = inspected?.room === "ask" ? inspected.id : askSelected;
        const transcriptTarget = inspected?.room === "transcript" ? inspected.id : transcriptSelected;
        const demoDock = taskDemo(shownDemo), taskBudget = Math.max(3, Math.min(8, Math.floor(height * .45)));
        const taskView = pane === "tasks" ? connectPreview(theme,
          taskPanelPreview(theme, width, demoDock, displayPrefs.tasks!, demoFrame!, taskBudget),
          taskTarget, { frameId: "frame", phase: targetPhase, related: taskTarget === "body" ? ["active"] : [] }) : undefined;
        const askView = pane === "ask" && askStyle(true) ? connectPreview(theme, questionPreview(theme, width, askStyle(true)!),
          askTarget, { frameId: "frame", phase: targetPhase }) : undefined;
        const transcriptView = pane === "transcript" && transcriptStyle(true) ? connectPreview(theme,
          transcriptPreview(theme, width, transcriptStyle(true)!, transcriptTarget.startsWith("chat") ? "chat" : "tools", draft.icons, (auditionPrefs ?? draft).density),
          transcriptTarget, { frameId: transcriptTarget.startsWith("chat") ? "chatFrame" : "toolFrame", phase: targetPhase }) : undefined;
        const generalView = pane === "workspace" ? connectPreview(theme, generalPreview(theme, width, displayPrefs),
          inspected?.room === "general" ? inspected.id : "identity", { frameId: "spacing", phase: targetPhase }) : undefined;
        const live = taskView || askView || transcriptView || generalView ? { editor: [], footer: [], hits: [], above: (taskView ?? askView ?? transcriptView ?? generalView)!.rows }
          : pane === "ask" || pane === "transcript" ? { editor: [], footer: [], hits: [], above: [] }
          : surface?.render(width, pulse.kind === "element" ? phase : undefined) ?? { editor: [], footer: [], hits: [] };
        const native = live.editor.map(row => row.replaceAll(CURSOR_MARKER, ""));
        const bottom = native.findLastIndex(row => /^[\s\u001b\[\d;m]*╰/.test(row) || row.replace(/\x1b\[[0-9;]*m/g, "").startsWith("╰"));
        let aboveRows = live.above ?? [];
        const maxPreview = Math.max(0, Math.min(native.length + live.footer.length + aboveRows.length, Math.floor(height * .45), height - 8));
        let editorRows = native, footerRows = live.footer, omitted = false;
        if (native.length + footerRows.length + aboveRows.length > maxPreview && maxPreview >= 3) {
          aboveRows = aboveRows.slice(0, Math.max(0, maxPreview - (native.length ? 3 : 0)));
          const editorMax = Math.max(3, maxPreview - aboveRows.length - Math.min(footerRows.length, 2));
          editorRows = native.length > editorMax ? [...native.slice(0, editorMax - 1), native[bottom >= 0 ? bottom : native.length - 1]] : native;
          footerRows = footerRows.slice(0, Math.max(0, maxPreview - editorRows.length - aboveRows.length)); omitted = true;
        }
        if (height < 12) { editorRows = []; footerRows = []; aboveRows = []; }
        const previewHeight = aboveRows.length + editorRows.length + footerRows.length;
        const contentRows = choices ? choices.items.length + 1 : pane === "tasks" ? Math.max(TASK_ELEMENTS.length, taskProperties().length)
          : pane === "ask" ? Math.max(askElements.length, askControls().length)
          : pane === "transcript" ? Math.max(transcriptElements.length, transcriptControls().length)
          : pane === "workspace" ? workspaceControls().length : pane === "other" ? otherControls().length
          : Math.max(elements().length, propertyControls().length);
        const desiredHeight = Math.max(5, Math.min(choices ? 26 : wide ? 20 : 18, height - previewHeight - 1, Math.max(8, contentRows + 9)));
        const controlsHeight = choices?.geometry?.size === size ? choices.geometry.height : desiredHeight;
        if (choices && choices.geometry?.size !== size) choices.geometry = { size, height: controlsHeight };
        // Audition may change preview height. Keep pointer targets stationary;
        // shorten the example rather than moving controls under the pointer.
        const availablePreview = Math.max(0, height - controlsHeight - 1);
        if (previewHeight > availablePreview) {
          if (native.length) {
            const editorMax = Math.min(editorRows.length, Math.max(0, availablePreview - Math.min(footerRows.length, 2)));
            editorRows = editorMax >= 3 ? [...editorRows.slice(0, editorMax - 1), editorRows.at(-1)!] : [];
            footerRows = footerRows.slice(0, Math.max(0, availablePreview - editorRows.length));
          } else aboveRows = aboveRows.slice(0, availablePreview);
          omitted = true;
        }
        const rows: string[] = [];
        const room = rooms.find(item => item.value === sectionOf(pane))!;
        const fullNavigationWidth = visibleWidth(rooms.map(item => `[${item.label}]`).join(" "));
        rows.push(fullNavigationWidth <= inner
          ? buttonLine(rooms.map(item => [item.label, () => { pane = item.value as typeof pane; }]), 1)
          : buttonLine([["Rooms…", chooseRoom]], 1) + theme.fg("muted", clip(` ${room.label}`, Math.max(0, inner - 9))));
        const section = sectionOf(pane), sectionNumber = SECTIONS.indexOf(section) + 1;
        if (controlsHeight >= 10) rows.push(theme.fg("muted", clip(edit ? "Enter previews this text · Esc cancels" : choices ? choices.audition ? "Hover or ↑↓ to preview · Enter keeps choice · Esc cancels" : "↑↓ choose · Enter keeps choice · Esc cancels" : width < 80 ? `${sectionNumber}/6 ${rooms.find(item => item.value === section)!.label} · Ctrl+R rooms · Tab next` : `${section === "elements" ? pane === "properties" ? "Input settings" : "Input items" : section === "other" ? "More settings" : section} · ↑↓ choose · Tab next · Shift+Tab back · Enter opens`, inner)));
        const capacity = Math.max(1, controlsHeight - 9);
        const scrollCapacity = Math.max(1, capacity - 1);
        const helpLines: string[] = [];
        const addControl = (control: Control, row: number, x: number, cells: number, active: boolean) => {
          cells = Math.min(cells, 90);
          const inspect: Inspection | undefined = control.inspect ?? (pane === "tasks" ? { room: "tasks", id: taskControlElement(control) }
            : pane === "ask" ? { room: "ask", id: askSelected } : pane === "transcript" ? { room: "transcript", id: transcriptSelected }
            : pane === "properties" || pane === "elements" ? { room: "input", id: selected } : undefined);
          targets.push({ x, y: row, width: cells, inspect, help: control.help, action: () => {
            if (control.readonly) { message = control.help; return; }
            if (pane === "tasks") { taskIndex = Math.max(0, taskProperties().findIndex(c => c.label === control.label)); taskSelected = taskControlElement(control); taskFocus = "properties"; }
            else if (pane === "ask") { askIndex = Math.max(0, askControls().findIndex(c => c.label === control.label)); askFocus = "properties"; }
            else if (pane === "transcript") { transcriptIndex = Math.max(0, transcriptControls().findIndex(c => c.label === control.label)); transcriptFocus = "properties"; }
            else if (pane === "workspace") workspaceIndex = Math.max(0, workspaceControls().findIndex(c => c.label === control.label));
            else if (pane !== "other") { pane = "properties"; propertyIndex = Math.max(0, propertyControls().findIndex(c => c.label === control.label)); }
            else otherIndex = Math.max(0, otherControls().findIndex(c => c.label === control.label));
            control.activate();
          } });
          return settingRow(theme, control, cells, { focused: active && focused, phase: active && pulse.kind === "focus" ? phase : undefined });
        };
        const listWidth = wide ? Math.min(30, Math.floor(inner * .3)) : inner;
        const propertyWidth = Math.max(0, Math.min(90, inner - listWidth - 3));
        const roomRows = <Id extends string>(parts: ReadonlyArray<{ id: Id; name: string; help: string }>, id: Id, partFocus: boolean,
          controls: Control[], index: number, selectPart: (id: Id) => void, inspectPart: (id: Id) => Inspection, pinned = false) => {
          const listIndex = Math.max(0, parts.findIndex(item => item.id === id));
          const listStart = Math.max(0, listIndex - Math.floor(capacity / 2));
          const available = Math.max(1, capacity - (pinned ? 1 : 0));
          const controlStart = Math.max(0, Math.min(index, controls.length - 1 - (pinned ? 1 : 0)) - Math.floor(available / 2));
          rows.push(wide ? theme.fg("muted", "  Part".padEnd(listWidth)) + theme.fg("dim", " │ ") + settingHeading(theme, propertyWidth)
            : theme.fg("muted", partFocus ? "Part" : "Setting / value"));
          for (let n = 0; n < capacity; n++) {
            let left = "", right = "";
            const item = parts[listStart + n];
            if (item && (wide || partFocus)) {
              left = selectionRow(theme, partName(item.name), listWidth, { selected: item.id === id,
                focused: focused && partFocus && item.id === id, phase: item.id === id && pulse.kind === "element" ? phase : undefined });
              targets.push({ x: 1, y: rows.length + 1, width: listWidth, inspect: inspectPart(item.id), help: item.help, action: () => selectPart(item.id) });
            }
            const at = pinned && n === capacity - 1 ? controls.length - 1 : controlStart + n;
            const control = n < available || pinned && n === capacity - 1 ? controls[at] : undefined;
            if (control && (!pinned || at < controls.length - 1 || n === capacity - 1) && (wide || !partFocus))
              right = addControl(control, rows.length + 1, wide ? listWidth + 4 : 1, wide ? propertyWidth : inner, !partFocus && at === index);
            rows.push(wide ? left + " ".repeat(Math.max(0, listWidth - visibleWidth(left))) + theme.fg("dim", " │ ") + right : partFocus ? left : right);
          }
          helpLines.push(partFocus ? parts[listIndex]?.help : controls[index]?.help);
        };

        if (discardConfirm) {
          rows.push("Discard all unsaved changes?");
          rows.push(buttonLine([["Keep editing", () => { discardConfirm = false; }], ["Discard changes", () => close(false)]], rows.length + 1));
          helpLines.push("Saved settings and your draft will not be changed. Enter discards; Esc keeps editing.");
        } else if (edit) {
          rows.push(theme.fg("accent", edit.title)); inputY = rows.length + 1; inputX = 1 + padding; inputWidth = inner;
          edit.input.focused = component.focused;
          rows.push(edit.input.render(inner)[0]); helpLines.push(edit.help);
        } else if (choices) {
          rows.push(theme.fg("accent", choices.title));
          const start = Math.max(0, choices.index - Math.floor((capacity - 1) / 2));
          for (let i = start; i < Math.min(choices.items.length, start + Math.max(1, capacity - 1)); i++) {
            const item = choices.items[i];
            targets.push({ x: 1, y: rows.length + 1, width: inner, choice: i, action: () => { const accept = choices!.accept; restoreChoice(); choices = undefined; accept(item.value); } });
            const swatch = validColor(item.value) ? theme.style("■ ", { fg: appearanceColor(theme, item.value) }) : "";
            const row = selectionRow(theme, `${swatch}${settingValue(item.label)}${item.value === choices.current ? "  ✓" : ""}`, inner,
              { selected: item.value === choices.current, focused: focused && i === choices.index, phase: choiceHover === undefined && i === choices.index ? phase : undefined });
            rows.push(i === choiceHover ? selectionHighlight(theme, row) : row);
          }
          helpLines.push(`${choiceHover === undefined ? "" : "Hover preview · "}${(choiceHover ?? choices.index) + 1} of ${choices.items.length} · ✓ current value · ${choices.audition ? "Enter keeps the keyboard choice; click keeps the hovered choice" : "Enter keeps choice"}`);
        } else if (pane === "tasks") {
          const controls = taskProperties(); taskIndex = Math.min(taskIndex, controls.length - 1);
          roomRows(TASK_ELEMENTS, taskSelected, taskFocus === "elements", controls, taskIndex, selectTask, id => ({ room: "tasks", id }), true);
        } else if (pane === "ask") {
          const controls = askControls(); askIndex = Math.min(askIndex, controls.length - 1);
          roomRows(askElements, askSelected, askFocus === "elements", controls, askIndex, selectAsk, id => ({ room: "ask", id }));
        } else if (pane === "transcript") {
          const controls = transcriptControls(); transcriptIndex = Math.min(transcriptIndex, controls.length - 1);
          roomRows(transcriptElements, transcriptSelected, transcriptFocus === "elements", controls, transcriptIndex, selectTranscript, id => ({ room: "transcript", id }));
        } else if (pane === "workspace") {
          rows.push(settingHeading(theme, Math.min(inner, 90)));
          const controls = workspaceControls(); workspaceIndex = Math.min(workspaceIndex, controls.length - 1);
          for (const [index, control] of controls.entries()) rows.push(addControl(control, rows.length + 1, 1, inner, index === workspaceIndex));
          helpLines.push(controls[workspaceIndex].help);
        } else if (pane === "other") {
          rows.push(settingHeading(theme, Math.min(inner, 90)));
          const controls = otherControls(); otherIndex = Math.min(otherIndex, controls.length - 1);
          const start = Math.max(0, Math.min(otherIndex, controls.length - 2) - Math.floor(scrollCapacity / 2));
          for (let i = start; i < Math.min(controls.length - 1, start + scrollCapacity); i++) rows.push(addControl(controls[i], rows.length + 1, 1, inner, i === otherIndex));
          rows.push(addControl(controls.at(-1)!, rows.length + 1, 1, inner, otherIndex === controls.length - 1));
          helpLines.push(controls[otherIndex].help);
        } else {
          const controls = propertyControls(); propertyIndex = Math.min(propertyIndex, controls.length - 1);
          roomRows(elements().map(id => ({ id, name: nameOf(id) + (id !== "frame" && !design().elements[id].visible ? " · Off" : ""), help: INFO[id] })),
            selected, pane === "elements", controls, propertyIndex, select, id => ({ room: "input", id }));
        }
        let missing = "", targetName = "", location = "";
        if (inspected?.room === "input") {
          const id = inspected.id;
          targetName = nameOf(id); location = id === "frame" ? "Input perimeter" : POSITIONS[displayPrefs.appearance!.elements[id].position];
          if (id !== "frame" && !displayPrefs.appearance!.elements[id].visible) missing = "Off: hidden by this setting. It remains available in the list.";
          else if (id !== "frame" && !live.hits.some(hit => hit.id === id)) missing = `Not visible now. ${INFO[id]}`;
        } else if (inspected?.room === "general") {
          targetName = inspected.id === "identity" ? "Your name" : "Spacing"; location = inspected.id === "identity" ? "User message header" : "Sample message spacing";
          if (!generalView?.hits.some(hit => hit.id === inspected.id && hit.y < aboveRows.length)) missing = "Not visible now: enlarge the terminal to see this example.";
        } else if (inspected) {
          const { room, id } = inspected;
          const view = room === "tasks" ? taskView : room === "ask" ? askView : transcriptView;
          targetName = room === "tasks" ? TASK_ELEMENTS.find(item => item.id === id)!.name
            : room === "ask" ? askElements.find(item => item.id === id)!.name : transcriptElements.find(item => item.id === id)!.name;
          location = room === "tasks" ? friendlyValue(id === "title" || id === "summary" || id === "hint" ? displayPrefs.tasks!.presentation.positions[id] : id === "frame" ? "Overview perimeter" : "Overview rows")
            : room === "ask" ? friendlyValue(id === "title" ? askStyle(true)?.titlePosition ?? "Upper rail" : id === "progress" ? askStyle(true)?.progressPosition ?? "Lower rail" : id === "frame" ? "Question perimeter" : "Question body")
            : id.endsWith("Frame") ? "Sample perimeters" : id === "chatSent" ? friendlyValue(transcriptStyle(true)?.chat.sentPosition ?? "Lower rail") : id === "chatIdentity" ? "Assistant identity" : id === "toolStatus" ? "Successful sample status" : "Sample upper rails";
          if (!view) missing = "Preview unavailable: saved settings use an unsupported version.";
          else if (!view.hits.some(hit => (hit.id === id || room === "tasks" && id === "body" && hit.id === "active") && hit.y < aboveRows.length)) {
            missing = room === "transcript" && id === "chatSent" && !transcriptStyle(true)?.chat.showSent ? "Off: sourced Sent time is hidden by this setting."
              : room === "tasks" && id === "active" && !demoDock.overview?.activeId ? "No active row in this example state. Choose a working or waiting demo."
              : "Not visible now: the sample is shortened or this element does not fit. Use the list or enlarge the terminal.";
          }
        }
        if (targetName && !discardConfirm) rows.push(theme.fg("muted", clip(`${hovered ? "Inspecting" : inspected?.room === "input" && inspected.id !== selected ? "Affects" : "Selected"}: ${targetName} · ${location}`, inner)));
        const explanation = message || (!edit && !choices && !discardConfirm && missing ? missing : hoverHelp || helpLines[0]) || "Save keeps your changes. Discard restores the saved appearance.";
        for (const line of wrapTextWithAnsi(explanation, Math.min(inner, 88)).slice(0, 2)) rows.push(theme.fg("muted", line));
        rows.splice(Math.max(0, controlsHeight - 3));
        targets = targets.filter(target => target.y <= rows.length);
        while (rows.length < controlsHeight - 3) rows.push("");
        rows.push(buttonLine([["Undo", undoChange], ["Discard", discard], ["Save", () => close(true)]], rows.length + 1) + theme.fg("dim", " Ctrl+S save · Esc back"));
        const panel = frameRows({ theme, width, rows: rows.map(row => " ".repeat(padding) + row), color: theme.colors.accent,
          corners: { topLeft: theme.fg("accent", pane === "tasks" ? ` Egregore · Tasks · ${TASK_ELEMENTS.find(item => item.id === taskSelected)?.name} `
            : pane === "ask" ? ` Egregore · Ask · ${askElements.find(item => item.id === askSelected)?.name} `
            : pane === "transcript" ? ` Egregore · Transcript · ${transcriptElements.find(item => item.id === transcriptSelected)?.name} `
            : pane === "workspace" ? " Egregore · General " : pane === "other" ? " Egregore · More settings "
            : pane === "properties" ? ` Egregore · Input & footer · ${nameOf(selected)} ` : " Egregore · Input & footer "),
            topRight: theme.fg(dirty() ? "warning" : "muted", dirty() ? " Unsaved changes " : " Saved settings ") } });
        for (const target of targets) target.x += padding;
        while (panel.length < controlsHeight) panel.push(cover(""));
        const shownState = previewState();
        const previewLabel = shownState ? `Your live input · previewing ${STATES[shownState]} appearance${auditionState ? " · hover or keyboard preview" : ""}` : "Your live input · appearance preview";
        const sampleNote = height < 12 ? " · enlarge terminal for preview" : omitted ? " · shortened vertically" : "";
        const label = pane === "tasks" ? `Example Tasks · no real task changes · ${shownDemo}${demoAudition ? " · hover or keyboard preview" : ""}${sampleNote}`
          : pane === "ask" ? `Example question · no real answer changes${!askView ? " · Ask settings unavailable or newer version" : sampleNote}`
          : pane === "workspace" ? `Example messages · nothing is sent${sampleNote}`
          : pane === "transcript" ? `Example messages · nothing is sent${!transcriptView ? " · transcript settings unavailable or newer version" : sampleNote}`
          : !native.length ? "Native input preview unavailable; settings still support Save / Discard"
          : height < 12 ? "Enlarge the terminal to see your input preview" : previewLabel + (omitted ? " · shortened vertically" : surface?.temporary ? " · temporary Composer view" : "");
        const previewTop = panel.length + 1 + aboveRows.length;
        const lines = [...panel, theme.fg("muted", clip(label)), ...aboveRows, ...editorRows, ...footerRows];
        const previewBottom = editorRows.findLastIndex(line => line.replace(/\x1b\[[0-9;]*m/g, "").startsWith("╰"));
        const footerPositions = ["footer1", "footer2"].filter(prefix => live.hits.some(hit => hit.position.startsWith(prefix)));
        if (generalView && aboveRows.length && height >= 12) {
          const top = panel.length + 1;
          for (const hit of generalView.hits) if (hit.y < aboveRows.length && (hit.id === "identity" || hit.id === "spacing")) {
            const id = hit.id;
            targets.push({ x: hit.x, y: top + hit.y, width: hit.width, inspect: { room: "general", id },
              action: () => { workspaceIndex = id === "identity" ? 0 : 1; tui.requestRender(); } });
          }
        }
        if (taskView && aboveRows.length && height >= 12) {
          const top = panel.length + 1;
          for (const hit of taskView.hits) if (hit.y < aboveRows.length) {
            targets.push({ x: hit.x, y: top + hit.y, width: hit.width, inspect: { room: "tasks", id: hit.id as TaskElementId }, action: () => selectTask(hit.id as TaskElementId) });
          }
        }
        if (transcriptView && aboveRows.length && height >= 12) {
          const top = panel.length + 1;
          for (const hit of transcriptView.hits) if (hit.y < aboveRows.length) {
            targets.push({ x: hit.x, y: top + hit.y, width: hit.width, inspect: { room: "transcript", id: hit.id as TranscriptElementId }, action: () => selectTranscript(hit.id as TranscriptElementId) });
          }
        }
        if (askView && aboveRows.length && height >= 12) {
          const top = panel.length + 1;
          for (const hit of askView.hits) if (hit.y < aboveRows.length) targets.push({ x: hit.x, y: top + hit.y, width: hit.width, inspect: { room: "ask", id: hit.id as AskElementId }, action: () => selectAsk(hit.id as AskElementId) });
        }
        for (const hit of live.hits) {
          const y = hit.position.startsWith("top") ? previewTop : hit.position.startsWith("bottom") ? previewTop + previewBottom
            : previewTop + editorRows.length + footerPositions.indexOf(hit.position.startsWith("footer1") ? "footer1" : "footer2");
          if (y >= previewTop && y < lines.length) targets.push({ x: hit.x, y, width: hit.width, inspect: { room: "input", id: hit.id }, action: () => select(hit.id) });
        }
        if (editorRows.length) for (const y of [previewTop, previewTop + previewBottom]) if (y >= previewTop) {
          // Label hit targets precede the general frame target.
          targets.push({ x: 0, y, width, inspect: { room: "input", id: "frame" }, action: () => select("frame") });
        }
        while (lines.length < height) lines.push("");
        return lines.slice(0, height).map(cover);
      },
      handleInput(data: string) {
        if (closed || !focused) return;
        const before = focusKey(), previous = selected, previousTask = taskSelected, previousAsk = askSelected, previousTranscript = transcriptSelected;
        clearHover(); message = "";
        if (matchesKey(data, Key.ctrl("s")) && !discardConfirm) close(true);
        else if (discardConfirm) {
          if (matchesKey(data, Key.escape)) discardConfirm = false;
          else if (matchesKey(data, Key.enter)) close(false);
        } else if (edit) {
          if (matchesKey(data, Key.escape)) edit = undefined;
          else if (matchesKey(data, Key.enter)) { if (edit.accept(edit.input.getValue())) edit = undefined; }
          else edit.input.handleInput(data);
        } else if (choices) {
          if (matchesKey(data, Key.escape)) { restoreChoice(); choices = undefined; }
          else if (matchesKey(data, Key.up)) { choices.index = Math.max(0, choices.index - 1); auditionChoice(); }
          else if (matchesKey(data, Key.down)) { choices.index = Math.min(choices.items.length - 1, choices.index + 1); auditionChoice(); }
          else if (matchesKey(data, Key.enter)) { const { accept, items, index } = choices; restoreChoice(); choices = undefined; accept(items[index].value); }
        } else if (matchesKey(data, Key.ctrl("s"))) close(true);
        else if (matchesKey(data, Key.ctrl("z"))) undoChange();
        else if (matchesKey(data, Key.ctrl("r"))) chooseRoom();
        else if (matchesKey(data, Key.escape)) { if (pane !== "elements") pane = "elements"; else discard(); }
        else if (data === "/") textEditor("Find an element", query, "Search by name, including elements that are off.", value => {
          query = safeText(value); pane = "elements"; elementIndex = 0;
          if (elements()[0]) { selected = elements()[0]; surface?.select(selected, state); }
          return true;
        });
        else if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift(Key.tab))) {
          const index = SECTIONS.indexOf(sectionOf(pane));
          pane = SECTIONS[(index + (matchesKey(data, Key.tab) ? 1 : SECTIONS.length - 1)) % SECTIONS.length];
        }
        else if (pane === "transcript" && matchesKey(data, Key.left)) transcriptFocus = "elements";
        else if (pane === "transcript" && matchesKey(data, Key.right)) transcriptFocus = "properties";
        else if (pane === "ask" && matchesKey(data, Key.left)) askFocus = "elements";
        else if (pane === "ask" && matchesKey(data, Key.right)) askFocus = "properties";
        else if (pane === "elements" && matchesKey(data, Key.right)) pane = "properties";
        else if (pane === "properties" && matchesKey(data, Key.left)) pane = "elements";
        else if (pane === "tasks" && matchesKey(data, Key.left)) taskFocus = "elements";
        else if (pane === "tasks" && matchesKey(data, Key.right)) selectTask(taskSelected);
        else if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
          const delta = matchesKey(data, Key.up) ? -1 : 1;
          if (pane === "elements") { const ids = elements(); elementIndex = Math.max(0, Math.min(ids.length - 1, elementIndex + delta)); if (ids[elementIndex]) { selected = ids[elementIndex]; propertyIndex = 0; surface?.select(selected, state); } }
          else if (pane === "properties") propertyIndex = Math.max(0, Math.min(propertyControls().length - 1, propertyIndex + delta));
          else if (pane === "transcript" && transcriptFocus === "elements") {
            transcriptSelected = transcriptElements[Math.max(0, Math.min(transcriptElements.length - 1, transcriptElements.findIndex(item => item.id === transcriptSelected) + delta))].id;
            transcriptIndex = 0;
          } else if (pane === "transcript") transcriptIndex = Math.max(0, Math.min(transcriptControls().length - 1, transcriptIndex + delta));
          else if (pane === "ask" && askFocus === "elements") {
            askSelected = askElements[Math.max(0, Math.min(askElements.length - 1, askElements.findIndex(item => item.id === askSelected) + delta))].id;
            askIndex = 0;
          } else if (pane === "ask") askIndex = Math.max(0, Math.min(askControls().length - 1, askIndex + delta));
          else if (pane === "tasks" && taskFocus === "elements") {
            taskSelected = TASK_ELEMENTS[Math.max(0, Math.min(TASK_ELEMENTS.length - 1, TASK_ELEMENTS.findIndex(item => item.id === taskSelected) + delta))].id;
          } else if (pane === "tasks") {
            taskIndex = Math.max(0, Math.min(taskProperties().length - 1, taskIndex + delta));
            taskSelected = taskControlElement(taskProperties()[taskIndex]);
          } else if (pane === "workspace") workspaceIndex = Math.max(0, Math.min(workspaceControls().length - 1, workspaceIndex + delta));
          else otherIndex = Math.max(0, Math.min(otherControls().length - 1, otherIndex + delta));
        } else if (matchesKey(data, Key.enter) || data === " ") {
          if (pane === "elements") pane = "properties";
          else if (pane === "properties") propertyControls()[propertyIndex]?.activate();
          else if (pane === "transcript" && transcriptFocus === "elements") selectTranscript(transcriptSelected);
          else if (pane === "transcript") { const control = transcriptControls()[transcriptIndex]; if (control?.readonly) message = control.help; else control?.activate(); }
          else if (pane === "ask" && askFocus === "elements") selectAsk(askSelected);
          else if (pane === "ask") { const control = askControls()[askIndex]; if (control?.readonly) message = control.help; else control?.activate(); }
          else if (pane === "tasks" && taskFocus === "elements") selectTask(taskSelected);
          else if (pane === "tasks") taskProperties()[taskIndex]?.activate();
          else if (pane === "workspace") workspaceControls()[workspaceIndex]?.activate();
          else otherControls()[otherIndex]?.activate();
        }
        afterInteraction(before, previous, previousTask, previousAsk, previousTranscript);
      },
      handleMouse(event: TuiMouseEvent) {
        if (closed || !focused) return { handled: true };
        if (event.type === "move" && event.button === "none") {
          if (choices) {
            const index = targets.find(target => target.choice !== undefined && target.y === event.y && event.x >= target.x && event.x < target.x + target.width)?.choice;
            if (index === choiceHover) return { handled: true, render: false };
            restoreChoice(); choiceHover = index;
            auditionChoice();
            pulse.stop(); tui.requestRender(); return { handled: true, render: true };
          }
          const target = !edit && !choices && !discardConfirm ? targets.find(target => target.y === event.y && event.x >= target.x && event.x < target.x + target.width) : undefined;
          const next = target?.inspect, key = target ? `${target.x}:${target.y}:${target.width}` : "";
          if (key === hoverKey) return { handled: true, render: false };
          clearHover(); hovered = next; hoverKey = key; hoverHelp = target?.help ?? ""; pulse.stop();
          syncNativeSelection();
          tui.requestRender(); return { handled: true, render: true };
        }
        if (event.type === "wheel") { component.handleInput(event.wheelDelta! < 0 ? "\x1b[A" : "\x1b[B"); return { handled: true, render: true }; }
        if (edit && event.y === inputY) return edit.input.handleMouse({ ...event, x: event.x - inputX, y: 0, width: inputWidth, height: 1 });
        if (event.type === "click" && event.button === "left") {
          const before = focusKey(), previous = selected, previousTask = taskSelected, previousAsk = askSelected, previousTranscript = transcriptSelected;
          targets.find(target => target.y === event.y && event.x >= target.x && event.x < target.x + target.width)?.action();
          afterInteraction(before, previous, previousTask, previousAsk, previousTranscript);
        }
        return { handled: true, render: true };
      },
    };
    if (signal?.aborted) onAbort();
    return component;
  }, { overlay: true, overlayOptions: { anchor: "top-left", width: "100%", maxHeight: "100%", row: 0, col: 0 } }); }
  finally { release(); }
}
