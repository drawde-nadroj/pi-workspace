import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url);
const {QuestStore}=await jiti.import('../store.ts');
const {pursuitSource,taskLinks}=await jiti.import('../context.ts');
const {emptyBook,mutateBook,BOOK_ENTRY}=await jiti.import('../../pi-tasks/book.ts');
const {questDetail,default:register}=await jiti.import('../index.ts');
test('conversational pursuit verifies source, sends nothing and records goal, work and completion history',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quest-journal-'));const old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=dir;
 try {
  const tools=new Map(),notifications=[],sent=[];
  register({events:{emit:(n,v)=>notifications.push(v)},registerTool:t=>tools.set(t.name,t),registerCommand:()=>{},on:()=>{},sendUserMessage:m=>sent.push(m)});
  const initial=emptyBook();const book=mutateBook(initial,initial.revision,{op:'create',title:'Watch recordings',items:[{title:'Observe a memo'}]},'agent');
  const ctx={cwd:dir,sessionManager:{getSessionId:()=> 's',getBranch:()=>[{id:'m1',type:'message',message:{role:'user',content:'Let us build the watcher'}},{type:'custom',customType:BOOK_ENTRY,data:book}]}};
  assert.equal(taskLinks(ctx)[0].tasks[0].status,'pending');
  const call=async p=>JSON.parse((await tools.get('quests').execute('c',p,undefined,undefined,ctx)).content[0].text);
  let q=await call({op:'offer',title:'Automatic capture',why:'Remember',firstMove:'Observe',source:'Discussion'});
  assert.throws(()=>pursuitSource(ctx,'m1','a different request'),/does not match/);
  assert.equal((await call({op:'context'})).requests[0].id,'m1');
  await assert.rejects(()=>call({op:'update',id:q.id,revision:q.revision,state:'active'}));
  q=await call({op:'update',id:q.id,revision:q.revision,state:'active',requestMessageId:'m1',requestQuote:'Let us build the watcher',goal:'Observe a recording',progress:'Started read-only observation',planId:'p1'});
  assert.equal(q.pursuit.messageId,'m1');assert.equal(q.taskLinks[0].title,'Watch recordings');assert.deepEqual(sent,[]);
  await assert.rejects(()=>call({op:'update',id:q.id,revision:q.revision,state:'completed'}),/evidence/);
  q=await call({op:'update',id:q.id,revision:q.revision,state:'completed',evidence:'Fixture recording detected'});
  assert.equal(q.state,'completed');assert.equal(notifications.length,3);
  const store=new QuestStore(join(dir,'quests/journal.sqlite'));assert.equal(store.history(q.id).length,3);
  const detail=questDetail(q);for(const text of ['PURPOSE','QUESTIONS','No questions recorded','LINKED TASKS','This workspace','Fixture recording detected','Let us build']) assert.ok(detail.includes(text));
 }finally{if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(dir,{recursive:true,force:true})}
});
