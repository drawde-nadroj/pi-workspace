import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const local=p=>jiti.import(fileURLToPath(new URL(p,import.meta.url)));
import {jiti,theme,visibleWidth,plain} from '../../pi-egregore/tests/host.mjs';
const {attentionDockRows}=await local('../attention-dock.ts');
const {emptyPlan,mutate}=await local('../state.ts');
const {taskPanelRows,taskPanelDefaults}=await local('../../pi-egregore/task-presentation.ts');
const {layoutDock}=await jiti.import('pi-agent-contracts/dock');
const {taskFrame}=await local('../../../lib/task-frame.ts');
function fixture(){
 const empty=emptyPlan();
 let plan=mutate(empty,empty.revision,{op:'add',items:[{title:'Review and publish the verified implementation'},{title:'Run the empty backend'},{title:'Reconcile onboarding gates'}]},'agent');
 const update=(id,changes)=>plan=mutate(plan,plan.revision,{op:'update',id,changes},'agent');
 update('t1',{status:'blocked',reason:'Credential approval remains unanswered. '.repeat(12),blockerOwner:'user',unblockWhen:'Answer the credential question'});
 update('t2',{status:'blocked',reason:'Credential approval remains outstanding',blockerOwner:'user',unblockWhen:'Apply the answer'});
 update('t3',{status:'blocked',reason:'Production backups remain paused; recovery verification is outstanding. '.repeat(8),blockerOwner:'external',unblockWhen:'Backups resume and recovery is verified'});
 return plan;
}
const q={id:'q1',revision:1,question:'Authorize credential creation or keep it deferred?',urgency:'blocking',state:'awaiting',planId:'p1',taskIds:['t1','t2'],boundary:'Credential work waits; source review can continue'};
test('screenshot-shaped dock prioritizes answerable input and separates external waiting without dense duplicate blockers',()=>{
 const p=fixture(),before=structuredClone(p),question=structuredClone(q);
 const result=attentionDockRows(p,false,[q],'p1');
 assert.equal(result.rows.length,2);assert.match(result.rows[0].text,/Your input · q1 → 2 tasks/);
 assert.match(result.rows[1].text,/Waiting externally · 1 task · Backups resume/);
 assert.equal(result.hint,'/questions q1 · /tasks details');
 assert.ok(result.rows.every(r=>r.text.length<180));assert.deepEqual(p,before);assert.deepEqual(q,question);
 const dock={version:1,sessionId:'s',id:'pi-tasks',title:'Inspect installation',summary:'1 needs you · 0 of 3 done · 3 blocked',...result};
 const frame={state:'waiting',active:false,progress:0,phase:0};
 for(const width of [16,24,40,80,120,180]) {
  const workspace=taskPanelRows(theme,width,dock,taskPanelDefaults(),frame,7);
  const fallback=taskFrame(theme,width,layoutDock(dock,width-2,7).map(r=>r.text),dock.title,dock.summary,dock.hint);
  for(const rows of [workspace,fallback]) for(const line of rows)assert.ok(visibleWidth(line)<=width);
  if(width>=80){assert.match(workspace.map(plain).join('\n'),/Your input/);assert.match(workspace.map(plain).join('\n'),/Waiting externally/);assert.match(workspace.map(plain).join('\n'),/\/questions q1/);}
 }
});
test('delivery and agent follow-up do not ask for a second answer; unrelated and legacy blockers stay explicit',()=>{
 const p=fixture();
 for(const state of ['submitted','delivered']) {
  const result=attentionDockRows(p,false,[{...q,state,responseStatus:'answered'}],'p1');
  assert.doesNotMatch(result.rows.map(r=>r.text).join('\n'),/Your input|Needs your input/);
  assert.match(result.rows[0].text,state==='submitted'?/delivery pending/:/Agent to apply answer/);
  assert.equal(result.hint,'/tasks details');assert.equal(p.tasks[0].status,'blocked');
 }
 const foreign=attentionDockRows(p,false,[{...q,planId:'p2'}],'p1');
 assert.match(foreign.rows[0].text,/Other plan p2/);assert.ok(foreign.rows.some(r=>/Needs your input · 2 tasks/.test(r.text)));
 const noQuestion=attentionDockRows(p,false,[],'p1');assert.equal(noQuestion.hint,'/tasks details');assert.ok(noQuestion.rows.some(r=>/Needs your input/.test(r.text)));
 delete p.tasks[2].blockerOwner;assert.ok(attentionDockRows(p,false,[],'p1').rows.some(r=>/owner unspecified/.test(r.text)));
});
