import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, Input, Key, matchesKey, truncateToWidth, visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { frameRows, createFrameController, type FrameState } from "../../lib/frame.ts";
import { taskPanelDefaults, taskPanelPreview, taskDemo, type TaskElementId } from "./task-presentation.ts";
import { taskControls, taskControlElement, TASK_ELEMENTS } from "./task-settings.ts";
import { readAskAppearance, safeAskTitle, type AskAppearance } from "../../packages/pi-ask/extensions/ask-user-question/appearance.ts";
import { questionPreview, type AskElementId } from "../../packages/pi-ask/extensions/ask-user-question/question-preview.ts";
import { readTranscript, transcriptPreview, type TranscriptAppearance, type TranscriptElementId } from "./transcript-presentation.ts";
import { OPTIONS, type FooterPrefs, type FooterOption } from "./footer-state.ts";
import { ELEMENTS, POSITIONS, STATES, STATE_TEXT, COLORS, appearanceDefaults, clonePrefs, safeText, validColor,
  type ElementId, type AppearanceState, type AppearanceColor, type AppearanceHit } from "./appearance.ts";
import { appearanceColor } from "./appearance-render.ts";
import { LABELS, DESCRIPTIONS } from "./footer-option-info.ts";
import { SelectionPulse, selectionHighlight, selectionRow } from "./footer-selection.ts";

export interface FooterPreview {
  render(width: number, shimmer?: number): { editor: string[]; footer: string[]; above?: string[]; hits: AppearanceHit[] };
  select(selected: ElementId | "frame", state?: AppearanceState): void;
  temporary?: boolean;
  reducedMotion?: boolean;
}
type Selection = ElementId | "frame";
interface Control { label: string; value: string; help: string; activate(): void }
interface Target { x: number; y: number; width: number; action(): void }
// Visibility/position now have one authority: the element inspector. Keep the
// other existing capabilities, rather than exposing duplicate switches that do nothing.
const REPLACED = new Set<FooterOption>(["layout", "topOrder", "bottomOrder", "session", "model", "thinking", "railTitle", "railDetails", "railHint", "composerContext", "questionLabels", "messageTime", "toolLabels"]);
export const OTHER_OPTIONS: FooterOption[] = ["selectionShimmer", ...(Object.keys(OPTIONS) as FooterOption[]).filter(id => id !== "selectionShimmer" && !REPLACED.has(id))];
const INFO: Record<Selection, string> = {
  frame: "The border around your input. Its color can stay the same or change with the assistant's state.",
  status: "What the assistant is doing. Preview another state to customize its text and colors without starting a run.",
  session: "Your current chat name. Long names shorten to fit.", sentTime: "The latest recorded user-message send time. Hidden until you send a message; never a live clock.",
  directory: "The current working directory.", vim: "Your native Vim mode, when a Vim editor is installed. It is absent otherwise.",
  model: "The current model's display name.", thinking: "The selected thinking level; this setting does not change how the model thinks.",
  context: "Context capacity used, not task progress. Unknown usage shows —. Off means absent from the preview.",
  git: "Local Git state. Hidden outside a repository; never performs a network fetch.",
  hint: "A display-only next step from your active task, before the first message. Hidden when there is no sourced hint.",
};
const nameOf = (id: Selection) => id === "frame" ? "Input box border" : ELEMENTS[id];
const colorName = (value: AppearanceColor | undefined) => value ? COLORS[value as keyof typeof COLORS] ?? value : "Use normal appearance";

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
    let selected: Selection = "status", state: AppearanceState | undefined, pane: "elements" | "properties" | "other" | "tasks" | "ask" | "transcript" = "elements";
    let elementIndex = 0, propertyIndex = 0, otherIndex = 0, more = false, query = "", message = "";
    let targets: Target[] = [], inputY = -1, inputX = 0, inputWidth = 0;
    let edit: { input: Input; title: string; help: string; accept(value: string): boolean } | undefined;
    let choices: { title: string; items: Array<{ label: string; value: string }>; index: number; current: string; accept(value: string): void } | undefined;
    let discardConfirm = false, closed = false, focused = true, dimensions = "";
    let taskIndex = 0, taskSelected: TaskElementId = "frame", taskFocus: "elements" | "properties" = "properties";
    const askElements: Array<{ id: AskElementId; name: string; help: string }> = [
      { id: "frame", name: "Question frame", help: "Orange identifies the question surface; its border is not an error state." },
      { id: "title", name: "Question title", help: "Display label only; question and answer content stays unchanged." },
      { id: "progress", name: "Question progress", help: "A sourced position in a batch; this demo shows a sample number only." },
      { id: "body", name: "Question text", help: "Only emphasis changes; wording and answer semantics stay with Ask." },
      { id: "hint", name: "Action hints", help: "Keys and actions stay unchanged; only text tone changes." },
    ];
    let askSelected: AskElementId = "title", askIndex = 0, askFocus: "elements" | "properties" = "properties";
    const transcriptElements: Array<{ id: TranscriptElementId; name: string; help: string }> = [
      { id: "chatFrame", name: "Chat frame", help: "User stays red; assistant stays accent purple. Native message content remains untouched." },
      { id: "chatIdentity", name: "Chat identity", help: "User identity stays red. Assistant identity may match or quiet its purple rail." },
      { id: "chatSent", name: "Sourced Sent time", help: "Only a reliably recorded creation time can appear; no reply-completion time is implied." },
      { id: "toolFrame", name: "Tool frame", help: "Only supported native/allowlisted tools use this look; self-renderers retain their own UI." },
      { id: "toolIdentity", name: "Tool identity", help: "Change secondary rail emphasis, not the tool name, result or expansion behavior." },
      { id: "toolStatus", name: "Tool status", help: "Failure and cancellation always keep their distinct semantic colors and words." },
    ];
    let transcriptSelected: TranscriptElementId = "chatIdentity", transcriptIndex = 0, transcriptFocus: "elements" | "properties" = "properties";
    let demoState: FrameState = "working", demoRevision = 0;
    const demoMotion = createFrameController({ automatic: true, requestRender: () => {
      if (!closed && focused && pane === "tasks") tui.requestRender(); else demoMotion.reset();
    } });
    const pulse = new SelectionPulse(() => {
      if (closed || !focused || edit || discardConfirm || draft.selectionShimmer === "off") { pulse.stop(); return; }
      tui.requestRender();
    });
    const focusKey = () => choices ? `choice:${choices.title}:${choices.index}` : `${pane}:${pane === "tasks" ? `${taskSelected}:${taskFocus}:${taskIndex}` : pane === "ask" ? `${askSelected}:${askFocus}:${askIndex}` : pane === "transcript" ? `${transcriptSelected}:${transcriptFocus}:${transcriptIndex}` : `${selected}:${pane === "properties" ? propertyIndex : pane === "other" ? otherIndex : elementIndex}`}`;
    const afterInteraction = (before: string, previous: Selection, previousTask: TaskElementId, previousAsk: AskElementId, previousTranscript: TranscriptElementId) => {
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
    const publish = () => { preview(clonePrefs(draft)); surface?.select(selected, state); tui.requestRender(); };
    const select = (id: Selection) => {
      selected = id; propertyIndex = 0; pane = "properties"; query = "";
      elementIndex = elements().indexOf(id); surface?.select(id, state); tui.requestRender();
    };
    const selectTask = (id: TaskElementId) => {
      taskSelected = id; pane = "tasks"; taskFocus = "properties";
      const controls = taskProperties(), preferred = TASK_ELEMENTS.find(item => item.id === id)?.control;
      taskIndex = Math.max(0, controls.findIndex(control => control.label === preferred));
      tui.requestRender();
    };
    const selectAsk = (id: AskElementId) => { askSelected = id; askFocus = "properties"; askIndex = 0; pane = "ask"; tui.requestRender(); };
    const askStyle = () => readAskAppearance(draft.ask, draft.questionLabels);
    const transcriptStyle = () => readTranscript(draft.transcript, draft);
    const selectTranscript = (id: TranscriptElementId) => { transcriptSelected = id; transcriptFocus = "properties"; transcriptIndex = 0; pane = "transcript"; tui.requestRender(); };
    const transcriptControls = (): Control[] => {
      const style = transcriptStyle();
      if (!style) return [{ label: "Transcript settings unavailable", value: "Read-only", help: "Unknown version; preserve the saved value.", activate() {} }];
      const change = (patch: Partial<TranscriptAppearance>) => changed(() => { draft.transcript = { ...style, ...patch }; });
      if (transcriptSelected === "chatSent") return [
        { label: "Show sourced Sent time", value: style.chat.showSent ? "On" : "Off", help: "Unsourced times stay hidden even when On.", activate: () => change({ chat: { ...style.chat, showSent: !style.chat.showSent } }) },
        { label: "Sent position", value: style.chat.sentPosition, help: "Move recorded creation time along the lower rail.", activate: () => choose("Sent position", ["bottomLeft", "bottomRight"].map(value => ({ value, label: value })), style.chat.sentPosition, value => change({ chat: { ...style.chat, sentPosition: value as TranscriptAppearance["chat"]["sentPosition"] } })) },
      ];
      if (transcriptSelected === "chatIdentity") return [{ label: "Assistant identity", value: style.chat.assistantLabel, help: "The user frame and user identity remain red.", activate: () => choose("Assistant identity tone", ["matched", "quiet"].map(value => ({ value, label: value })), style.chat.assistantLabel, value => change({ chat: { ...style.chat, assistantLabel: value as TranscriptAppearance["chat"]["assistantLabel"] } })) }];
      if (transcriptSelected === "toolIdentity") return [{ label: "Tool identity", value: style.tools.identity, help: "Applies to eligible ordinary, grouped and web tool rails only.", activate: () => choose("Tool identity tone", ["matched", "quiet"].map(value => ({ value, label: value })), style.tools.identity, value => change({ tools: { ...style.tools, identity: value as TranscriptAppearance["tools"]["identity"] } })) }];
      if (transcriptSelected === "toolStatus") return [{ label: "Successful status tone", value: style.tools.status, help: "Failed, cancelled and child-error states always use semantic status color.", activate: () => choose("Successful status tone", ["semantic", "matched"].map(value => ({ value, label: value })), style.tools.status, value => change({ tools: { ...style.tools, status: value as TranscriptAppearance["tools"]["status"] } })) }];
      return [{ label: "Frame identity", value: transcriptSelected === "chatFrame" ? "User red · assistant purple" : "Sourced tool state", help: "Fixed semantic identity; native fallbacks remain in effect.", activate() {} }];
    };
    const askControls = (): Control[] => {
      const style = askStyle();
      if (!style) return [{ label: "Ask settings unavailable", value: "Read-only", help: "Unknown Ask settings version. Preserve the saved value; no automatic migration.", activate() {} }];
      const change = (patch: Partial<AskAppearance>) => changed(() => { draft.ask = { ...style, ...patch }; });
      if (askSelected === "title") return [
        { label: "Title text", value: style.title, help: "Display label only; no question is changed.", activate: () => textEditor("Question title", style.title, "Maximum 30 characters; no terminal controls.", value => { const title = safeAskTitle(value); if (!title) { message = "Enter a visible title."; return false; } change({ title }); return true; }) },
        { label: "Title position", value: style.titlePosition, help: "Keep the question identity on the upper rail.", activate: () => choose("Title position", ["topLeft", "topCenter"].map(value => ({ value, label: value })), style.titlePosition, value => change({ titlePosition: value as AskAppearance["titlePosition"] })) },
      ];
      if (askSelected === "progress") return [
        { label: "Progress position", value: style.progressPosition, help: "Keep sourced batch progress on the lower rail.", activate: () => choose("Progress position", ["bottomLeft", "bottomCenter", "bottomRight"].map(value => ({ value, label: value })), style.progressPosition, value => change({ progressPosition: value as AskAppearance["progressPosition"] })) },
        { label: "Progress color", value: style.labels, help: "Matched follows the orange title; hierarchy quiets the progress label.", activate: () => choose("Progress color", ["matched", "hierarchy"].map(value => ({ value, label: value })), style.labels, value => change({ labels: value as AskAppearance["labels"] })) },
      ];
      if (askSelected === "body") return [{ label: "Question emphasis", value: style.questionText, help: "Change emphasis only, never the question wording.", activate: () => choose("Question emphasis", ["bold", "normal"].map(value => ({ value, label: value })), style.questionText, value => change({ questionText: value as AskAppearance["questionText"] })) }];
      if (askSelected === "hint") return [{ label: "Hint tone", value: style.hints, help: "The keys and answer actions are unchanged.", activate: () => choose("Hint tone", ["dim", "muted"].map(value => ({ value, label: value })), style.hints, value => change({ hints: value as AskAppearance["hints"] })) }];
      return [{ label: "Frame identity", value: "Orange", help: "Fixed question identity. This control does not change answer focus or cursor.", activate() {} }];
    };
    const elements = () => ([...Object.keys(ELEMENTS), "frame"] as Selection[]).filter(id => nameOf(id).toLowerCase().includes(query.toLowerCase()));
    const choose = (title: string, items: Array<{ label: string; value: string }>, value: string, accept: (value: string) => void) => {
      choices = { title, items, index: Math.max(0, items.findIndex(item => item.value === value)), current: value, accept };
    };
    const textEditor = (title: string, value: string, help: string, accept: (value: string) => boolean) => {
      const input = new Input({ prompt: "> " }); input.setValue(value);
      edit = { input, title, help, accept };
    };
    const colorEditor = (value: AppearanceColor | undefined, accept: (value: AppearanceColor | undefined) => void, inherit = false) => choose("Choose a color",
      [...(inherit ? [{ label: "Use normal appearance", value: "inherit" }] : []), ...Object.entries(COLORS).map(([value, label]) => ({ value, label })),
        { value: "custom", label: "More color options… (#RRGGBB)" }], value ?? "inherit", next => {
        if (next !== "custom") { changed(() => accept(next === "inherit" ? undefined : next as AppearanceColor)); return; }
        textEditor("Custom color", value?.startsWith("#") ? value : "#", "Enter six hexadecimal digits, for example #8755cc. Named colors adapt to light/dark themes.", value => {
          if (!/^#[0-9a-f]{6}$/i.test(value)) { message = "Use # followed by six digits (0–9 or a–f)."; return false; }
          changed(() => accept(value as AppearanceColor)); return true;
        });
      });
    const stateControl = (): Control => ({ label: "Preview appearance", value: state ? STATES[state] : "Current state (normal settings)",
      help: "A demonstration only. No run, question, timer or message is created. Choose Current state to leave the demonstration.",
      activate: () => choose("Preview an assistant state", [{ label: "Current state (normal settings)", value: "" }, ...Object.entries(STATES).map(([value, label]) => ({ value, label }))], state ?? "", value => {
        state = value ? value as AppearanceState : undefined; propertyIndex = 0; surface?.select(selected, state); tui.requestRender();
      }) });
    const propertyControls = (): Control[] => {
      const style = state ? design().states[state] : undefined;
      const setState = () => design().states[state!] ??= {};
      if (selected === "frame") return [stateControl(), {
        label: "Frame color", value: colorName(state ? style?.frameColor : design().frameColor), help: "Follow the normal frame, choose a named color, or enter an exact color.",
        activate: () => colorEditor(state ? style?.frameColor : design().frameColor, value => {
          if (state) { if (value) setState().frameColor = value; else delete setState().frameColor; }
          else design().frameColor = value ?? "accent";
        }, !!state),
      }];
      const id = selected, e = design().elements[id];
      const controls: Control[] = [
        { label: "Show this element", value: e.visible ? "On" : "Off", help: "Off removes it from the preview, but it stays in the list so you can add it again.", activate: () => changed(() => {
          e.visible = !e.visible;
          if (e.visible && id === "context" && draft.context === "off") draft.context = "adaptive";
          if (e.visible && id === "git" && draft.git === "off") draft.git = "detailed";
          if (e.visible && id === "directory" && draft.directory === "off") draft.directory = "path";
        }) },
        { label: "Position", value: POSITIONS[e.position], help: "Move this element to an input border position or one of the existing footer rows. Native scroll hints have priority.",
          activate: () => choose("Choose a position", Object.entries(POSITIONS).map(([value, label]) => ({ value, label })), e.position, value => changed(() => { e.position = value as typeof e.position; })) },
        { label: "Text color", value: colorName(id === "status" && state ? style?.color : e.color), help: "Match the frame, follow the theme, or choose a color. State-specific colors can inherit the normal setting.",
          activate: () => colorEditor(id === "status" && state ? style?.color : e.color, value => {
            if (id === "status" && state) { if (value) setState().color = value; else delete setState().color; }
            else e.color = value ?? "auto";
          }, id === "status" && !!state) },
      ];
      if (id === "status") {
        controls.splice(2, 0, stateControl());
        controls.push({ label: state ? "Text for this state" : "Label before status", value: state ? style?.text ?? STATE_TEXT[state] : e.text.split("{value}")[0],
          help: state ? "Change the wording for this state only. The actual run state and duration are unchanged." : "Add a label before the real status. To replace your turn, first choose When the assistant finishes above.",
          activate: () => textEditor(state ? "Text for this state" : "Label before status", state ? style?.text ?? STATE_TEXT[state] : e.text.split("{value}")[0], "Enter keeps the edit in your preview. Esc cancels this edit. Save is separate.", value => {
            changed(() => { if (state) setState().text = safeText(value); else e.text = safeText(value) + "{value}"; }); return true;
          }) });
        if (state) controls.push({ label: "Frame color for this state", value: colorName(style?.frameColor), help: "Optional: change the input border color for this state. Use normal appearance keeps it linked to your base frame color.",
          activate: () => colorEditor(style?.frameColor, value => { if (value) setState().frameColor = value; else delete setState().frameColor; }, true) });
      } else controls.push({ label: "Label before value", value: e.text.split("{value}")[0] || "None", help: "Add wording before the live value. The actual chat name, model, directory or time stays sourced from Pi.",
        activate: () => textEditor("Label before value", e.text.split("{value}")[0], "Include a trailing space if you want one between your label and the value.", value => { changed(() => { e.text = safeText(value) + "{value}"; }); return true; }) });
      controls.push({ label: "More options", value: more ? "Shown" : "Show…", help: "Bold text, group order, narrow-width priority and complete text formatting.", activate: () => { more = !more; } });
      if (more) controls.push(
        { label: "Bold text", value: (id === "status" && state ? style?.bold ?? e.bold : e.bold) ? "On" : "Off", help: "Emphasize this label without changing its color.", activate: () => changed(() => { if (id === "status" && state) setState().bold = !(style?.bold ?? e.bold); else e.bold = !e.bold; }) },
        { label: "Move earlier in this position", value: "←", help: "Swap order with the preceding element in the same position.", activate: () => reorder(id, -1) },
        { label: "Move later in this position", value: "→", help: "Swap order with the next element in the same position.", activate: () => reorder(id, 1) },
        { label: "Keep space when narrow", value: e.priority, help: "High-priority fields shorten after low-priority fields. Native input hints always win.", activate: () => choose("Narrow-pane priority", ["low", "normal", "high"].map(value => ({ value, label: value })), e.priority, value => changed(() => { e.priority = value as typeof e.priority; })) },
        { label: "Text format", value: e.text, help: "Use {value} for the real value. Everything else is literal text; no code or commands are evaluated.", activate: () => textEditor("Text format", e.text, "Keep {value} to include the real value. Maximum 120 characters.", value => { changed(() => { e.text = safeText(value); }); return true; }) },
        { label: "Separator between elements", value: design().separator || "None", help: "Shared by groups of elements placed in the same position.", activate: () => textEditor("Group separator", design().separator, "Maximum 8 characters, including spaces.", value => { changed(() => { design().separator = safeText(value, 8); }); return true; }) },
      );
      return controls;
    };
    const taskProperties = (): Control[] => taskControls({ get: () => draft.tasks!, change: changed, choose, text: textEditor,
      state: demoState, preview: next => { demoState = next; demoRevision++; tui.requestRender(); },
      replay: () => { demoRevision++; tui.requestRender(); } });
    function reorder(id: ElementId, direction: number) {
      const e = design().elements[id], peers = (Object.keys(ELEMENTS) as ElementId[]).filter(k => design().elements[k].position === e.position)
        .sort((a, b) => design().elements[a].order - design().elements[b].order);
      const at = peers.indexOf(id), next = at + direction;
      if (next < 0 || next >= peers.length) { message = "Already at the end of this group."; return; }
      changed(() => { [peers[at], peers[next]] = [peers[next], peers[at]]; peers.forEach((k, i) => { design().elements[k].order = i; }); });
    }
    const otherControls = (): Control[] => OTHER_OPTIONS.map(id => ({ label: LABELS[id], value: String(draft[id]), help: DESCRIPTIONS[id] ?? "Changes remain temporary until Save.", activate: () => choose(LABELS[id],
      OPTIONS[id].map(value => ({ label: value, value })), String(draft[id]), value => changed(() => {
        (draft as unknown as Record<string, unknown>)[id] = value;
        if (id === "context") design().elements.context.visible = value !== "off";
        if (id === "directory") design().elements.directory.visible = value !== "off";
        if (id === "git") design().elements.git.visible = value !== "off";
      })) }));
    const close = (save: boolean) => {
      if (closed) return;
      if (save && draft.ask !== undefined && !askStyle()) { message = "Unknown Ask settings version; Save is blocked to preserve it."; tui.requestRender(); return; }
      if (save && draft.transcript !== undefined && !transcriptStyle()) { message = "Unknown transcript settings version; Save is blocked to preserve it."; tui.requestRender(); return; }
      if (save && edit) { if (!edit.accept(edit.input.getValue())) return; edit = undefined; }
      closed = true; release(); surface?.select(selected, undefined); done(save ? clonePrefs(draft) : undefined);
    };
    const discard = () => { if (dirty()) discardConfirm = true; else close(false); };
    const undoChange = () => { const last = undo.pop(); if (last) { draft = last; message = "Last change undone"; publish(); } else message = "No changes to undo"; };
    const onAbort = () => close(false);
    release = () => { closed = true; pulse.stop(); demoMotion.dispose(); signal?.removeEventListener("abort", onAbort); };
    signal?.addEventListener("abort", onAbort, { once: true });
    publish();
    const component = {
      get focused() { return focused; },
      set focused(value: boolean) { focused = value; if (!value) { pulse.stop(); demoMotion.reset(); } },
      invalidate() { pulse.stop(); demoMotion.reset(); edit?.input.invalidate(); },
      dispose() { closed = true; release(); surface?.select(selected, undefined); },
      render(width: number): string[] {
        targets = []; inputY = -1;
        if (width <= 0) return [];
        const height = Math.max(1, tui.terminal.rows), inner = Math.max(1, width - 2), wide = width >= 92;
        const size = `${width}x${height}`;
        if (dimensions && dimensions !== size) pulse.stop();
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
            const active = !edit && !choices && !discardConfirm && (label === "Elements" && (pane === "elements" || pane === "properties") || label === "Tasks" && pane === "tasks" || label === "Ask" && pane === "ask" || label === "Transcript" && pane === "transcript" || label === "Other options" && pane === "other");
            line += (active ? selectionHighlight(theme, theme.style(text, { fg: theme.colors.text, bold: true })) : theme.fg("accent", text)) + " ";
          }
          return line;
        };
        if (pane !== "tasks") demoMotion.reset();
        const demoFrame = pane === "tasks" ? demoMotion.update({ state: demoState, revision: demoRevision,
          suspended: !focused || !!edit || discardConfirm, reducedMotion: draft.motion === "off" || surface?.reducedMotion, visible: width >= 16 && height >= 12 }, draft.tasks!.presentation) : undefined;
        const taskView = pane === "tasks" ? taskPanelPreview(theme, width, taskDemo(demoState), draft.tasks!, demoFrame!, Math.max(3, Math.min(8, Math.floor(height * .45)))) : undefined;
        const askView = pane === "ask" && askStyle() ? questionPreview(theme, width, askStyle()!) : undefined;
        const transcriptView = pane === "transcript" && transcriptStyle() ? transcriptPreview(theme, width, transcriptStyle()!, transcriptSelected.startsWith("chat") ? "chat" : "tools") : undefined;
        const live = taskView || askView || transcriptView ? { editor: [], footer: [], hits: [], above: (taskView ?? askView ?? transcriptView)!.rows }
          : pane === "ask" || pane === "transcript" ? { editor: [], footer: [], hits: [], above: [] }
          : surface?.render(width, pulse.kind === "element" ? phase : undefined) ?? { editor: [], footer: [], hits: [] };
        const native = live.editor.map(row => row.replaceAll(CURSOR_MARKER, ""));
        const bottom = native.findLastIndex(row => /^[\s\u001b\[\d;m]*╰/.test(row) || row.replace(/\x1b\[[0-9;]*m/g, "").startsWith("╰"));
        let aboveRows = live.above ?? [];
        const maxPreview = Math.max(0, Math.min(native.length + live.footer.length + aboveRows.length, Math.floor(height * .45), height - 8));
        let editorRows = native, footerRows = live.footer, omitted = false;
        if (native.length + footerRows.length + aboveRows.length > maxPreview && maxPreview >= 3) {
          aboveRows = aboveRows.slice(0, Math.max(0, maxPreview - 3));
          const editorMax = Math.max(3, maxPreview - aboveRows.length - Math.min(footerRows.length, 2));
          editorRows = native.length > editorMax ? [...native.slice(0, editorMax - 1), native[bottom >= 0 ? bottom : native.length - 1]] : native;
          footerRows = footerRows.slice(0, Math.max(0, maxPreview - editorRows.length - aboveRows.length)); omitted = true;
        }
        if (height < 12) { editorRows = []; footerRows = []; aboveRows = []; }
        const previewHeight = aboveRows.length + editorRows.length + footerRows.length;
        const controlsHeight = Math.max(5, Math.min(wide ? 20 : 18, height - previewHeight - 1));
        const rows: string[] = [];
        rows.push(buttonLine([["Elements", () => { pane = "elements"; }], ["Tasks", () => { pane = "tasks"; }], ["Ask", () => { pane = "ask"; }], ["Transcript", () => { pane = "transcript"; }], ["Other options", () => { pane = "other"; }], ["Undo", undoChange]], 1));
        rows.push(theme.fg("muted", edit ? "Enter keeps edit · Esc cancels edit" : choices ? "↑↓ choose · Enter select · Esc back" : pane === "tasks" || pane === "ask" || pane === "transcript" ? `${pane === "ask" ? "Ask" : pane === "tasks" ? "Tasks" : "Transcript"} room · ← elements · → settings · ↑↓ select · Tab switch` : width < 80 ? "↑↓ select · Tab switch · Enter edit" : `${pane === "elements" ? "Elements" : pane === "properties" ? "Properties" : "Other options"} · › keyboard focus · ↑↓ select · Tab switch · Enter edit · / search`));
        const capacity = Math.max(1, controlsHeight - 6);
        const helpLines: string[] = [];
        const addControl = (control: Control, row: number, x: number, cells: number, active: boolean) => {
          const label = `${control.label}  ${control.value}`;
          targets.push({ x, y: row, width: cells, action: () => {
            if (pane === "tasks") { taskIndex = Math.max(0, taskProperties().findIndex(c => c.label === control.label)); taskSelected = taskControlElement(control); taskFocus = "properties"; }
            else if (pane === "ask") { askIndex = Math.max(0, askControls().findIndex(c => c.label === control.label)); askFocus = "properties"; }
            else if (pane === "transcript") { transcriptIndex = Math.max(0, transcriptControls().findIndex(c => c.label === control.label)); transcriptFocus = "properties"; }
            else if (pane !== "other") { pane = "properties"; propertyIndex = Math.max(0, propertyControls().findIndex(c => c.label === control.label)); }
            else otherIndex = Math.max(0, otherControls().findIndex(c => c.label === control.label));
            control.activate();
          } });
          return selectionRow(theme, label, cells, { focused: active && focused, phase: active && pulse.kind === "focus" ? phase : undefined });
        };
        if (discardConfirm) {
          rows.push("Discard all unsaved changes?");
          rows.push(buttonLine([["Keep editing", () => { discardConfirm = false; }], ["Discard changes", () => close(false)]], rows.length + 1));
          helpLines.push("Saved settings and your draft will not be changed. Enter discards; Esc keeps editing.");
        } else if (edit) {
          rows.push(theme.fg("accent", edit.title)); inputY = rows.length + 1; inputX = 1; inputWidth = inner;
          edit.input.focused = component.focused;
          rows.push(edit.input.render(inner)[0]); helpLines.push(edit.help);
        } else if (choices) {
          rows.push(theme.fg("accent", choices.title));
          const start = Math.max(0, choices.index - Math.floor((capacity - 1) / 2));
          for (let i = start; i < Math.min(choices.items.length, start + Math.max(1, capacity - 1)); i++) {
            const item = choices.items[i];
            targets.push({ x: 1, y: rows.length + 1, width: inner, action: () => { const accept = choices!.accept; choices = undefined; accept(item.value); } });
            const swatch = validColor(item.value) ? theme.style("■ ", { fg: appearanceColor(theme, item.value) }) : "";
            rows.push(selectionRow(theme, `${swatch}${item.label}${item.value === choices.current ? "  ✓" : ""}`, inner,
              { selected: item.value === choices.current, focused: focused && i === choices.index, phase: i === choices.index ? phase : undefined }));
          }
          helpLines.push(`${choices.index + 1} of ${choices.items.length} · ✓ current value · Scroll or use ↑↓ for more`);
        } else if (pane === "tasks") {
          const controls = taskProperties(); taskIndex = Math.min(taskIndex, controls.length - 1);
          const start = Math.max(0, taskIndex - Math.floor(capacity / 2));
          const listWidth = wide ? Math.min(28, Math.floor(inner * .3)) : inner;
          const selectedIndex = TASK_ELEMENTS.findIndex(item => item.id === taskSelected);
          const listStart = Math.max(0, selectedIndex - Math.floor(capacity / 2));
          for (let n = 0; n < capacity; n++) {
            let left = "", right = "";
            const item = TASK_ELEMENTS[listStart + n];
            if (item && (wide || taskFocus === "elements")) {
              left = selectionRow(theme, item.name, listWidth, { selected: item.id === taskSelected,
                focused: focused && taskFocus === "elements" && item.id === taskSelected,
                phase: item.id === taskSelected && pulse.kind === "element" ? phase : undefined });
              targets.push({ x: 1, y: rows.length + 1, width: listWidth, action: () => selectTask(item.id) });
            }
            const control = controls[start + n];
            if (control && (wide || taskFocus === "properties")) right = addControl(control, rows.length + 1,
              wide ? listWidth + 3 : 1, wide ? inner - listWidth - 2 : inner, taskFocus === "properties" && start + n === taskIndex);
            rows.push(wide ? left + " ".repeat(Math.max(0, listWidth - visibleWidth(left))) + "│ " + right : taskFocus === "elements" ? left : right);
          }
          helpLines.push(taskFocus === "elements" ? TASK_ELEMENTS[selectedIndex].help : controls[taskIndex].help);
        } else if (pane === "ask") {
          const controls = askControls(); askIndex = Math.min(askIndex, controls.length - 1);
          const listWidth = wide ? Math.min(28, Math.floor(inner * .3)) : inner;
          const selectedIndex = askElements.findIndex(item => item.id === askSelected);
          const start = Math.max(0, selectedIndex - Math.floor(capacity / 2));
          for (let n = 0; n < capacity; n++) {
            let left = "", right = "";
            const item = askElements[start + n];
            if (item && (wide || askFocus === "elements")) {
              left = selectionRow(theme, item.name, listWidth, { selected: item.id === askSelected,
                focused: focused && askFocus === "elements" && item.id === askSelected,
                phase: item.id === askSelected && pulse.kind === "element" ? phase : undefined });
              targets.push({ x: 1, y: rows.length + 1, width: listWidth, action: () => selectAsk(item.id) });
            }
            const control = controls[n];
            if (control && (wide || askFocus === "properties")) right = addControl(control, rows.length + 1,
              wide ? listWidth + 3 : 1, wide ? inner - listWidth - 2 : inner, askFocus === "properties" && n === askIndex);
            rows.push(wide ? left + " ".repeat(Math.max(0, listWidth - visibleWidth(left))) + "│ " + right : askFocus === "elements" ? left : right);
          }
          helpLines.push(askFocus === "elements" ? askElements[selectedIndex].help : controls[askIndex].help);
        } else if (pane === "transcript") {
          const controls = transcriptControls(); transcriptIndex = Math.min(transcriptIndex, controls.length - 1);
          const listWidth = wide ? Math.min(28, Math.floor(inner * .3)) : inner;
          const selectedIndex = transcriptElements.findIndex(item => item.id === transcriptSelected);
          const start = Math.max(0, selectedIndex - Math.floor(capacity / 2));
          for (let n = 0; n < capacity; n++) {
            let left = "", right = "";
            const item = transcriptElements[start + n];
            if (item && (wide || transcriptFocus === "elements")) {
              left = selectionRow(theme, item.name, listWidth, { selected: item.id === transcriptSelected,
                focused: focused && transcriptFocus === "elements" && item.id === transcriptSelected,
                phase: item.id === transcriptSelected && pulse.kind === "element" ? phase : undefined });
              targets.push({ x: 1, y: rows.length + 1, width: listWidth, action: () => selectTranscript(item.id) });
            }
            const control = controls[n];
            if (control && (wide || transcriptFocus === "properties")) right = addControl(control, rows.length + 1,
              wide ? listWidth + 3 : 1, wide ? inner - listWidth - 2 : inner, transcriptFocus === "properties" && n === transcriptIndex);
            rows.push(wide ? left + " ".repeat(Math.max(0, listWidth - visibleWidth(left))) + "│ " + right : transcriptFocus === "elements" ? left : right);
          }
          helpLines.push(transcriptFocus === "elements" ? transcriptElements[selectedIndex].help : controls[transcriptIndex].help);
        } else if (pane === "other") {
          const controls = otherControls(); otherIndex = Math.min(otherIndex, controls.length - 1);
          const start = Math.max(0, otherIndex - Math.floor(capacity / 2));
          for (let i = start; i < Math.min(controls.length, start + capacity); i++) rows.push(addControl(controls[i], rows.length + 1, 1, inner, i === otherIndex));
          helpLines.push(controls[otherIndex].help);
        } else {
          const ids = elements(), controls = propertyControls(); propertyIndex = Math.min(propertyIndex, controls.length - 1);
          const listWidth = wide ? Math.min(28, Math.floor(inner * .3)) : inner;
          const listStart = Math.max(0, elementIndex - Math.floor(capacity / 2));
          const propStart = Math.max(0, propertyIndex - Math.floor(capacity / 2));
          for (let n = 0; n < capacity; n++) {
            let left = "", right = "";
            const id = ids[listStart + n];
            if (id && (wide || pane === "elements")) {
              const label = `${nameOf(id)}${id !== "frame" && !design().elements[id].visible ? " · Off" : ""}`;
              left = selectionRow(theme, label, listWidth, { selected: id === selected, focused: focused && pane === "elements" && id === selected,
                phase: id === selected && (pulse.kind === "element" || pane === "elements") ? phase : undefined });
              targets.push({ x: 1, y: rows.length + 1, width: listWidth, action: () => select(id) });
            }
            const control = controls[propStart + n];
            if (control && (wide || pane === "properties")) right = addControl(control, rows.length + 1, wide ? listWidth + 3 : 1, wide ? inner - listWidth - 2 : inner, pane === "properties" && propStart + n === propertyIndex);
            rows.push(wide ? left + " ".repeat(Math.max(0, listWidth - visibleWidth(left))) + "│ " + right : pane === "elements" ? left : right);
          }
          helpLines.push(pane === "elements" ? INFO[selected] : controls[propertyIndex].help);
        }
        while (rows.length < controlsHeight - 4) rows.push("");
        const unavailable = !edit && !choices && !discardConfirm && pane !== "other" && pane !== "tasks" && pane !== "ask" && pane !== "transcript" && selected !== "frame" && design().elements[selected].visible && !live.hits.some(hit => hit.id === selected);
        rows.push(theme.fg("muted", clip(unavailable ? `Not visible now. ${INFO[selected]}` : message || helpLines[0] || "Changes are previews until you Save.", inner)));
        rows.push(buttonLine([["Discard", discard], ["Save", () => close(true)]], rows.length + 1) + theme.fg("dim", " Ctrl+S save · Esc back"));
        const panel = frameRows({ theme, width, rows: rows.slice(0, controlsHeight - 2), color: theme.colors.accent,
          corners: { topLeft: theme.fg("accent", pane === "tasks" ? ` Workspace · Tasks · ${TASK_ELEMENTS.find(item => item.id === taskSelected)?.name} `
            : pane === "ask" ? ` Workspace · Ask · ${askElements.find(item => item.id === askSelected)?.name} `
            : pane === "transcript" ? ` Workspace · Transcript · ${transcriptElements.find(item => item.id === transcriptSelected)?.name} `
            : pane === "properties" ? ` Workspace · Input & footer · ${nameOf(selected)} ` : " Workspace · Input & footer "),
            topRight: theme.fg(dirty() ? "warning" : "muted", dirty() ? " Unsaved changes " : " Saved settings ") } });
        while (panel.length < controlsHeight) panel.push(cover(""));
        const previewLabel = state ? `Previewing: ${STATES[state]} · appearance only` : "Live input box and footer · select a label to edit";
        const label = pane === "tasks" ? `Demo Tasks · ${demoState} · display only · Selected: ${TASK_ELEMENTS.find(item => item.id === taskSelected)?.name}${height < 12 ? " · enlarge terminal for preview" : ""}`
          : pane === "ask" ? `Demo question · display only · Selected: ${askElements.find(item => item.id === askSelected)?.name}${!askView ? " · Ask settings unavailable or newer version" : height < 12 ? " · enlarge terminal for preview" : ""}`
          : pane === "transcript" ? `Demo chat / tool · display only · Selected: ${transcriptElements.find(item => item.id === transcriptSelected)?.name}${!transcriptView ? " · transcript settings unavailable or newer version" : height < 12 ? " · enlarge terminal for preview" : ""}`
          : !native.length ? "Native input preview unavailable; settings still support Save / Discard"
          : height < 12 ? "Enlarge the terminal to see your input preview" : previewLabel + (omitted ? " · shortened vertically" : surface?.temporary ? " · temporary Composer view" : "");
        const previewTop = panel.length + 1 + aboveRows.length;
        const lines = [...panel, theme.fg("muted", clip(label)), ...aboveRows, ...editorRows, ...footerRows];
        const previewBottom = editorRows.findLastIndex(line => line.replace(/\x1b\[[0-9;]*m/g, "").startsWith("╰"));
        const footerPositions = ["footer1", "footer2"].filter(prefix => live.hits.some(hit => hit.position.startsWith(prefix)));
        if (taskView && aboveRows.length && height >= 12) {
          const top = panel.length + 1;
          for (const hit of taskView.hits) if (hit.y < aboveRows.length) {
            targets.push({ x: hit.x, y: top + hit.y, width: hit.width, action: () => selectTask(hit.id) });
          }
          if (width >= 16 && aboveRows.length >= 2) for (const y of [top, top + aboveRows.length - 1]) {
            targets.push({ x: 0, y, width, action: () => selectTask("frame") });
          }
        }
        if (transcriptView && aboveRows.length && height >= 12) {
          const top = panel.length + 1;
          for (const hit of transcriptView.hits) if (hit.y < aboveRows.length) {
            targets.push({ x: hit.x, y: top + hit.y, width: hit.width, action: () => selectTranscript(hit.id) });
          }
        }
        if (askView && aboveRows.length && height >= 12) {
          const top = panel.length + 1;
          for (const hit of askView.hits) if (hit.y < aboveRows.length) targets.push({ x: hit.x, y: top + hit.y, width: hit.width, action: () => selectAsk(hit.id) });
          if (width >= 10 && aboveRows.length >= 2) for (const y of [top, top + aboveRows.length - 1]) {
            targets.push({ x: 0, y, width, action: () => selectAsk("frame") });
          }
        }
        for (const hit of live.hits) {
          const y = hit.position.startsWith("top") ? previewTop : hit.position.startsWith("bottom") ? previewTop + previewBottom
            : previewTop + editorRows.length + footerPositions.indexOf(hit.position.startsWith("footer1") ? "footer1" : "footer2");
          if (y >= previewTop && y < lines.length) targets.push({ x: hit.x, y, width: hit.width, action: () => select(hit.id) });
        }
        if (editorRows.length) for (const y of [previewTop, previewTop + previewBottom]) if (y >= previewTop) {
          // Label hit targets precede the general frame target.
          targets.push({ x: 0, y, width, action: () => select("frame") });
        }
        while (lines.length < height) lines.push("");
        return lines.slice(0, height).map(cover);
      },
      handleInput(data: string) {
        if (closed || !focused) return;
        const before = focusKey(), previous = selected, previousTask = taskSelected, previousAsk = askSelected, previousTranscript = transcriptSelected;
        message = "";
        if (matchesKey(data, Key.ctrl("s")) && !discardConfirm) close(true);
        else if (discardConfirm) {
          if (matchesKey(data, Key.escape)) discardConfirm = false;
          else if (matchesKey(data, Key.enter)) close(false);
        } else if (edit) {
          if (matchesKey(data, Key.escape)) edit = undefined;
          else if (matchesKey(data, Key.enter)) { if (edit.accept(edit.input.getValue())) edit = undefined; }
          else edit.input.handleInput(data);
        } else if (choices) {
          if (matchesKey(data, Key.escape)) choices = undefined;
          else if (matchesKey(data, Key.up)) choices.index = Math.max(0, choices.index - 1);
          else if (matchesKey(data, Key.down)) choices.index = Math.min(choices.items.length - 1, choices.index + 1);
          else if (matchesKey(data, Key.enter)) { const { accept, items, index } = choices; choices = undefined; accept(items[index].value); }
        } else if (matchesKey(data, Key.ctrl("s"))) close(true);
        else if (matchesKey(data, Key.ctrl("z"))) undoChange();
        else if (matchesKey(data, Key.escape)) { if (pane !== "elements") pane = "elements"; else discard(); }
        else if (data === "/") textEditor("Find an element", query, "Search by name, including elements that are off.", value => {
          query = safeText(value); pane = "elements"; elementIndex = 0;
          if (elements()[0]) { selected = elements()[0]; surface?.select(selected, state); }
          return true;
        });
        else if (matchesKey(data, Key.tab)) pane = pane === "elements" ? "properties" : pane === "properties" ? "other" : pane === "other" ? "tasks" : pane === "tasks" ? "ask" : pane === "ask" ? "transcript" : "elements";
        else if (pane === "transcript" && matchesKey(data, Key.left)) transcriptFocus = "elements";
        else if (pane === "transcript" && matchesKey(data, Key.right)) transcriptFocus = "properties";
        else if (pane === "ask" && matchesKey(data, Key.left)) askFocus = "elements";
        else if (pane === "ask" && matchesKey(data, Key.right)) askFocus = "properties";
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
          } else otherIndex = Math.max(0, Math.min(OTHER_OPTIONS.length - 1, otherIndex + delta));
        } else if (matchesKey(data, Key.enter) || data === " ") {
          if (pane === "elements") pane = "properties";
          else if (pane === "properties") propertyControls()[propertyIndex]?.activate();
          else if (pane === "transcript" && transcriptFocus === "elements") selectTranscript(transcriptSelected);
          else if (pane === "transcript") transcriptControls()[transcriptIndex]?.activate();
          else if (pane === "ask" && askFocus === "elements") selectAsk(askSelected);
          else if (pane === "ask") askControls()[askIndex]?.activate();
          else if (pane === "tasks" && taskFocus === "elements") selectTask(taskSelected);
          else if (pane === "tasks") taskProperties()[taskIndex]?.activate();
          else otherControls()[otherIndex]?.activate();
        }
        afterInteraction(before, previous, previousTask, previousAsk, previousTranscript);
      },
      handleMouse(event: TuiMouseEvent) {
        if (closed || !focused) return { handled: true };
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
