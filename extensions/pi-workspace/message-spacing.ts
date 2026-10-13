import type { FooterPrefs } from "./footer-state.ts";

/** Workspace-owned message body padding. Content rows and their internal gaps stay intact. */
export function messageBodyRows(rows: readonly string[], density: FooterPrefs["density"] = "spaced"): string[] {
  return !rows.length || density === "compact" ? [...rows] : ["", ...rows, ""];
}
