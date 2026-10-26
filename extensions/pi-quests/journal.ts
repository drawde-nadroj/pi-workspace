import { basename } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Quest } from "./store.ts";
import { questSelect } from "./surface.ts";
import { directionLabel } from "./handoff.ts";
import { currentContext } from "./continuity.ts";

const taskWord = (status: string) => ({done:"✓ Done",active:"● In progress",blocked:"! Waiting",pending:"○ Not started",cancelled:"– Cancelled"}[status] ?? status);
const ownerWord = (owner?: string) => owner === "user" ? "Needs your input" : owner === "agent" ? "Agent to resolve" : owner === "external" ? "Waiting externally" : "Waiting";
const brief = (text: string, limit = 240) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat; };
export function questOverview(q: Quest): string {
  const tasks = (q.taskLinks ?? []).flatMap(p=>p.tasks);
  const blockers = tasks.filter(t=>t.status === "blocked");
  const latest = q.progress?.at(-1);
  return [q.title, `${q.state} · ${q.intent === "explore" ? "Exploring" : q.intent === "make" ? "Making within agreed scope" : q.intent === "keep" ? "Kept for later" : "Intent not recorded"} · ${q.global ? "All workspaces" : basename(q.workspace)} · ${directionLabel(q.kind)}`,
    latest ? `NOW\n${brief(latest)}` : `PURPOSE\n${brief(q.why)}`,
    q.nextMove ? `NEXT MOVE\n${brief(q.nextMove)}` : q.state === "offered" || q.state === "saved" ? `FIRST MOVE\n${brief(q.firstMove)}` : "NEXT MOVE\nDevelop the next step together in chat.",
    ...blockers.slice(0, 2).map(t=>`! ${ownerWord(t.blockerOwner)} · ${brief(t.title,100)}${t.reason ? ` · ${brief(t.reason,140)}` : " · reason not in this snapshot"}`),
    blockers.length > 2 ? `! ${blockers.length - 2} more waiting · expand Work` : "",
    q.taskLinks?.length ? "Work uses dated snapshots; this session's links refresh on opening." : "",
  ].filter(Boolean).join("\n");
}
export function journalSections(q: Quest, related: Quest[], historyCount: number) {
  const tasks = (q.taskLinks ?? []).flatMap(p=>p.tasks), open = q.questions.filter(x=>!x.answer).length;
  const possibilities = related.filter(x=>q.links.includes(x.id) && (x.state === "offered" || x.state === "saved"));
  const connections = q.links.filter(id=>!possibilities.some(x=>x.id===id));
  return [
    {id:"possibilities", label:`Possible directions · ${possibilities.length}`, text:possibilities.map(x=>`${x.title} · ${x.state === "saved" ? "Kept for later" : "Offered possibility"}\n${x.why}\nFirst move: ${x.firstMove}\nFrom: ${x.origin.source}\nQuest: ${x.id}`).join("\n\n") || "Meaningful possibilities developed in conversation can be linked here. Keeping an idea does not begin work."},
    {id:"work", label:`Work · ${tasks.length ? `${tasks.filter(t=>t.status === "done").length}/${tasks.length} done${tasks.some(t=>t.status === "blocked") ? ` · ${tasks.filter(t=>t.status === "blocked").length} waiting` : ""}` : "none linked"}`, text:(q.taskLinks ?? []).map(p=>`${p.title}\nSnapshot: ${p.capturedAt}\n${p.tasks.map((t,i)=>`${i===p.tasks.length-1 ? "└─" : "├─"} ${taskWord(t.status)} · ${t.title}${t.reason ? `\n   ${ownerWord(t.blockerOwner)}: ${t.reason}` : ""}${t.unblockWhen ? `\n   To continue: ${t.unblockWhen}` : ""}`).join("\n")}`).join("\n\n") || "A conversation can develop a quest without a task plan."},
    {id:"questions", label:`Questions · ${q.questions.length ? `${open} open · ${q.questions.length-open} answered` : "none yet"}`, text:q.questions.map(x=>`${x.answer ? "Answered" : "Explore"}: ${x.text}${x.answer ? `\nAnswer: ${x.answer}` : ""}`).join("\n\n") || "Questions here are invitations to explore. Decisions needed for work appear through Ask."},
    {id:"understanding", label:`Understanding · ${currentContext(q).length} current records`, text:currentContext(q).map(r=>`${r.kind.toUpperCase()} · ${r.key}\n${r.text}\nSource: ${r.source.reference}\n${r.source.session}${r.source.entryId ? ` / ${r.source.entryId}` : ""}${r.supersedes ? `\nCorrects: ${r.supersedes}` : ""}`).join("\n\n") || "Record observations, interpretations, uncertainty, decisions and artifacts as the pursuit develops."},
    {id:"decisions", label:`Linked decisions · ${q.questionLinks?.length ?? 0} questions`, text:(q.questionLinks ?? []).map(x=>`${x.id} · ${x.state} · revision ${x.revision}\n${x.question}\n${x.consequence ? `Reported consequence: ${x.consequence}\n` : ""}${x.response ? `Answer and caveats: ${JSON.stringify(x.response)}\n` : ""}Snapshot: ${x.capturedAt}\nSource: ${x.session} / ${x.entryId}\nPlan: ${x.planId} · ${x.taskIds.join(", ") || "plan-wide"}`).join("\n\n") || "Linked Ask questions appear after quests sync. Delivery, reported application and task completion remain distinct."},
    {id:"history", label:`History · ${historyCount} records`, text:""},
    {id:"evidence", label:`Evidence · ${q.evidence.length} ${q.evidence.length === 1 ? "item" : "items"}`, text:q.evidence.join("\n\n") || "Evidence and discoveries will appear as the pursuit develops."},
    {id:"connections", label:`Connections · ${connections.length} paths`, text:connections.map(id=>{const other=related.find(x=>x.id===id);return other ? `${other.title} · ${other.state}\n${other.why}` : `Unavailable path · ${id}`;}).join("\n\n") || "Connections will appear as related paths develop."},
    {id:"purpose", label:"Purpose · goal and original first move", text:`${q.why}\n\nGOAL\n${q.goal ?? "Still developing"}\n\nORIGINAL FIRST MOVE\n${q.firstMove}`},
    {id:"source", label:"Source · origin and references", text:`${q.origin.source}\n\nWorkspace: ${q.workspace}\nSession: ${q.origin.session}\nCreated: ${q.createdAt}\nUpdated: ${q.updatedAt}${q.pursuit ? `\n\nPursuit: ${q.pursuit.quote}\n${q.pursuit.session} / ${q.pursuit.messageId}` : ""}`},
  ];
}
/** Read-only disclosure state. Choosing an action returns to the state-owning command. */
export async function questJournal(ctx: ExtensionContext, q: Quest, related: Quest[], historyCount: number, history: (offset: number)=>string): Promise<string | undefined> {
  const sections = journalSections(q, related, historyCount);
  let expanded: string | undefined, selected: string | undefined, offset = 0;
  const session = ctx.sessionManager.getSessionId();
  while (session === ctx.sessionManager.getSessionId()) {
    const section = sections.find(s=>s.id === expanded);
    const labels = sections.map(s=>`${s.id === expanded ? "▾" : "▸"} ${s.label}`);
    const older = expanded === "history" && offset + 20 < historyCount;
    const detail = section ? `\n\n${section.label.toUpperCase()}\n${section.id === "history" ? history(offset) : section.text}` : "";
    const choices = ["Explore in chat", "Resume overview", "Keep for later", ...labels, ...(older ? ["Older history"] : []), ...(offset && expanded === "history" ? ["Newest history"] : []), ...(expanded === "questions" ? ["Edit exploratory questions"] : []), "More actions", "Back"];
    const title = section ? `${q.title}\n${q.state} · ${q.global ? "All workspaces" : basename(q.workspace)}` : questOverview(q);
    const chosen = await questSelect(ctx, title + detail, choices, "Quests", {selected, maxChoices: 12});
    if (session !== ctx.sessionManager.getSessionId()) return undefined;
    const index = labels.indexOf(chosen ?? "");
    if (index >= 0) { expanded = expanded === sections[index].id ? undefined : sections[index].id; selected = `${expanded ? "▾" : "▸"} ${sections[index].label}`; offset=0; continue; }
    if (chosen === "Older history" || chosen === "Newest history") { offset = chosen === "Older history" ? offset+20 : 0; selected=chosen; continue; }
    if (chosen === "Edit exploratory questions") return "Questions";
    if (chosen === "More actions") return questSelect(ctx, "Quest actions\nExplore sends a conversational inquiry, not an implementation request. Keep for later saves quietly. Visibility keeps the original source.", ["Questions", q.global ? "Show only in original workspace" : "Show in all workspaces", "Pause", "Decline", "Back"]);
    return chosen;
  }
}
