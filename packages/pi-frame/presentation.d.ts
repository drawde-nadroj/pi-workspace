import type { Color } from "@earendil-works/pi-tui";
import type { FrameTheme, FrameCorners } from "./primitives.js";
export type FramePosition = keyof FrameCorners;
export type FrameState = "idle" | "working" | "waiting" | "done" | "blocked" | "error";
export type FramePaint = "accent" | "text" | "muted" | "warning" | "error" | "success" | "highlight" | `#${string}`;
export const FRAME_POSITIONS: readonly FramePosition[];
export const FRAME_STATES: readonly FrameState[];
export interface FramePaints {
  borderColor: FramePaint; labelColor: FramePaint; metadataColor: FramePaint; textColor: FramePaint; activeColor: FramePaint; highlightColor: FramePaint;
}
export interface FramePresentation extends FramePaints {
  version: 1; labelBold: boolean; activeBold: boolean; motion: "work" | "changes" | "off";
  effect: "shimmer" | "pulse"; periodMs: number; intensity: number; direction: "clockwise" | "counterclockwise";
  progressSweep: boolean; textEffect: "none" | "labels" | "active" | "both";
  positions: { title: FramePosition; summary: FramePosition; hint: FramePosition };
  states: Partial<Record<FrameState, Partial<FramePaints> & { motion?: "repeat" | "change" | "off" }>>;
}
export interface FrameFacts { state: FrameState; revision?: string | number; suspended?: boolean; reducedMotion?: boolean; visible?: boolean }
export interface FrameSample { active: boolean; elapsed: number; progress: number; state: FrameState; once: boolean }
export interface FrameController {
  update(facts: FrameFacts, presentation?: FramePresentation, now?: number): FrameSample;
  sample(now?: number): FrameSample;
  readonly active: boolean;
  reset(): void;
  dispose(): void;
}
export function framePresentationDefaults(): FramePresentation;
export function readFramePresentation(value: unknown): FramePresentation;
export function createFrameController(options?: {
  requestRender?: () => void; automatic?: boolean; now?: () => number; fps?: number;
  schedule?: (callback: () => void, delay: number) => any; cancel?: (handle: any) => void;
}): FrameController;
export function presentationRows(options: {
  theme?: FrameTheme & { appearance?: "light" | "dark"; colors?: Partial<Record<Exclude<FramePaint, `#${string}`>, Color>> };
  width: number; rows: Array<string | { text: string; role?: "text" | "active" | "muted" | "warning" | "error" }>;
  title?: string; summary?: string; hint?: string; presentation?: FramePresentation; frame?: FrameSample; inset?: number;
  surface?: (text: string, width: number) => string;
}): string[];
