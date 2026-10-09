import type { Color } from "@earendil-works/pi-tui";

export interface FrameTheme {
  style?(text: string, options: any): string;
}
export interface FrameCorners {
  topLeft?: string;
  topCenter?: string;
  topRight?: string;
  bottomLeft?: string;
  bottomCenter?: string;
  bottomRight?: string;
}
export interface FrameMotion {
  active: boolean;
  now: number;
  accent?: Color | string;
  startAt?: number;
  periodMs?: number;
  quiet?: boolean;
  intensity?: number;
  direction?: "clockwise" | "counterclockwise";
  effect?: "shimmer" | "pulse";
}
export interface FrameOptions {
  theme?: FrameTheme;
  width: number;
  rows: string[];
  corners?: FrameCorners;
  color?: Color | string;
  textColor?: Color | string;
  inset?: number;
  minWidth?: number;
  surface?: (text: string, width: number) => string;
  motion?: FrameMotion;
}
export type FrameStatus = "preparing" | "running" | "returned" | "failed" | "cancelled" | "observed";
export interface StatusPresetOptions {
  state: FrameStatus;
  appearance?: "dark" | "light";
  attention?: boolean;
  markers?: Partial<Record<"failed" | "cancelled" | "attention" | "returned" | "running" | "quiet", string>>;
  colors?: Partial<Record<"failed" | "attention" | "returned" | "running" | "quiet", Color | string>>;
  labels?: Partial<Record<FrameStatus, string>>;
}
/** Pure visual mapping. Caller classifies its own state and requests rerenders. */
export function statusPreset(options: StatusPresetOptions): { marker: string; color: Color | string; label: string };
export function frameRail(options: Omit<FrameOptions, "rows" | "corners" | "motion"> & { left?: string; center?: string; right?: string; side?: "top" | "bottom" }): string;
export function frameRows(options: FrameOptions): string[];
export function paintFramePerimeter(rows: string[], options: Omit<FrameOptions, "rows" | "corners" | "inset" | "minWidth" | "textColor"> & FrameMotion & { bottom?: number }): string[];
