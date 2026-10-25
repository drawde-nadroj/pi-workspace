import { cleanText, type DockRow } from "pi-agent-contracts/dock";
import { unresolved, type QuestionProjection } from "pi-agent-contracts/posted";
import type { Plan, Task } from "./state.ts";
import { questionAttention, workWord } from "./typography.ts";

const short = (value: string, max = 100) => {const chars = Array.from(cleanText(value));return chars.length > max ? chars.slice(0,max-1).join("") + "…" : chars.join("");};
/** Compact sourced attention groups. Full task prose remains in /tasks, answers in Ask. */
export function attentionDockRows(plan: Plan, running: boolean, questions: QuestionProjection[], planId: string): {rows: DockRow[]; hint: string} {
  const open = questions.filter(unresolved);
  const needing = open.filter(q=>q.state === "awaiting" && q.urgency === "blocking").sort((a,b)=>Number(b.planId===planId)-Number(a.planId===planId));
  const followup = open.filter(q=>q.state === "delivered" || q.state === "submitted");
  const later = open.filter(q=>q.state === "awaiting" && q.urgency === "deferred");
  const rows: DockRow[] = [];
  function questionGroup(qs: QuestionProjection[], label?: string) {
    if (!qs.length) return;
    const q = qs[0], linked = q.planId === planId ? q.taskIds.filter(id=>plan.tasks.some(t=>t.id===id && !["done","cancelled"].includes(t.status))).length : 0;
    rows.push({text:`? ${label ?? questionAttention(q)} · ${q.id}${linked ? ` → ${linked} task${linked===1 ? "" : "s"}` : ""}${qs.length>1 ? ` (+${qs.length-1} questions)` : ""} · ${q.planId && q.planId!==planId ? `Other plan ${q.planId}: ` : ""}${short(q.question)}`,tone: q.state === "awaiting" && q.urgency === "blocking" ? "warning" : "muted"});
  }
  questionGroup(needing,"Your input");
  // Submitted and delivered remain visibly distinct even when both exist.
  questionGroup(followup.filter(q=>q.state === "delivered"));
  questionGroup(followup.filter(q=>q.state === "submitted"));
  const active = plan.tasks.filter(t=>t.status === "active");
  for (const t of active) rows.push({text:`● Agent ${workWord("active",running).toLowerCase()} · ${short(t.title)}`,tone:"accent"});
  const blocked = plan.tasks.filter(t=>t.status === "blocked");
  const covered = new Set(open.filter(q=>q.planId===planId).flatMap(q=>q.taskIds));
  const groups: Array<[string, Task[], DockRow["tone"]]> = [
    ["Waiting externally", blocked.filter(t=>t.blockerOwner === "external"),"muted"],
    ["Agent to resolve", blocked.filter(t=>t.blockerOwner === "agent"),"text"],
    ["Needs your input", blocked.filter(t=>t.blockerOwner === "user" && !covered.has(t.id)),"warning"],
    ["Waiting · owner unspecified", blocked.filter(t=>!t.blockerOwner),"warning"],
  ];
  for (const [label,tasks,tone] of groups) if (tasks.length) {
    const t = tasks[0];
    rows.push({text:`! ${label} · ${tasks.length} task${tasks.length===1 ? "" : "s"} · ${short(t.unblockWhen || t.reason || t.title)}`,tone});
  }
  const pending = plan.tasks.filter(t=>t.status === "pending");
  const dependent = pending.filter(t=>t.dependsOn.some(id=>plan.tasks.find(p=>p.id===id)?.status !== "done"));
  const independent = pending.filter(t=>!dependent.includes(t));
  if (dependent.length) rows.push({text:`○ Waiting on work · ${dependent.length} task${dependent.length===1 ? "" : "s"} · ${short(dependent[0].title)}`,tone:"muted"});
  if (independent.length) rows.push({text:`○ Not started · ${independent.length} task${independent.length===1 ? "" : "s"} · ${short(independent[0].title)}`,tone:"muted"});
  questionGroup(later,"Your perspective · can wait");
  const answer = needing[0] ?? later[0];
  return {rows,hint:answer ? `/questions ${answer.id} · /tasks details` : "/tasks details"};
}
