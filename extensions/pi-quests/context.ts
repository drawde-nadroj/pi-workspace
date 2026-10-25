import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BOOK_ENTRY, restoreBook } from "../pi-tasks/book.ts";
import type { Pursuit, TaskLink, Quest, QuestionLink } from "./store.ts";

export function taskLinks(ctx: ExtensionContext): TaskLink[] {
  let value: unknown;
  for (const entry of ctx.sessionManager.getBranch()) if (entry.type === "custom" && entry.customType === BOOK_ENTRY) value = entry.data;
  if (value === undefined) return [];
  return restoreBook(value).plans.map(p => ({session:ctx.sessionManager.getSessionId(),planId:p.id,title:p.title,capturedAt:new Date().toISOString(),tasks:p.state.tasks.map(t=>({id:t.id,title:t.title,status:t.status,...(t.reason ? {reason:t.reason} : {}), ...(t.blockerOwner ? {blockerOwner:t.blockerOwner} : {}), ...(t.unblockWhen ? {unblockWhen:t.unblockWhen} : {})}))}));
}
/** Read only the active branch; optional Ask is loaded when a linked pursuit requests it. */
export async function questionLinks(ctx: ExtensionContext, q: Quest): Promise<QuestionLink[]> {
  const session=ctx.sessionManager.getSessionId();
  const plans=new Set((q.taskLinks ?? []).filter(p=>p.session===session).map(p=>p.planId));
  if (!plans.size) return [];
  const {POSTED_ENTRY,restorePostedBook}=await import("../../packages/pi-ask/extensions/ask-user-question/posted-state.ts");
  const entry=ctx.sessionManager.getBranch().filter(e=>e.type === "custom" && e.customType === POSTED_ENTRY).at(-1);
  if (!entry || entry.type !== "custom") return [];
  return restorePostedBook(entry.data).questions.filter(x=>x.planId && plans.has(x.planId)).map(x=>({version:1,session,entryId:entry.id,id:x.id,revision:x.revision,question:x.definition.question,state:x.state,planId:x.planId!,taskIds:[...x.taskIds],...(x.response ? {response:structuredClone(x.response)} : {}),...(x.consequence ? {consequence:x.consequence} : {}),capturedAt:new Date().toISOString()}));
}
/** Verifies provenance, not the meaning of a request; semantic interpretation stays with the agent. */
export function pursuitSource(ctx: ExtensionContext, messageId: string, quote: string): Pursuit {
  const entry = ctx.sessionManager.getBranch().find(e=>e.id === messageId);
  if (!quote.trim() || !entry || entry.type !== "message" || entry.message.role !== "user") throw new Error("Pursuit needs an existing user-message ID and exact request quote on this branch.");
  const content = entry.message.content;
  const text = typeof content === "string" ? content : content.filter(x=>x.type === "text").map(x=>x.text).join("\n");
  if (!text.includes(quote)) throw new Error("Request quote does not match the referenced user message.");
  return {session:ctx.sessionManager.getSessionId(),messageId,quote};
}
