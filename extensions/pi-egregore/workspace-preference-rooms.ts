import { OPTIONS, type FooterOption, type FooterPrefs } from "./footer-state.ts";
import { safeText } from "./appearance.ts";
import { LABELS, DESCRIPTIONS } from "./footer-option-info.ts";
import type { Control, RoomEditor } from "./workspace-room-types.ts";
// Visibility/position have one authority: the part inspector. Legacy scalar
// fallbacks remain readable but are not duplicate live controls.
const REPLACED = new Set<FooterOption>(["density", "layout", "topOrder", "bottomOrder", "session", "model", "thinking", "railTitle", "railDetails", "railHint", "composerContext", "questionLabels", "messageTime", "toolLabels", "sessionActivity", "activityColor"]);
export const OTHER_OPTIONS: FooterOption[] = ["selectionShimmer", ...(Object.keys(OPTIONS) as FooterOption[]).filter(id => id !== "selectionShimmer" && !REPLACED.has(id))];
export const PREFERENCE_GROUPS = { all: "All settings", footer: "Footer", context: "Context", git: "Git", activity: "Activity & time" } as const;
export type PreferenceGroup = keyof typeof PREFERENCE_GROUPS;
export function preferenceGroup(id: FooterOption): Exclude<PreferenceGroup, "all"> {
  return ["context", "bar", "shape", "effect"].includes(id) ? "context" : ["git", "gitLabels"].includes(id) ? "git"
    : ["timing", "sent", "received", "run", "active", "elapsed", "timestamps", "composerActivity"].includes(id) ? "activity" : "footer";
}
function assignOption(prefs: FooterPrefs, id: FooterOption, value: string): void {
  (prefs as unknown as Record<string, unknown>)[id] = value;
  if (id === "context") prefs.appearance!.elements.context.visible = value !== "off";
  if (id === "directory") prefs.appearance!.elements.directory.visible = value !== "off";
  if (id === "git") prefs.appearance!.elements.git.visible = value !== "off";
}
export function preferenceControls(e: RoomEditor, room: "general" | "other", advanced: boolean, expand: (advanced: boolean) => void,
  group: PreferenceGroup = "all", selectGroup: (group: PreferenceGroup) => void = () => {}): Control[] {
  const draft = e.get();
  if (room === "general") return [
    ...(["sessionActivity", "activityColor"] as const).map(id=>({label:LABELS[id],value:draft[id],help:DESCRIPTIONS[id]!,activate:()=>e.choose(LABELS[id],OPTIONS[id].map(value=>({label:value,value})),draft[id],value=>e.change(()=>assignOption(e.get(),id,value)),e.visual((candidate,value)=>assignOption(candidate,id,value)))})),
    { label: "Your display name", inspect: { room: "general", id: "identity" }, value: draft.displayName, help: "Your sent-message label. Your account and saved messages do not change.",
      activate: () => e.text("Your display name", draft.displayName, "1–40 visible characters. Display only.", value => {
        const name = safeText(value, 40).trim();
        if (!name) { e.message("Enter a nonempty display name."); return false; }
        e.change(() => { e.get().displayName = name; }); return true;
      }) },
    { label: "Egregore density", inspect: { room: "general", id: "spacing" }, value: draft.density === "compact" ? "Compact" : "Spaced", help: "Compact removes extra message-edge rows; Spaced adds one above and below. Also controls optional input/tool/question whitespace. Content stays unchanged.",
      activate: () => e.choose("Egregore density", [{ label: "Spaced", value: "spaced" }, { label: "Compact", value: "compact" }], draft.density,
        value => e.change(() => { e.get().density = value as FooterPrefs["density"]; }),
        e.visual((candidate, value) => { candidate.density = value as FooterPrefs["density"]; })) },
  ];
  const controls: Control[] = OTHER_OPTIONS.filter(id => advanced ? group === "all" || preferenceGroup(id) === group : ["selectionShimmer", "style", "color", "icons"].includes(id)).map(id => ({
    label: LABELS[id], inspect: ["context", "bar", "shape", "effect"].includes(id) ? { room: "input", id: "context" }
      : ["git", "gitLabels"].includes(id) ? { room: "input", id: "git" } : id === "directory" || id === "icons" ? { room: "input", id: "directory" }
      : id === "timestamps" ? { room: "input", id: "sentTime" } : undefined, value: String(draft[id]), help: DESCRIPTIONS[id] ?? "Preview is temporary. Save keeps the change.",
    activate: () => e.choose(LABELS[id], OPTIONS[id].map(value => ({ label: value, value })), String(draft[id]),
      value => e.change(() => assignOption(e.get(), id, value)), e.visual((candidate, value) => assignOption(candidate, id, value))),
  }));
  if (advanced) controls.unshift({ label: "Settings group", value: PREFERENCE_GROUPS[group], help: "Browse related controls. This filter changes no saved settings.",
    activate: () => e.choose("Settings group", Object.entries(PREFERENCE_GROUPS).map(([value, label]) => ({ value, label })), group, value => selectGroup(value as PreferenceGroup)) });
  controls.push({ label: "Advanced settings", value: advanced ? "Hide…" : "Show…", help: "Reveal detailed controls. Hiding them keeps your changes.", activate: () => expand(!advanced) });
  return controls;
}
