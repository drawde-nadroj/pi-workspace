import type { AppearanceColor, AppearanceState, ElementId } from "./appearance.ts";
import type { FooterPrefs } from "./footer-state.ts";
import type { TaskElementId } from "./task-presentation.ts";
import type { AskElementId } from "../../packages/pi-ask/extensions/ask-user-question/question-preview.ts";
import type { TranscriptElementId } from "./transcript-presentation.ts";
export type Selection = ElementId | "frame";
export type Inspection = { room: "input"; id: Selection } | { room: "tasks"; id: TaskElementId } | { room: "ask"; id: AskElementId } | { room: "transcript"; id: TranscriptElementId } | { room: "general"; id: "identity" | "spacing" };
export interface Control { label: string; value: string; help: string; readonly?: boolean; inspect?: Inspection; activate(): void }
export interface ChoiceItem { label: string; value: string }
export interface ChoiceAudition { show(value: string): void; restore(): void }
export interface RoomEditor {
  get(): FooterPrefs;
  change(mutate: () => void): void;
  choose(title: string, items: ChoiceItem[], value: string, accept: (value: string) => void, audition?: ChoiceAudition): void;
  text(title: string, value: string, help: string, accept: (value: string) => boolean): void;
  message(value: string): void;
  visual(patch: (candidate: FooterPrefs, value: string) => void): ChoiceAudition;
}
export interface InputRoomEditor extends RoomEditor {
  selected: Selection; state?: AppearanceState; more: boolean;
  color(value: AppearanceColor | undefined, accept: (value: AppearanceColor | undefined) => void, inherit?: boolean, patch?: (candidate: FooterPrefs, value: AppearanceColor | undefined) => void): void;
  preview(state?: AppearanceState): void; audition(state?: AppearanceState): void; restore(): void;
  expand(more: boolean): void; reorder(id: ElementId, direction: number): void;
}
