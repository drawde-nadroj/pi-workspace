import { stripVTControlCharacters } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Ask owns this visual contract. It never contains question text or answers. */
export interface AskAppearance {
  version: 1;
  title: string;
  titlePosition: "topLeft" | "topCenter";
  progressPosition: "bottomLeft" | "bottomCenter" | "bottomRight";
  labels: "matched" | "hierarchy";
  questionText: "bold" | "normal";
  hints: "dim" | "muted";
}
export const askAppearanceDefaults = (): AskAppearance => ({ version: 1, title: "Questions", titlePosition: "topLeft", progressPosition: "bottomLeft", labels: "matched", questionText: "bold", hints: "dim" });
export const safeAskTitle = (text: string) => Array.from(stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ").trim()).slice(0, 30).join("");
export function readAskAppearance(value: unknown, legacy?: unknown): AskAppearance | undefined {
  if (value !== undefined && (!value || typeof value !== "object" || (value as any).version !== 1)) return undefined;
  const raw = value as Partial<AskAppearance> | undefined, out = askAppearanceDefaults();
  if (legacy === "hierarchy") out.labels = "hierarchy";
  if (!raw) return out;
  if (typeof raw.title === "string") out.title = safeAskTitle(raw.title) || out.title;
  if (raw.titlePosition === "topLeft" || raw.titlePosition === "topCenter") out.titlePosition = raw.titlePosition;
  if (["bottomLeft", "bottomCenter", "bottomRight"].includes(raw.progressPosition ?? "")) out.progressPosition = raw.progressPosition!;
  if (raw.labels === "matched" || raw.labels === "hierarchy") out.labels = raw.labels;
  if (raw.questionText === "bold" || raw.questionText === "normal") out.questionText = raw.questionText;
  if (raw.hints === "dim" || raw.hints === "muted") out.hints = raw.hints;
  return out;
}
/** Read once per interaction. Missing, malformed or future-version settings retain safe defaults. */
export function savedWorkspaceVisuals(): { appearance: AskAppearance; density: "spaced" | "compact" } {
  for (const name of ["pi-egregore.json", "pi-workspace.json", "pi-footer.json"]) {
    let text: string;
    try { text = readFileSync(join(getAgentDir(), name), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; break; }
    try {
      const raw = JSON.parse(text);
      if (name !== "pi-footer.json" && raw?.version !== 1) break;
      return { appearance: readAskAppearance(raw?.ask, raw?.questionLabels) ?? askAppearanceDefaults(),
        density: raw?.density === "compact" ? "compact" : "spaced" };
    } catch { break; } // A broken primary file must not silently defer to old preferences.
  }
  return { appearance: askAppearanceDefaults(), density: "spaced" };
}
export function savedAskAppearance(): AskAppearance { return savedWorkspaceVisuals().appearance; }
