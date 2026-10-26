import type { Quest } from "./store.ts";

export const CONTEXT_KINDS = ["understanding", "uncertainty", "decision", "artifact", "observation"] as const;
export type ContextKind = typeof CONTEXT_KINDS[number];
export interface ContextSource { session: string; entryId?: string; reference: string }
export interface ContextInput { key: string; kind: ContextKind; text: string; source: ContextSource; supersedes?: string }
export interface ContextRecord extends ContextInput { version: 1; at: string }
const clean = (value: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x08\x0b-\x1f\x7f]/.test(value)) throw new Error("Invalid pursuit context text");
  return value.trim();
};
/** Immutable statements; corrections explicitly supersede a previous statement. */
export function contextRecord(input: ContextInput, at: string): ContextRecord {
  if (!CONTEXT_KINDS.includes(input.kind)) throw new Error("Unknown pursuit context kind");
  return {version:1,key:clean(input.key,200),kind:input.kind,text:clean(input.text,4000),source:{session:clean(input.source.session,200),reference:clean(input.source.reference,2000),...(input.source.entryId ? {entryId:clean(input.source.entryId,200)} : {})},...(input.supersedes ? {supersedes:clean(input.supersedes,200)} : {}),at};
}
export function currentContext(q: Quest): ContextRecord[] {
  const records = q.contextRecords ?? [];
  const replaced = new Set(records.map(r=>r.supersedes).filter(Boolean));
  return records.filter(r=>!replaced.has(r.key));
}
const brief = (text: string, max = 600) => text.length > max ? `${text.slice(0,max-1)}…` : text;
/** Bounded orientation, not execution authority. Full records remain available via get/history. */
export function resumeContext(q: Quest, currentQuestionSources: ReadonlySet<string> = new Set(), currentTaskSources: ReadonlySet<string> = new Set()): string {
  const records = currentContext(q);
  const sections = CONTEXT_KINDS.map(kind=> {
    const entries=records.filter(r=>r.kind===kind);
    return entries.length ? `${kind.toUpperCase()} (${entries.length})\n${entries.slice(-3).map(r=>`${brief(r.text)}\nSource: ${brief(r.source.reference,200)} · ${r.source.session}${r.source.entryId ? ` / ${r.source.entryId}` : ""}`).join("\n")}` : "";
  });
  const orientation = [ `${q.title} · ${q.state} · revision ${q.revision}`, `INTENT\n${q.intent === "keep" ? "Kept for later; no work started." : q.intent === "explore" ? "Exploring in conversation; implementation needs separate agreement." : q.intent === "make" ? "Making within the sourced request's scope; this record is not renewed authorization." : "Not recorded. Clarify current intent before inferring implementation scope."}`, `PURPOSE\n${brief(q.why)}`,
    `CURRENT POSITION\n${brief(q.progress?.at(-1) ?? "No development recorded yet.")}`,
    ...sections,
    ...(q.reviewNextMove ? ["REASSESS NEXT MOVE\nLinked work or decisions changed after the next move was recorded. Review it before continuing."] : []),
    `NEXT MOVE\n${brief(q.nextMove ?? ((q.state === "offered" || q.state === "saved") ? q.firstMove : "Develop the next step together; account for completed work."))}`,
    `GOAL\n${brief(q.goal ?? "Still developing.")}`,
    `OPEN EXPLORATORY QUESTIONS (${q.questions.filter(x=>!x.answer).length})\n${q.questions.filter(x=>!x.answer).slice(-3).map(x=>brief(x.text,300)).join("\n") || "None recorded."}`,
    `WORK SNAPSHOTS\n${(q.taskLinks ?? []).slice(-3).map(p=>`${currentTaskSources.has(`${p.session}:${p.planId}`) ? "Current branch" : "Historical snapshot"} · ${p.title} · ${p.planId} · session ${p.session} · captured ${p.capturedAt}\n${p.tasks.filter(t=>t.status !== "done" && t.status !== "cancelled").slice(0,3).map(t=>`${t.status}: ${brief(t.title,160)}${t.reason ? ` — ${brief(t.reason,200)}` : ""}`).join("\n")}\n${p.tasks.filter(t=>t.status === "done").length}/${p.tasks.length} done`).join("\n") || "No linked plan."}`,
    `LINKED DECISIONS (${q.questionLinks?.length ?? 0})\n${(q.questionLinks ?? []).slice(-4).map(x=>`${x.id}: ${brief(x.question,250)}\n${currentQuestionSources.has(`${x.session}:${x.entryId}:${x.id}`) ? "Current branch" : "Historical snapshot"} · ${x.state} · revision ${x.revision}${x.consequence ? `\nReported consequence: ${brief(x.consequence,500)}` : ""}\nSource: ${x.session} / ${x.entryId} · plan ${x.planId} · ${x.taskIds.join(", ") || "plan-wide"}${x.response ? "\nAnswer and caveats: use question_queue list for current-branch answers, or quests get for stored snapshots. Reconcile current Ask before acting." : ""}`).join("\n\n") || "None linked."}`,
    `SOURCE\n${brief(q.origin.source,400)}`,
    `Read-only orientation. Historical snapshots are not live cross-session status or renewed authorization. Inspect full records with quests get (${q.id}) and history; refresh current branch work before acting.`,
  ].filter(Boolean).join("\n\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  return orientation.length <= 16000 ? orientation : `${orientation.slice(0,15500)}\n\nOrientation truncated. Read quests get/history (${q.id}) for complete sources and caveats. Historical context is not renewed authorization.`;
}
