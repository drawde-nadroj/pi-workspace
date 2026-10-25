export const ACTIVITY_EVENT = "pi-workspace:session-activity-v1";
export const ACTIVITY_ENTRY = "pi-workspace:session-activity-v1";
export interface SessionActivity {
  version: 1; session: string; key: string; at: string; kind: "quest" | "discovery" | "tasks";
  title: string; summary: string; sourceId: string;
}
export function isActivity(value: unknown): value is SessionActivity {
  const v = value as SessionActivity;
  return !!v && v.version === 1 && ["quest","discovery","tasks"].includes(v.kind)
    && [v.session,v.key,v.at,v.title,v.summary,v.sourceId].every(x=>typeof x === "string" && x.length <= 8000)
    && Number.isFinite(Date.parse(v.at));
}
