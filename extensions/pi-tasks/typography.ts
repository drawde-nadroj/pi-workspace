/** Tasks-owned visual vocabulary shared by transcript and native browser, not application state. */
export type StatusMark = { glyph: string; tone: "muted" | "accent" | "warning" | "success"; label: string };
export const WORK_STATUS: Readonly<Record<string, StatusMark>> = {
  done: { glyph: "✓", tone: "success", label: "Complete" },
  active: { glyph: "●", tone: "accent", label: "Active" },
  blocked: { glyph: "!", tone: "warning", label: "Blocked" },
  pending: { glyph: "○", tone: "muted", label: "Not started" },
  cancelled: { glyph: "–", tone: "muted", label: "Cancelled" },
};
export const REQUEST_STATUS: Readonly<Record<string, StatusMark>> = {
  uncovered: { glyph: "!", tone: "warning", label: "Needs linked work" },
  open: { glyph: "○", tone: "muted", label: "Work remaining" },
  "needs disposition": { glyph: "!", tone: "warning", label: "Needs review" },
  "reported done": { glyph: "✓", tone: "success", label: "Reported complete" },
  superseded: { glyph: "–", tone: "muted", label: "Superseded" },
};
