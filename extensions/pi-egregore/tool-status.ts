import type { FrameStatus } from "../../lib/frame.ts";

/** Completion is conveyed by its marker; exceptions retain a written label. */
export function compactToolStatus(state: FrameStatus, attention = ""): string {
  if (attention) return attention;
  return state === "returned" ? "" : state;
}
