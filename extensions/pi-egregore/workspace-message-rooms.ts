import { readAskAppearance, safeAskTitle, type AskAppearance } from "../../packages/pi-ask/extensions/ask-user-question/appearance.ts";
import type { AskElementId } from "../../packages/pi-ask/extensions/ask-user-question/question-preview.ts";
import { readTranscript, type TranscriptAppearance, type TranscriptElementId } from "./transcript-presentation.ts";
import type { Control, RoomEditor } from "./workspace-room-types.ts";
export const askElements: Array<{ id: AskElementId; name: string; help: string }> = [
  { id: "frame", name: "Question frame", help: "Pi's theme accent identifies questions. It is not a warning or error color." },
  { id: "title", name: "Question title", help: "The shell's display label; the question itself stays unchanged." },
  { id: "progress", name: "Question progress", help: "Position in a question batch. This example shows 2 of 3." },
  { id: "body", name: "Question text", help: "Text emphasis only. Wording and answer behavior stay with Ask." },
  { id: "hint", name: "Action hints", help: "Key hints keep the same actions; only their color changes." },
];
export const transcriptElements: Array<{ id: TranscriptElementId; name: string; help: string }> = [
  { id: "chatFrame", name: "Chat frame", help: "Red identifies you; purple identifies the assistant. Message content stays native." },
  { id: "chatIdentity", name: "Chat identity", help: "Assistant-name color. Your name stays red." },
  { id: "chatSent", name: "Sourced Sent time", help: "Recorded message creation time, not reply completion. Missing times stay hidden." },
  { id: "toolFrame", name: "Tool frame", help: "Supported tool frames only. Self-rendering and graphical tools stay native." },
  { id: "toolIdentity", name: "Tool identity", help: "Tool-name color. Names, results and expansion stay unchanged." },
  { id: "toolStatus", name: "Tool status", help: "Success-label color. Failures and cancellations keep their status colors." },
];
export function askControls(e: RoomEditor, selected: AskElementId): Control[] {
  const draft = e.get(), style = readAskAppearance(draft.ask, draft.questionLabels);
  if (!style) return [{ label: "Ask settings unavailable", value: "Read-only", readonly: true, help: "Unknown settings version. Save is blocked to preserve it.", activate() {} }];
  const patch = (p: typeof draft, update: Partial<AskAppearance>) => { p.ask = { ...style, ...update }; };
  const choice = (label: string, value: string, values: string[], help: string, update: (value: string) => Partial<AskAppearance>): Control => ({
    label, value, help, activate: () => e.choose(label, values.map(value => ({ value, label: value })), value,
      next => e.change(() => patch(e.get(), update(next))), e.visual((candidate, next) => patch(candidate, update(next)))),
  });
  if (selected === "title") return [
    { label: "Title text", value: style.title, help: "The shell's label, not the question text.", activate: () => e.text("Question title", style.title, "1–30 visible characters. Enter edits; Save keeps the change.", value => {
      const title = safeAskTitle(value); if (!title) { e.message("Enter a visible title."); return false; }
      e.change(() => patch(e.get(), { title })); return true;
    }) },
    choice("Title position", style.titlePosition, ["topLeft", "topCenter"], "Hover a position to try it on the upper rail.", titlePosition => ({ titlePosition: titlePosition as AskAppearance["titlePosition"] })),
  ];
  if (selected === "progress") return [
    choice("Progress position", style.progressPosition, ["bottomLeft", "bottomCenter", "bottomRight"], "Hover a position to try it on the lower rail.", progressPosition => ({ progressPosition: progressPosition as AskAppearance["progressPosition"] })),
    choice("Progress color", style.labels, ["matched", "hierarchy"], "Match the title or make progress quieter.", labels => ({ labels: labels as AskAppearance["labels"] })),
  ];
  if (selected === "body") return [choice("Question emphasis", style.questionText, ["bold", "normal"], "Bold or normal. The question wording does not change.", questionText => ({ questionText: questionText as AskAppearance["questionText"] }))];
  if (selected === "hint") return [choice("Hint tone", style.hints, ["dim", "muted"], "Quiet the key hints without changing their actions.", hints => ({ hints: hints as AskAppearance["hints"] }))];
  return [{ label: "Question frame is fixed", value: "Pi theme accent", readonly: true,
    help: "Information, not a setting. Questions use Pi's accent; warning and error colors keep their meanings.", activate() {} }];
}
export function transcriptControls(e: RoomEditor, selected: TranscriptElementId): Control[] {
  const draft = e.get(), style = readTranscript(draft.transcript, draft);
  if (!style) return [{ label: "Transcript settings unavailable", value: "Read-only", readonly: true, help: "Unknown settings version. Save is blocked to preserve it.", activate() {} }];
  const patch = (p: typeof draft, update: Partial<TranscriptAppearance>) => { p.transcript = { ...style, ...update }; };
  const choice = (label: string, value: string, values: string[], help: string, update: (value: string) => Partial<TranscriptAppearance>): Control => ({
    label, value, help, activate: () => e.choose(label, values.map(value => ({ value, label: value })), value,
      next => e.change(() => patch(e.get(), update(next))), e.visual((candidate, next) => patch(candidate, update(next)))),
  });
  if (selected === "chatSent") return [
    { label: "Show sourced Sent time", value: style.chat.showSent ? "On" : "Off", help: "Show recorded creation times. Missing times stay hidden.", activate: () => e.change(() => patch(e.get(), { chat: { ...style.chat, showSent: !style.chat.showSent } })) },
    choice("Sent position", style.chat.sentPosition, ["bottomLeft", "bottomRight"], "Hover a lower-rail position to try it.", sentPosition => ({ chat: { ...style.chat, sentPosition: sentPosition as TranscriptAppearance["chat"]["sentPosition"] } })),
  ];
  if (selected === "chatIdentity") return [choice("Assistant name color", style.chat.assistantLabel, ["matched", "quiet"], "Match the assistant frame or use a quieter shade. Your name stays red.", assistantLabel => ({ chat: { ...style.chat, assistantLabel: assistantLabel as TranscriptAppearance["chat"]["assistantLabel"] } }))];
  if (selected === "toolIdentity") return [choice("Tool identity", style.tools.identity, ["matched", "quiet"], "Name color for supported ordinary, grouped and web tool frames.", identity => ({ tools: { ...style.tools, identity: identity as TranscriptAppearance["tools"]["identity"] } }))];
  if (selected === "toolStatus") return [choice("Successful status tone", style.tools.status, ["semantic", "matched"], "Success labels only. Failed, cancelled and child-error labels keep their status colors.", status => ({ tools: { ...style.tools, status: status as TranscriptAppearance["tools"]["status"] } }))];
  return [{ label: "Frame colors are fixed", value: selected === "chatFrame" ? "User red · assistant purple" : "Follow tool status", readonly: true,
    help: "Information, not a setting. These colors distinguish roles and tool outcomes.", activate() {} }];
}
