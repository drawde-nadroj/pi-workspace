import { stripVTControlCharacters } from "node:util";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { frameQuestion, questionTheme } from "./question-surface.ts";
import type { AskAppearance } from "./appearance.ts";

export type AskElementId = "frame" | "title" | "progress" | "body" | "hint";
export interface AskPreviewHit { id: AskElementId; x: number; y: number; width: number }
/** Purely synthetic: render through Ask's actual shell without opening an answer interaction. */
export function questionPreview(theme: any, width: number, appearance: AskAppearance): { rows: string[]; hits: AskPreviewHit[] } {
  const palette = questionTheme(theme, appearance);
  const text = "Which option suits this sample?";
  const hint = "Enter Select · + Note · Tab Note · Esc Back · F2 More";
  const component = {
    getHeaderLabel: () => "2 of 3",
    render: (innerWidth: number) => [
      palette.fg("text", appearance.questionText === "bold" ? palette.bold(text) : text),
      "", palette.fg("muted", "○ First option  ·  ○ Second option"),
      "", palette.fg(appearance.hints, hint),
    ].map(line => truncateToWidth(line, Math.max(0, innerWidth), "")),
  };
  const shell = frameQuestion(component, palette, { terminal: { rows: 26 }, requestRender() {} }, { appearance });
  const rows = shell.render(width);
  shell.dispose();
  if (width < 10) return { rows, hits: [] };
  const hits: AskPreviewHit[] = [];
  const labels: Array<[AskElementId, string]> = [
    ["title", ` ${appearance.title} `], ["progress", " 2 of 3 "], ["body", text], ["hint", hint],
  ];
  for (const [id, label] of labels) {
    const found: AskPreviewHit[] = [];
    for (let y = 0; y < rows.length; y++) {
      const plain = stripVTControlCharacters(rows[y]), index = plain.indexOf(label);
      if (index < 0 || plain.indexOf(label, index + label.length) >= 0) continue;
      const x = visibleWidth(plain.slice(0, index)), cells = visibleWidth(label);
      if (cells && x + cells <= width) found.push({ id, x, y, width: cells });
    }
    if (found.length === 1) hits.push(found[0]);
  }
  return { rows, hits };
}
