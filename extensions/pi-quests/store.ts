import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { contextRecord, type ContextInput, type ContextRecord } from "./continuity.ts";

export interface QuestionLink { version: 1; session: string; entryId: string; id: string; revision: number; question: string; state: string; planId: string; taskIds: string[]; response?: unknown; consequence?: string; capturedAt: string }

export const STATES = ["offered", "saved", "active", "paused", "completed", "declined"] as const;
export type State = typeof STATES[number];
export const INTENTS = ["keep", "explore", "make"] as const;
export type Intent = typeof INTENTS[number];
export interface Question { id: string; text: string; answer?: string }
export interface TaskLink { session: string; planId: string; title: string; capturedAt: string; tasks: { id: string; title: string; status: string; reason?: string; blockerOwner?: string; unblockWhen?: string }[] }
export interface Pursuit { session: string; messageId: string; quote: string }
export interface Quest {
  id: string; revision: number; title: string; why: string; firstMove: string;
  kind: "depth" | "breadth" | "exploration"; state: State; global: boolean;
  workspace: string; origin: { session: string; source: string };
  links: string[]; evidence: string[]; questions: Question[];
  goal?: string; nextMove?: string; intent?: Intent; pursuit?: Pursuit; taskLinks?: TaskLink[]; progress?: string[];
  contextRecords?: ContextRecord[]; questionLinks?: QuestionLink[]; reviewNextMove?: boolean;
  offerFingerprint?: string;
  createdAt: string; updatedAt: string;
}
export interface Offer { title: string; why: string; firstMove: string; kind?: Quest["kind"]; source: string; global?: boolean; goal?: string }
export interface Patch { intent?: Intent; title?: string; why?: string; firstMove?: string; state?: State; global?: boolean; link?: string; evidence?: string; question?: string; questionId?: string; answer?: string; goal?: string; nextMove?: string; pursuit?: Pursuit; taskLink?: TaskLink; progress?: string }
const clean = (s: string, max = 4000) => {
  if (typeof s !== "string" || !s.trim() || s.length > max || /[\x00-\x08\x0b-\x1f\x7f]/.test(s)) throw new Error(`Expected nonempty text up to ${max} characters without terminal control codes`);
  return s.trim();
};
export function workspaceKey(cwd: string): string { return resolve(cwd); }

/** One connection per operation: no idle handles, shared-session cache, or reload ownership. */
export class QuestStore {
  constructor(readonly path: string) {}
  private use<T>(fn: (db: DatabaseSync) => T): T {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(this.path);
    try {
      db.exec("PRAGMA busy_timeout=3000");
      const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
      if (version > 1) throw new Error("Quest journal uses a newer format; update Pi Quests before writing.");
      db.exec("CREATE TABLE IF NOT EXISTS quests (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, quest_id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, body TEXT NOT NULL); PRAGMA user_version=1");
      return fn(db);
    } finally { db.close(); }
  }
  list(workspace?: string): Quest[] {
    return this.use(db => (db.prepare("SELECT body FROM quests ORDER BY rowid DESC").all() as {body:string}[])
      .map(row => JSON.parse(row.body) as Quest).filter(q => !workspace || q.global || q.workspace === workspaceKey(workspace)));
  }
  get(id: string): Quest { return this.use(db => this.read(db, id)); }
  private read(db: DatabaseSync, id: string): Quest {
    const row = db.prepare("SELECT body FROM quests WHERE id=?").get(id) as {body:string} | undefined;
    if (!row) throw new Error(`Quest ${id} not found`);
    return JSON.parse(row.body) as Quest;
  }
  private save(db: DatabaseSync, q: Quest, actor: string) {
    if (Buffer.byteLength(JSON.stringify(q)) > 2_000_000) throw new Error("Quest record limit reached; history was not discarded.");
    db.prepare("INSERT INTO quests(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(q.id, JSON.stringify(q));
    db.prepare("INSERT INTO events(quest_id,at,actor,body) VALUES (?,?,?,?)").run(q.id, q.updatedAt, actor, JSON.stringify(q));
  }
  offer(input: Offer, workspace: string, session: string): Quest { return this.offerResult(input,workspace,session).quest; }
  offerResult(input: Offer, workspace: string, session: string): {quest: Quest; changed: boolean} {
    const now = new Date().toISOString();
    const q: Quest = { id: randomUUID(), revision: 1, title: clean(input.title, 200), why: clean(input.why), firstMove: clean(input.firstMove),
      kind: input.kind ?? "exploration", state: "offered", global: input.global ?? false,
      workspace: workspaceKey(workspace), origin: { session, source: clean(input.source) }, links: [], evidence: [], questions: [], createdAt: now, updatedAt: now, ...(input.goal ? {goal:clean(input.goal)} : {}) };
    if (!["depth", "breadth", "exploration"].includes(q.kind)) throw new Error("Unknown quest kind");
    return this.use(db => { db.exec("BEGIN IMMEDIATE"); try {
      // Exact retries reuse the original invitation even after its state develops.
      const identity = (x: Quest) => createHash("sha256").update(JSON.stringify([x.workspace,x.origin,x.title,x.why,x.firstMove,x.kind,x.global,x.goal])).digest("hex");
      q.offerFingerprint=identity(q);
      const existing = (db.prepare("SELECT body FROM quests").all() as {body:string}[]).map(r=>JSON.parse(r.body) as Quest).find(x=>(x.offerFingerprint ?? identity(x))===q.offerFingerprint);
      if (existing) { db.exec("COMMIT"); return {quest:existing,changed:false}; }
      this.save(db, q, "agent:offer"); db.exec("COMMIT"); return {quest:q,changed:true};
    } catch (e) { db.exec("ROLLBACK"); throw e; } });
  }
  update(id: string, revision: number, patch: Patch, actor: "user" | "agent"): Quest {
    return this.use(db => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const q = this.read(db, id);
        if (q.revision !== revision) throw new Error("Quest changed. Read it again before updating.");
        if (patch.intent !== undefined) {
          if (!INTENTS.includes(patch.intent)) throw new Error("Unknown quest intent");
          if (patch.state !== (patch.intent === "keep" ? "saved" : "active")) throw new Error("Intent needs matching saved/active state");
          if (actor === "agent" && !patch.pursuit) throw new Error("Intent needs an explicit user request source");
          q.intent = patch.intent;
        }
        if (patch.pursuit) {
          if (patch.state !== "active" && !(patch.state === "saved" && patch.intent === "keep")) throw new Error("Pursuit records active exploration/work or an explicit keep request");
          if (patch.state === "active" && !patch.intent) q.intent = "explore";
          q.pursuit = { session: clean(patch.pursuit.session, 200), messageId: clean(patch.pursuit.messageId, 200), quote: clean(patch.pursuit.quote) };
        }
        if (patch.state !== undefined) {
          if (!STATES.includes(patch.state)) throw new Error("Unknown quest state");
          if (actor !== "user" && ["saved", "active", "declined"].includes(patch.state) && !(patch.pursuit && (patch.state === "active" || (patch.state === "saved" && patch.intent === "keep")))) throw new Error("Use /quests to Start, Save or Decline; these choices belong to the user.");
          if (actor === "agent" && q.state === "offered" && patch.state !== "offered" && !patch.pursuit) throw new Error("An offered quest awaits the user's choice in /quests.");
          if (patch.state === "completed" && !(patch.goal ?? q.goal)) throw new Error("Completion needs a defined goal.");
          if (patch.state === "completed" && !patch.evidence) throw new Error("Completion needs fresh evidence of the result against the goal.");
          q.state = patch.state;
        }
        for (const key of ["title", "why", "firstMove", "goal", "nextMove"] as const) if (patch[key] !== undefined) q[key] = clean(patch[key]!, key === "title" ? 200 : 4000);
        if (patch.nextMove !== undefined) q.reviewNextMove = false;
        if (patch.progress) (q.progress ??= []).push(clean(patch.progress));
        if (patch.taskLink) {
          const link: TaskLink = {session:clean(patch.taskLink.session,200),planId:clean(patch.taskLink.planId,100),title:clean(patch.taskLink.title,200),capturedAt:clean(patch.taskLink.capturedAt,100),tasks:patch.taskLink.tasks.map(t=>({id:clean(t.id,100),title:clean(t.title,200),status:clean(t.status,100), ...(t.reason ? {reason:clean(t.reason,800)} : {}), ...(t.blockerOwner ? {blockerOwner:clean(t.blockerOwner,30)} : {}), ...(t.unblockWhen ? {unblockWhen:clean(t.unblockWhen,800)} : {})}))};
          q.taskLinks = [...(q.taskLinks ?? []).filter(x=>x.session !== link.session || x.planId !== link.planId),link];
        }
        if (patch.global !== undefined) q.global = patch.global;
        if (patch.link) { const target = this.read(db, patch.link); if (target.id === id) throw new Error("Link another quest"); if (!q.links.includes(target.id)) q.links.push(target.id); }
        if (patch.evidence) q.evidence.push(clean(patch.evidence));
        if (patch.question) q.questions.push({ id: randomUUID(), text: clean(patch.question) });
        if (patch.answer !== undefined) {
          const question = q.questions.find(x => x.id === patch.questionId);
          if (!question) throw new Error("Question not found");
          question.answer = clean(patch.answer);
        }
        // Identical retries (including links and intent) need no extra history event.
        if (JSON.stringify(q) === JSON.stringify(this.read(db,id))) { db.exec("COMMIT"); return q; }
        q.revision++; q.updatedAt = new Date().toISOString();
        this.save(db, q, actor); db.exec("COMMIT"); return q;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    });
  }
  /** Atomic, retry-safe context append. Reusing a key with different content is an error. */
  record(id: string, revision: number, input: ContextInput): {quest: Quest; changed: boolean} {
    return this.use(db => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const q=this.read(db,id), record=contextRecord(input,new Date().toISOString());
        const previous=q.contextRecords?.find(r=>r.key===record.key);
        if (previous) {
          if (JSON.stringify({...previous,at:""}) !== JSON.stringify({...record,at:""})) throw new Error("Context key already has different content; use a new key and supersedes to correct it.");
          db.exec("COMMIT"); return {quest:q,changed:false};
        }
        if (q.revision !== revision) throw new Error("Quest changed. Read it again before updating.");
        if (record.supersedes) {
          const original=q.contextRecords?.find(r=>r.key===record.supersedes);
          if (!original || original.kind !== record.kind || q.contextRecords?.some(r=>r.supersedes===record.supersedes)) throw new Error("Correction must supersede a current record of the same kind.");
        }
        if ((q.contextRecords?.length ?? 0) >= 200) throw new Error("Context record limit reached; history was not discarded.");
        (q.contextRecords ??= []).push(record); q.revision++; q.updatedAt=record.at;
        this.save(db,q,"agent:context"); db.exec("COMMIT"); return {quest:q,changed:true};
      } catch(e) { db.exec("ROLLBACK"); throw e; }
    });
  }
  /** Captures verified current-branch projections; never changes Ask or Tasks. */
  sync(id: string, revision: number, tasks: TaskLink[], questions: QuestionLink[]): {quest: Quest; changed: boolean} {
    return this.use(db=> {
      db.exec("BEGIN IMMEDIATE");
      try {
        const q=this.read(db,id);
        const next=structuredClone(q);
        for (const link of tasks) {
          const previous=next.taskLinks?.find(p=>p.session===link.session && p.planId===link.planId);
          if (!previous) throw new Error("Sync requires an existing quest-to-plan link.");
          if (JSON.stringify({...previous,capturedAt:""}) !== JSON.stringify({...link,capturedAt:""})) next.taskLinks=next.taskLinks!.map(p=>p===previous ? link : p);
        }
        for (const link of questions) {
          if (!next.taskLinks?.some(p=>p.session===link.session && p.planId===link.planId)) throw new Error("Question belongs to an unlinked plan.");
          const previous=next.questionLinks?.find(p=>p.session===link.session && p.id===link.id);
          if (!previous || JSON.stringify({...previous,capturedAt:"",entryId:""}) !== JSON.stringify({...link,capturedAt:"",entryId:""})) next.questionLinks=[...(next.questionLinks ?? []).filter(p=>p!==previous),link];
        }
        if (JSON.stringify(next) === JSON.stringify(q)) { db.exec("COMMIT"); return {quest:q,changed:false}; }
        if(q.revision!==revision) throw new Error("Quest changed. Read it again before updating.");
        next.reviewNextMove=true;
        next.revision++; next.updatedAt=new Date().toISOString(); this.save(db,next,"agent:sync"); db.exec("COMMIT");return {quest:next,changed:true};
      } catch(e) {db.exec("ROLLBACK");throw e;}
    });
  }
  historyCount(id: string): number {
    return this.use(db => Number((db.prepare("SELECT COUNT(*) AS count FROM events WHERE quest_id=?").get(id) as {count:number}).count));
  }
  history(id: string, offset = 0): unknown[] {
    return this.use(db => db.prepare("SELECT at,actor,body FROM events WHERE quest_id=? ORDER BY seq DESC LIMIT 20 OFFSET ?").all(id, offset));
  }
}
