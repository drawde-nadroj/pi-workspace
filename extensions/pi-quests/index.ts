import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { directionLabel, handoffPaths, handoffRows, handoffText, isHandoff } from "./handoff.ts";
import { QuestStore, STATES, type Quest } from "./store.ts";
import { questSelect } from "./surface.ts";
import { questJournal } from "./journal.ts";
import { pursuitSource, taskLinks, questionLinks } from "./context.ts";
import { CONTEXT_KINDS, resumeContext } from "./continuity.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const FOCUS_ENTRY = "pi-quests:focus-v1";
export async function pursuitResume(q: Quest, ctx: ExtensionContext): Promise<string> {
  const liveTasks=taskLinks(ctx), liveQuestions=await questionLinks(ctx,q);
  const changedWork=liveTasks.some(t=>{const previous=q.taskLinks?.find(p=>p.session===t.session && p.planId===t.planId);return previous && JSON.stringify(previous.tasks)!==JSON.stringify(t.tasks);});
  const changedQuestions=liveQuestions.some(x=>{const previous=q.questionLinks?.find(p=>p.session===x.session && p.id===x.id);return !previous || previous.revision!==x.revision || JSON.stringify(previous.response)!==JSON.stringify(x.response) || previous.consequence!==x.consequence || previous.state!==x.state;});
  const displayed={...q,reviewNextMove:q.reviewNextMove || changedWork || changedQuestions,taskLinks:q.taskLinks?.map(p=>liveTasks.find(t=>t.session===p.session && t.planId===p.planId) ?? p),questionLinks:[...(q.questionLinks ?? []).filter(p=>!liveQuestions.some(x=>x.session===p.session && x.id===p.id)),...liveQuestions]};
  return resumeContext(displayed,new Set(liveQuestions.map(x=>`${x.session}:${x.entryId}:${x.id}`)),new Set(liveTasks.map(x=>`${x.session}:${x.planId}`)));
}
import { ACTIVITY_EVENT } from "../../lib/session-activity.ts";

export const GUIDANCE = `Pi Quests is a persistent landscape of possibilities, available through quests and /quests. At meaningful conversational milestones and user cues, develop grounded depth (deepen this idea) and breadth (connect it elsewhere) paths. Present depth as Deepen and breadth as Connect: foreground a meaningful name, value, concrete first move and a concise From line identifying the actual conversation, observation or supplied material that inspired it. The source explains why this path appeared; distinguish a proposed connection from a discovered fact. Usually one or two substantial paths are enough; offer more only when the conversation genuinely branches. Use quests present for one shared Where next? handoff, passing existing path IDs or unsaved inline paths. The rendered handoff is the invitation; continue with a brief conversational bridge only when it adds substance. When presentation is unavailable, use the same labelled structure in ordinary prose. Offer worthwhile paths without requiring a Tasks plan or scanning other sessions/files. Use an affirmative thought-partner voice. Save offers with quests only when they add substance; list relevant existing paths first to reuse rather than duplicate them. Offered paths are possibilities. A user's explicit request to pursue one in conversation counts as acceptance: record state active with requestMessageId and exact requestQuote, without sending another request or restarting work. Interpret the request honestly; source validation proves the quote exists, not its meaning. /quests also offers Continue in chat and Keep for later. Record meaningful progress, questions and discoveries as work develops; link the Tasks plan with planId. Define goal before recording completion and include fresh evidence against it. Present the substance of a new path, not merely a creation announcement. Develop thoughts, titles, discoveries, evidence and linked open questions through conversation. Keep factual evidence distinct from interpretation. Buffered quest questions are exploratory invitations, not obligations or execution blockers. Develop them in conversation when useful. For input or decisions needed by work, use Ask and explain why the answer matters, when it is needed, what waits and what can continue. Keep firstMove as the original invitation; record nextMove separately as the current meaningful step, refreshing it after progress or a decision instead of presenting completed work as next. Tasks owns authorized execution checklists. When Tasks supplies its completion follow-up, use that same Where next? handoff rather than a separate announcement. Respect user format and desire to finish. Quests never requires an extra model run. Maintain pursuit continuity at meaningful changes: record source-linked understanding, uncertainty, observations, decisions and artifacts with stable keys; correct a record with a new key and supersedes. These are agent reports, not independent verification. Use sync after a linked Ask answer is applied or work changes to capture current-branch consequences and Tasks snapshots; sync never applies answers or changes tasks. Resume reads a bounded orientation; focus selects a pursuit for this branch's subsequent runs without accepting or starting it. Keep nextMove current after decisions and results. Use get/history for complete evidence and answer caveats, and verify current branch prerequisites before resuming action.`;
const text = (maxLength = 4000) => Type.String({ minLength: 1, maxLength });
const Params = Type.Object({
  op: StringEnum(["list", "get", "offer", "update", "history", "context", "present", "record", "sync", "resume", "focus"] as const),
  contextKind: Type.Optional(StringEnum(CONTEXT_KINDS)), key: Type.Optional(text(200)), statement: Type.Optional(text()),
  sourceEntryId: Type.Optional(text(200)), supersedes: Type.Optional(text(200)),
  paths: Type.Optional(Type.Array(Type.Object({
    id: Type.Optional(text(100)), kind: Type.Optional(StringEnum(["depth", "breadth", "exploration"] as const)),
    title: Type.Optional(text(200)), why: Type.Optional(text()), firstMove: Type.Optional(text()), source: Type.Optional(text()),
  }), {minItems:1,maxItems:4,description:"For present: each path is either an existing id alone, or title/why/firstMove/source plus optional kind. Presentation alone never saves or starts paths."})),
  id: Type.Optional(text(100)), revision: Type.Optional(Type.Integer({ minimum: 1 })),
  view: Type.Optional(StringEnum(["workspace", "all"] as const)),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  title: Type.Optional(text(200)), why: Type.Optional(text()), firstMove: Type.Optional(text()), source: Type.Optional(text()),
  kind: Type.Optional(StringEnum(["depth", "breadth", "exploration"] as const)),
  global: Type.Optional(Type.Boolean()), state: Type.Optional(StringEnum(STATES)),
  link: Type.Optional(text(100)), evidence: Type.Optional(text()), question: Type.Optional(text()),
  questionId: Type.Optional(text(100)), answer: Type.Optional(text()),
  goal: Type.Optional(text()), progress: Type.Optional(text()), nextMove: Type.Optional(text()),
  requestMessageId: Type.Optional(text(200)), requestQuote: Type.Optional(text()), planId: Type.Optional(text(100)),
});
export function questDetail(q: Quest, related: Quest[] = []): string {
  const sections = [q.title, `Status: ${q.state} · ${q.kind}`, `Visibility: ${q.global ? "All workspaces" : `This workspace · ${q.workspace}`}`,
    `PURPOSE\n${q.why}`, `NEXT MOVE\n${q.nextMove ?? "Develop the next step together."}\nOriginal first move: ${q.firstMove}`, `GOAL\n${q.goal ?? "Still developing — define an outcome before completing this quest."}`,
    `QUESTIONS\n${q.questions.length ? q.questions.map(x=>`${x.answer ? "Answered" : "Open question"}: ${x.text}${x.answer ? `\nAnswer: ${x.answer}` : ""}`).join("\n") : "No questions recorded yet."}`,
    `DEVELOPMENTS\n${q.progress?.length ? q.progress.slice(-5).join("\n") : "No progress recorded yet."}`,
    `DISCOVERIES\n${q.evidence.length ? q.evidence.slice(-5).join("\n") : "No evidence recorded yet."}`,
    `LINKED TASKS\n${q.taskLinks?.length ? q.taskLinks.map(p=>`${p.title} · ${p.planId}\nSnapshot ${p.capturedAt} · session ${p.session}\n${p.tasks.map(t=>`  ${t.status}: ${t.title}`).join("\n")}`).join("\n\n") : "No Tasks plan linked yet. Conversation can develop a quest without one."}`,
    `CONNECTIONS\n${q.links.length ? q.links.map(id=>{const other=related.find(x=>x.id===id); return other ? `${other.title} · ${other.state}\n${other.why}` : id;}).join("\n") : "No connected paths recorded yet."}`,
    `ORIGIN\n${q.origin.source}\nSession: ${q.origin.session}\nWorkspace: ${q.workspace}`,
    q.pursuit ? `PURSUIT\n${q.pursuit.quote}\nSource: ${q.pursuit.session} / ${q.pursuit.messageId}` : "",
    "ACTIONS\nContinue sends a new chat request. Keep for later saves quietly. Visibility changes where this appears, not its origin."];
  return sections.filter(Boolean).join("\n\n");
}
export default function quests(pi: ExtensionAPI) {
  const store = new QuestStore(join(getAgentDir(), "quests", "journal.sqlite"));
  const publish = (q: Quest, session: string, label: string, discovery = false) => {
    pi.events.emit(ACTIVITY_EVENT, {version:1,session,key:`quest:${q.id}:${q.revision}`,at:q.updatedAt,kind:discovery ? "discovery" : "quest",title:`${label}: ${q.title}`,summary:q.why,sourceId:q.id});
    return q;
  };
  pi.registerTool({
    name: "quests", label: "Quests", description: `${GUIDANCE} list returns 20 summaries and revisions; get reads detail; offer requires title/why/firstMove/source and always creates an offered path. update requires id/revision and can refine, link another quest, add evidence or buffer/answer a question. context returns the current branch's recent user messages with IDs and Tasks plans, for source linking. Conversational pursuit uses state active plus requestMessageId and requestQuote from an explicit user request on this branch. planId links a current-session Tasks plan. goal defines closure; progress records developments; nextMove records the current next step separately from the original firstMove; completion needs fresh evidence. Keep-for-later/Decline remain user actions in /quests. history reads 20 snapshots per page. present displays one to four paths in a shared jade/gold Where next? surface: paths contain existing id-only references or unsaved title/why/firstMove/source with optional kind. It is read-only, adds no journal/activity records, and starts no work. Call present directly so its own renderer can display the handoff. record requires id/revision/key/contextKind/statement/source; sourceEntryId optionally references an existing branch entry. References are agent-supplied unless an entry is validated; validation establishes existence, not truth. Reusing the same key and exact content is a safe no-op; supersedes preserves corrections. sync requires id/revision and snapshots only already-linked current-branch Tasks and Ask records. resume requires id, reads bounded context without writes or work; focus also selects that pursuit as branch-local context, without changing quest state or sending a request; focus without id clears that selection.`,
    parameters: Params,
    async execute(_id, p, _signal, _update, ctx) {
      let result: unknown;
      if (p.op === "present") {
        const handoff = handoffPaths(p.paths, id => store.get(id));
        return {content:[{type:"text",text:handoffText(handoff)}],details:handoff};
      }
      if (["record","sync","resume","focus"].includes(p.op)) {
        if (p.op === "focus" && !p.id) {
          pi.appendEntry(FOCUS_ENTRY,{version:1,id:null});
          return {content:[{type:"text",text:"Pursuit focus cleared for this branch. Quest records are unchanged."}],details:undefined};
        }
        if (!p.id) throw new Error("Quest id required");
        const q=store.get(p.id);
        if (p.op === "resume" || p.op === "focus") {
          const orientation=await pursuitResume(q,ctx);
          if (p.op === "focus") pi.appendEntry(FOCUS_ENTRY,{version:1,id:q.id});
          return {content:[{type:"text",text:orientation}],details:undefined};
        }
        if (p.revision === undefined) throw new Error("Read the quest revision first");
        let outcome;
        if (p.op === "record") {
          if (!p.key || !p.contextKind || !p.statement || !p.source) throw new Error("Record needs key, contextKind, statement and source");
          if (p.sourceEntryId && !ctx.sessionManager.getBranch().some(e=>e.id===p.sourceEntryId)) throw new Error("Source entry is not on the current branch");
          outcome=store.record(q.id,p.revision,{key:p.key,kind:p.contextKind,text:p.statement,source:{session:ctx.sessionManager.getSessionId(),reference:p.source,...(p.sourceEntryId ? {entryId:p.sourceEntryId} : {})},supersedes:p.supersedes});
        } else {
          const linked=taskLinks(ctx).filter(p=>q.taskLinks?.some(x=>x.session===p.session && x.planId===p.planId));
          outcome=store.sync(q.id,p.revision,linked,await questionLinks(ctx,q));
        }
        if (outcome.changed) publish(outcome.quest,ctx.sessionManager.getSessionId(),p.op === "record" ? "Understanding developed" : "Work context refreshed");
        return {content:[{type:"text",text:JSON.stringify(outcome)}],details:undefined};
      }
      if (p.op === "context") {
        result = {session:ctx.sessionManager.getSessionId(),plans:taskLinks(ctx),requests:ctx.sessionManager.getBranch().filter(e=>e.type === "message" && e.message.role === "user").slice(-10).map(e=>({id:e.id,...(e.type === "message" && e.message.role === "user" ? {content:e.message.content} : {})}))};
      } else if (p.op === "list") {
        const all = store.list(p.view === "all" ? undefined : ctx.cwd), offset = p.offset ?? 0;
        result = { total: all.length, offset, quests: all.slice(offset, offset + 20).map(q => ({ id: q.id, revision: q.revision, title: q.title, kind: q.kind, state: q.state, global: q.global, openQuestions: q.questions.filter(x => !x.answer).length })) };
      } else if (p.op === "offer") {
        if (!p.title || !p.why || !p.firstMove || !p.source) throw new Error("Offer needs title, why, firstMove and source");
        result = store.offer({ title:p.title, why:p.why, firstMove:p.firstMove, source:p.source, kind:p.kind, global:p.global, goal:p.goal }, ctx.cwd, ctx.sessionManager.getSessionId());
      } else {
        if (!p.id) throw new Error("Quest id required");
        if (p.op === "get") result = store.get(p.id);
        else if (p.op === "history") result = store.history(p.id, p.offset);
        else {
          if (p.revision === undefined) throw new Error("Read the quest revision first");
          const pursuit = p.requestMessageId && p.requestQuote ? pursuitSource(ctx, p.requestMessageId, p.requestQuote) : undefined;
          const taskLink = p.planId ? taskLinks(ctx).find(x=>x.planId === p.planId) : undefined;
          if (p.planId && !taskLink) throw new Error("Plan not found on this session branch.");
          result = store.update(p.id, p.revision, {...p, pursuit, taskLink}, "agent");
        }
      }
      if (p.op === "offer" || p.op === "update") publish(result as Quest, ctx.sessionManager.getSessionId(), p.op === "offer" ? "Path offered" : p.question ? "Question added" : p.answer ? "Question answered" : p.evidence ? "Evidence recorded" : p.state === "active" ? "Quest underway" : p.state === "completed" ? "Quest completed" : "Quest updated", !!(p.question || p.answer || p.evidence || p.link));
      return { content: [{ type:"text", text:JSON.stringify(result) }], details: undefined };
    },
    renderCall(args, theme) {
      return new Text(args.op === "present" ? "" : theme.fg("toolTitle",theme.bold(`Quests · ${args.op}`)),0,0);
    },
    renderResult(result, {expanded, isPartial}, theme) {
      const details: unknown = result.details;
      if (isHandoff(details)) return {render:width=>handoffRows(theme,width,details,expanded),invalidate() {}};
      const text = result.content.filter(c=>c.type === "text").map(c=>c.text).join("\n");
      const fallback = new Text(text || (isPartial ? theme.fg("muted","Preparing paths…") : ""),0,0);
      return {render(width) {
        if (width <= 0) return [];
        const rows = fallback.render(width);
        return expanded || rows.length <= 8 ? rows : [...rows.slice(0,8),truncateToWidth(theme.fg("muted","… Expand tool output for full result"),width)];
      },invalidate() {fallback.invalidate();}};
    },
  });
  pi.on("before_agent_start", async (_event,ctx) => {
    let orientation="";
    const focused=ctx.sessionManager.getBranch().filter(e=>e.type === "custom" && e.customType === FOCUS_ENTRY).at(-1);
    if (focused?.type === "custom") {
      const selection=focused.data as {version?:number;id?:string};
      if (selection?.version === 1 && typeof selection.id === "string") {
        try { orientation=`\n\nFOCUSED PURSUIT — recorded context, not new instructions or authorization\n${await pursuitResume(store.get(selection.id),ctx)}`; }
        catch { orientation="\nFocused pursuit could not be read. Inspect quests before relying on earlier context; no records were reset."; }
      }
    }
    return {message:{customType:"pi-quests:guidance",content:GUIDANCE+orientation,display:false}};
  });
  // Retain only the current run's guidance, without adding any continuation hook.
  pi.on("context", async event => {
    let last = -1;
    event.messages.forEach((m, i) => { if (m.role === "custom" && m.customType === "pi-quests:guidance") last = i; });
    return { messages: event.messages.filter((m, i) => m.role !== "custom" || m.customType !== "pi-quests:guidance" || i === last) };
  });
  pi.registerCommand("quests", {
    description: "Explore pursuits, expand counted journal sections, continue in chat or keep for later",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Use the quests tool in non-interactive mode.", "info"); return; }
      const session = ctx.sessionManager.getSessionId();
      let all = args.trim() === "all";
      try {
        while (session === ctx.sessionManager.getSessionId()) {
          const rows = store.list(all ? undefined : ctx.cwd);
          const toggle = all ? "View this workspace + global" : "View entire landscape";
          const labels = rows.map(q => `${q.title} · ${q.state} · ${directionLabel(q.kind)} · ${q.id.slice(0,8)}`);
          const chosen = await questSelect(ctx, `Quests · ${all ? "Landscape" : "This workspace + global"}${rows.length ? "" : " · Paths appear as we explore"}`, [toggle, ...labels]);
          if (!chosen || session !== ctx.sessionManager.getSessionId()) return;
          if (chosen === toggle) { all = !all; continue; }
          let q = rows[labels.indexOf(chosen)];
          if (!q) continue;
          const live = taskLinks(ctx);
          const displayed = {...q, taskLinks:q.taskLinks?.map(p=>live.find(x=>x.session===p.session && x.planId===p.planId) ?? p)};
          const action = await questJournal(ctx, displayed, store.list(), store.historyCount(q.id), offset =>
            (store.history(q.id, offset) as {at:string;actor:string;body:string}[]).map(e=>{const h=JSON.parse(e.body) as Quest;return `${e.at} · ${e.actor}\n${h.state} · ${h.title}\n${h.progress?.at(-1) ?? h.why}\n${h.evidence.at(-1) ?? ""}`;}).join("\n\n"));
          if (!action || action === "Back" || session !== ctx.sessionManager.getSessionId()) continue;
          if (action === "Resume overview") {
            await questSelect(ctx,await pursuitResume(q,ctx),["Back"],"Resume pursuit"); continue;
          }
          if (action === "History") {
            let offset = 0;
            while (session === ctx.sessionManager.getSessionId()) {
              const events = store.history(q.id, offset) as {at:string;actor:string;body:string}[];
              const detail = events.map(e=>{const h=JSON.parse(e.body) as Quest; return `${e.at} · ${e.actor}\n${h.state} · ${h.title}\n${h.pursuit?.quote ?? ""}\n${h.progress?.at(-1) ?? ""}\n${h.evidence.at(-1) ?? ""}`;}).join("\n\n");
              const next = await questSelect(ctx, `HISTORY · newest first\n${detail}`, [...(events.length===20 ? ["Older entries"] : []), "Back"]);
              if (next !== "Older entries") break; offset += 20;
            }
            continue;
          }
          if (action === "Connections") {
            const linked=store.list().filter(x=>q.links.includes(x.id));
            await questSelect(ctx, `CONNECTIONS\n${linked.length ? linked.map(x=>questDetail(x)).join("\n\n") : "No connected paths yet. Develop a direction in conversation and link it here."}`, ["Back"]); continue;
          }
          if (action === "Questions") {
            const options = q.questions.map(x => `${x.answer ? "Answered" : "Open"}: ${x.text} · ${x.id.slice(0,8)}`);
            const choice = await questSelect(ctx, "Buffered questions", ["Add a question", ...options]);
            if (!choice) continue;
            if (choice === "Add a question") {
              const question = await ctx.ui.input("A question to explore later");
              if (question?.trim() && session === ctx.sessionManager.getSessionId()) publish(store.update(q.id, q.revision, { question }, "user"), session, "Question added", true);
            } else {
              const question = q.questions[options.indexOf(choice)];
              if (!question) continue;
              const answer = await ctx.ui.editor(question.text, question.answer ?? "");
              if (answer?.trim() && session === ctx.sessionManager.getSessionId()) publish(store.update(q.id, q.revision, { questionId:question.id, answer }, "user"), session, "Question answered", true);
            }
            continue;
          }
          if (action === "Continue in chat") {
            if (!ctx.isIdle()) { ctx.ui.notify("Start this path once the current run finishes.", "info"); continue; }
            q = publish(store.update(q.id, q.revision, { state:"active" }, "user"), session, "Quest underway");
            pi.appendEntry(FOCUS_ENTRY,{version:1,id:q.id});
            pi.sendUserMessage(`Continue this quest with me. Use quests resume for its current position, inspect relevant evidence and linked work, then develop the next useful move without repeating completed work.\nQuest: ${q.id}\nTitle: ${q.title}`);
            return;
          }
          publish(store.update(q.id, q.revision, action === "Show in all workspaces" || action === "Show only in original workspace" ? { global:action === "Show in all workspaces" } : { state: action === "Keep for later" ? "saved" : action === "Pause" ? "paused" : "declined" }, "user"), session, "Quest updated");
        }
      } catch (error) { ctx.ui.notify(`Quests: ${error instanceof Error ? error.message : String(error)}`, "error"); }
    },
  });
}
