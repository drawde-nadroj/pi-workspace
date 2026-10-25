import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { parseColor, truncateToWidth } from "@earendil-works/pi-tui";
import { ACTIVITY_ENTRY, ACTIVITY_EVENT, isActivity, type SessionActivity } from "../../lib/session-activity.ts";
const QUEST_PALETTES = {dark:{jade:"#65D6AD",gold:"#E8C879"},light:{jade:"#006B50",gold:"#805800"}};
import { clean, type FooterPrefs } from "./footer-state.ts";

export function activityLines(events: SessionActivity[], prefs: FooterPrefs, theme: Theme, width: number): string[] {
  if (prefs.sessionActivity === "off" || !events.length || width < 12) return [];
  const palette=QUEST_PALETTES[theme.appearance === "light" ? "light" : "dark"];
  const rows=events.slice(-(prefs.sessionActivity === "expanded" ? 3 : 1)).reverse();
  return [theme.fg("muted", `Session activity · ${events.length} updates · /activity to expand`), ...rows.map(e=>{
    const text=clean(e.title);
    return prefs.activityColor === "theme" ? theme.fg("text", text) : e.kind === "tasks" ? theme.fg("accent",text) : theme.style(text,{fg:parseColor(e.kind === "discovery" ? palette.gold : palette.jade)});
  })].map(s=>truncateToWidth(s,width));
}

export function registerSessionActivity(pi: ExtensionAPI, current: ()=>ExtensionContext | undefined, refresh: ()=>void) {
  let events: SessionActivity[]=[];
  const restore=(ctx:ExtensionContext)=>{
    const found=ctx.sessionManager.getBranch().filter(e=>e.type === "custom" && e.customType === ACTIVITY_ENTRY).map(e=>(e as {data:unknown}).data).filter(isActivity).filter(e=>e.session===ctx.sessionManager.getSessionId());
    events=Array.from(new Map(found.map(e=>[e.key,e])).values()).slice(-200);
  };
  pi.events.on(ACTIVITY_EVENT, value=>{
    const ctx=current();
    if (!ctx || !isActivity(value) || value.session!==ctx.sessionManager.getSessionId() || events.some(e=>e.key===value.key)) return;
    pi.appendEntry(ACTIVITY_ENTRY, value);
    events=[...events,value].slice(-200);refresh();
  });
  pi.registerCommand("activity",{
    description:"Expand this session's quest and task updates; inspect their sources",
    handler:async (_args,ctx)=>{
      if (!ctx.hasUI) return;
      const session=ctx.sessionManager.getSessionId();
      restore(ctx);
      const rows=[...events].reverse();
      const labels=rows.map((e,i)=>`${i+1}. ${e.title} · ${e.at}`);
      const selected=await ctx.ui.select("Session activity · newest first",labels.length ? labels : ["No recorded updates in this session"]);
      if (!selected || session!==ctx.sessionManager.getSessionId()) return;
      const e=rows[labels.indexOf(selected)];if (!e) return;
      try {
        // Optional siblings load only when inspecting a source, never during Egregore startup.
        const { questSelect } = await import("../pi-quests/surface.ts");
        let source:string;
        if (e.kind === "tasks") {
          const { taskLinks } = await import("../pi-quests/context.ts");
          const p=taskLinks(ctx).find(x=>x.planId===e.sourceId);
          source=p ? `${p.title}\n${p.tasks.map(t=>`${t.status}: ${t.title}`).join("\n")}\nManage this plan in /tasks.` : "This plan is unavailable on the current branch.";
        } else {
          const { QuestStore } = await import("../pi-quests/store.ts");
          const { questDetail } = await import("../pi-quests/index.ts");
          const store=new QuestStore(join(getAgentDir(),"quests","journal.sqlite"));
          source=questDetail(store.get(e.sourceId),store.list());
        }
        await questSelect(ctx, `${e.title}\nRecorded: ${e.at}\n${e.summary}\n\nSOURCE · current record\n${source}`, ["Back"], "Session activity");
      } catch(error) {ctx.ui.notify(`Activity source unavailable: ${String(error)}`,"warning");}
    },
  });
  return {restore,clear(){events=[];},render:(prefs:FooterPrefs,theme:Theme,width:number)=>activityLines(events,prefs,theme,width)};
}
