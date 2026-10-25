import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url);
const {QuestStore}=await jiti.import('../store.ts');
const {currentContext,resumeContext}=await jiti.import('../continuity.ts');
const {default:register,FOCUS_ENTRY}=await jiti.import('../index.ts');
const {emptyBook,mutateBook,BOOK_ENTRY}=await jiti.import('../../pi-tasks/book.ts');
const {emptyPostedBook,postQuestion,changeQuestion,POSTED_ENTRY}=await jiti.import('../../../packages/pi-ask/extensions/ask-user-question/posted-state.ts');

test('source-linked context is immutable, correctable, retry-safe and preserves legacy records',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pursuit-context-'));
 try {
  const store=new QuestStore(join(dir,'journal.sqlite'));
  let q=store.offer({title:'A walk thought',why:'Understand a pattern',firstMove:'Compare examples',source:'A supplied passage'},dir,'s');
  const input={key:'understanding-1',kind:'understanding',text:'The examples suggest a pattern',source:{session:'s',entryId:'m1',reference:'Agent interpretation of supplied examples'}};
  q=store.record(q.id,q.revision,input).quest;
  assert.equal(store.record(q.id,1,input).changed,false);
  assert.equal(store.historyCount(q.id),2);
  assert.throws(()=>store.record(q.id,q.revision,{...input,text:'Silently change the claim'}),/different content/);
  assert.throws(()=>store.record(q.id,1,{...input,key:'stale'}),/changed/);
  q=store.record(q.id,q.revision,{...input,key:'understanding-2',text:'The pattern only holds for one setting',supersedes:input.key}).quest;
  assert.equal(q.contextRecords.length,2);assert.equal(currentContext(q).length,1);
  assert.match(resumeContext(q),/only holds for one setting/);
  assert.doesNotMatch(resumeContext(q),/examples suggest a pattern/);
  assert.equal(q.firstMove,'Compare examples');assert.equal(q.state,'offered');
  assert.throws(()=>store.record(q.id,q.revision,{...input,key:'fork',supersedes:input.key}),/current record/);
  assert.throws(()=>store.record(q.id,q.revision,{...input,key:'bad',text:'\x1b[31m'}),/Invalid/);
  assert.equal(new QuestStore(store.path).get(q.id).contextRecords.length,2);
  assert.equal(store.historyCount(q.id),3);
 }finally{await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('resume bounds rich records and retains retrieval and authorization boundaries',()=>{
 const q={id:'bounded',revision:1,title:'Long pursuit',state:'active',why:'Purpose',firstMove:'Original',origin:{session:'s',source:'Original discussion'},questions:[],contextRecords:[],taskLinks:[],questionLinks:[]};
 for(const kind of ['understanding','uncertainty','decision','artifact','observation'])for(let i=0;i<4;i++)q.contextRecords.push({version:1,key:`${kind}-${i}`,kind,text:'x'.repeat(4000),source:{session:'s'.repeat(200),entryId:'e'.repeat(200),reference:'r'.repeat(2000)},at:'2026-01-01'});
 const result=resumeContext(q);
 assert.ok(result.length<=16000);assert.match(result,/quests get\/history/);assert.match(result,/not renewed authorization/);
 assert.equal(q.contextRecords.length,20);
});

test('thought to decision, work, interruption and resume preserves owner state and caveats',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pursuit-journey-')),previous=process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR=dir;
 try {
  let session='s1';let branch=[{id:'m1',type:'message',message:{role:'user',content:'Build a local prototype with me'}}];
  const tools=new Map(),hooks=new Map(),events=[],sent=[];
  const install=()=>register({registerTool:t=>tools.set(t.name,t),registerCommand:()=>{},on:(name,fn)=>hooks.set(name,fn),events:{emit:(name,value)=>events.push(value)},appendEntry:(customType,data)=>branch.push({id:`entry-${branch.length}`,type:'custom',customType,data}),sendUserMessage:m=>sent.push(m)});
  install();
  const ctx={cwd:dir,sessionManager:{getSessionId:()=>session,getBranch:()=>branch}};
  const raw=p=>tools.get('quests').execute('call',p,undefined,undefined,ctx);
  const call=async p=>JSON.parse((await raw(p)).content[0].text);
  const append=(customType,data)=>branch.push({id:`entry-${branch.length}`,type:'custom',customType,data:structuredClone(data)});
  let book=emptyBook();book=mutateBook(book,book.revision,{op:'create',title:'Prototype',items:[{title:'Build fixture'}]},'agent');append(BOOK_ENTRY,book);
  let q=await call({op:'offer',title:'Explore a pattern',why:'Test the idea',firstMove:'Compare examples',source:'Walk discussion'});
  q=await call({op:'update',id:q.id,revision:q.revision,state:'active',requestMessageId:'m1',requestQuote:'Build a local prototype with me',planId:'p1',goal:'A tested local fixture',nextMove:'Decide the prototype boundary'});
  const record={op:'record',id:q.id,revision:q.revision,key:'u1',contextKind:'uncertainty',statement:'Whether the prototype needs hosting',source:'Current discussion',sourceEntryId:'m1'};
  q=(await call(record)).quest;
  await assert.rejects(()=>call({...record,key:'bad',sourceEntryId:'missing'}),/current branch/);
  let questions=postQuestion(emptyPostedBook(),{question:'Start locally?',why:'Choose the prototype boundary',boundary:'Hosting waits; research continues',urgency:'blocking',planId:'p1',taskIds:['t1']});append(POSTED_ENTRY,questions);
  q=(await call({op:'sync',id:q.id,revision:q.revision})).quest;
  assert.equal(q.questionLinks[0].state,'awaiting');
  const answer={status:'answered',answers:[{questionIndex:0,answer:'Local only',note:'Ask again before publishing'}]};
  for(const action of [{op:'submit',response:answer},{op:'deliver'},{op:'apply',reason:'Build locally; publication requires a later decision'}]) {
   questions=changeQuestion(questions,'q1',questions.questions[0].revision,action);append(POSTED_ENTRY,questions);
   const original=JSON.stringify({book,questions});
   q=(await call({op:'sync',id:q.id,revision:q.revision})).quest;
   assert.equal(JSON.stringify({book,questions}),original);
   assert.equal(q.taskLinks[0].tasks[0].status,'pending');
   assert.equal(q.questionLinks[0].state,questions.questions[0].state);
  }
  assert.equal(q.questionLinks[0].response.answers[0].note,'Ask again before publishing');
  assert.equal(q.reviewNextMove,true);assert.match((await raw({op:'resume',id:q.id})).content[0].text,/REASSESS NEXT MOVE/);
  const retryEvents=events.length;
  assert.equal((await call({op:'sync',id:q.id,revision:1})).changed,false);assert.equal(events.length,retryEvents);
  questions=postQuestion(questions,{question:'Unrelated perspective?',why:'Another conversation',boundary:'Unlinked',urgency:'deferred'});append(POSTED_ENTRY,questions);
  assert.equal((await call({op:'sync',id:q.id,revision:q.revision})).changed,false,'unrelated Ask book changes do not create pursuit updates');assert.equal(events.length,retryEvents);
  book=mutateBook(book,book.revision,{op:'task',mutation:{op:'update',id:'t1',changes:{status:'done',note:'Fixture passes',evidence:'Synthetic test result'}}},'agent');append(BOOK_ENTRY,book);
  q=(await call({op:'sync',id:q.id,revision:q.revision})).quest;
  q=(await call({op:'record',id:q.id,revision:q.revision,key:'artifact-1',contextKind:'artifact',statement:'Prototype fixture passes',source:'Synthetic test result'})).quest;
  q=await call({op:'update',id:q.id,revision:q.revision,progress:'Built and tested the local prototype',nextMove:'Review the result together'});
  assert.equal(q.reviewNextMove,false);
  const before=q.revision;
  const live=(await raw({op:'resume',id:q.id})).content[0].text;
  assert.match(live,/Current branch · applied/);assert.match(live,/1\/1 done/);assert.match(live,/Review the result/);
  assert.equal((await call({op:'get',id:q.id})).revision,before);
  await raw({op:'focus',id:q.id});assert.equal(branch.at(-1).customType,FOCUS_ENTRY);
  install(); // reload reconstructs focus exclusively from current branch
  assert.match((await hooks.get('before_agent_start')({},ctx)).message.content,/FOCUSED PURSUIT/);
  const savedBranch=branch;
  branch=branch.filter(e=>e.customType!==FOCUS_ENTRY);
  assert.doesNotMatch((await hooks.get('before_agent_start')({},ctx)).message.content,/FOCUSED PURSUIT/);
  branch=savedBranch.filter(e=>e.customType!==POSTED_ENTRY);
  assert.match((await raw({op:'resume',id:q.id})).content[0].text,/Historical snapshot · applied/);
  session='s2';branch=[];install();
  const resumed=(await raw({op:'resume',id:q.id})).content[0].text;
  assert.match(resumed,/Historical snapshot · applied/);assert.match(resumed,/Built and tested/);assert.match(resumed,/1\/1 done/);
  assert.doesNotMatch(resumed,/Current branch · applied/);
  assert.equal((await call({op:'get',id:q.id})).state,'active');assert.deepEqual(sent,[]);
  await raw({op:'focus',id:q.id});assert.match((await hooks.get('before_agent_start')({},ctx)).message.content,/FOCUSED PURSUIT/);
  await raw({op:'focus'});assert.doesNotMatch((await hooks.get('before_agent_start')({},ctx)).message.content,/FOCUSED PURSUIT/);
  assert.equal(hooks.has('agent_before_settle'),false);
 }finally{if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
