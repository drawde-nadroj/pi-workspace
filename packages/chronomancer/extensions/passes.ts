import type { Entry } from "./journal.ts";

/** Writing colors are depths 2–5. A pass visits only existing parents of
 * that depth. Red roots stay dormant when no orange child has been saved. */
export function passRoute(entries: Entry[], childDepth: number): string[] {
  if (!Number.isInteger(childDepth) || childDepth < 2 || childDepth > 5) return [];
  const rootOrder = new Map(entries.filter(entry => entry.depth === 1).map((entry, i) => [entry.id, i]));
  const byEntry = new Map(entries.map((entry, i) => [entry.id, i]));
  const direction = childDepth % 2 === 0 ? -1 : 1;
  return entries.filter(entry => entry.depth === childDepth - 1 && rootOrder.has(entry.root))
    .sort((a, b) => direction * ((rootOrder.get(a.root)! - rootOrder.get(b.root)!) ||
      (byEntry.get(a.id)! - byEntry.get(b.id)!)))
    .map(entry => entry.id);
}

export function writingColor(depth: number) {
  return ["", "RED", "ORANGE", "YELLOW", "GREEN", "BLUE"][depth] ?? "";
}
