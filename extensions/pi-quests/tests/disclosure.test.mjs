import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url);
const {QuestStore}=await jiti.import('../store.ts');
const {questOverview,journalSections,questJournal}=await jiti.import('../journal.ts');
test('counted disclosures preserve origin, separate original/current moves and never mutate on browse',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quest-disclosure-'));
 try{
  const store=new QuestStore(join(dir,'journal.sqlite'));
  let q=store.offer({title:'Learn capture',why:'Build understanding',firstMove:'Prototype detector',source:'Original discussion'},dir,'s');
  q=store.update(q.id,q.revision,{state:'active',progress:'Detector built',nextMove:'Verify source access',question:'What should persist?',evidence:'Fixture passes',taskLink:{session:'s',planId:'p1',title:'Capture plan',capturedAt:'2026-10-25',tasks:[{id:'t1',title:'Detector',status:'done'},{id:'t2',title:'Read source',status:'blocked',reason:'Access unavailable'}]}},'user');
  const overview=questOverview(q);assert.match(overview,/Detector built/);assert.match(overview,/Verify source access/);assert.match(overview,/Access unavailable/);assert.doesNotMatch(overview,/Prototype detector|Original discussion/);
  assert.equal(store.historyCount(q.id),2);
  const sections=journalSections(q,[],store.historyCount(q.id));assert.match(sections.find(s=>s.id==='work').label,/1\/2 done · 1 waiting/);assert.match(sections.find(s=>s.id==='questions').label,/1 open · 0 answered/);assert.match(sections.find(s=>s.id==='source').text,/Original discussion/);
  const seen=[];let step=0;
  const ctx={mode:'rpc',sessionManager:{getSessionId:()=> 's'},ui:{select:async(title,choices)=>{seen.push({title,choices});if(step++===0)return choices.find(s=>s.startsWith('▸ Evidence'));return 'Back';}}};
  assert.equal(await questJournal(ctx,q,[],2,()=>''),'Back');assert.doesNotMatch(seen[0].title,/Fixture passes/);assert.match(seen[1].title,/Fixture passes/);assert.ok(seen[1].choices.some(s=>s.startsWith('▾ Evidence')));assert.equal(store.get(q.id).revision,q.revision);
  const historical={...q,nextMove:undefined};assert.doesNotMatch(questOverview(historical),/Prototype detector/);
  assert.match(journalSections(historical,[],2).find(s=>s.id==='purpose').text,/Prototype detector/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
