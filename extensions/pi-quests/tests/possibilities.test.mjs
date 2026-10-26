import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {jiti,root,plain,visibleWidth} from '../../pi-egregore/tests/host.mjs';
const load=name=>jiti.import(fileURLToPath(new URL(`../${name}.ts`,import.meta.url)));
const {handoffPaths,handoffRows,handoffText,isHandoff}=await load('handoff');
const {journalSections,questOverview}=await load('journal');
const {resumeContext}=await load('continuity');
const {default:register,GUIDANCE}=await load('index');
const {getThemeByName}=await import(pathToFileURL(join(root,'@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js')));
const idea={title:'A return page 世界 🌱',why:'Recover a thread of thinking.',firstMove:'Develop one example together.',source:'Our discussion about returning to a pursuit.',kind:'breadth'};
test('compact possibility is explicitly labelled green, unframed, bounded and expandable in both themes',()=>{
 const h=handoffPaths([idea],()=>{throw Error('no reads')},'possibility');
 assert.ok(isHandoff(h));assert.match(handoffText(h),/^Possibility ·/);assert.doesNotMatch(handoffText(h),/Where next/);
 assert.match(handoffText(h),/From: Our discussion/);
 assert.throws(()=>handoffPaths([idea,idea],()=>{},'possibility'),/one path/);
 assert.equal(isHandoff({...h,paths:[...h.paths,...h.paths]}),false);
 for(const name of ['light','dark']){
  const theme=getThemeByName(name),before=structuredClone(theme.colors);
  for(const width of [0,1,2,8,23,24,40,64,100])for(const expanded of [false,true]){
   const rows=handoffRows(theme,width,h,expanded);
   assert.ok(rows.every(r=>visibleWidth(r)<=width));assert.doesNotMatch(plain(rows.join('\n')),/[╭╰╯╮]/);
   if(!expanded)assert.ok(rows.length<=7);
  }
  const rows=handoffRows(theme,100,h);
  assert.match(plain(rows[0]),/^Possibility · A return page/);
  const green=name==='light'?'0;107;80':'101;214;173';
  assert.ok(rows[0].includes(green));assert.ok(!rows[1].includes(green),'explanation remains neutral');
  assert.match(plain(handoffRows(theme,64,h,true).join('\n')),/First move: Develop one/);
  assert.deepEqual(theme.colors,before);
 }
});
test('conversation to journal: keep, explore and make retain sources without starting work; capture and links deduplicate',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quest-possibilities-')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=dir;
 try{
  const tools=new Map(),events=[],sent=[],hooks=[];
  register({registerTool:t=>tools.set(t.name,t),registerCommand:()=>{},on:n=>hooks.push(n),events:{emit:(...a)=>events.push(a)},sendUserMessage:m=>sent.push(m)});
  const requests=[['keep','Keep that'],['explore',"Let's explore that"],['make',"Let's make the agreed local prototype"]].map(([id,text])=>({id,type:'message',message:{role:'user',content:text}}));
  const ctx={cwd:dir,sessionManager:{getSessionId:()=> 's',getBranch:()=>requests}};
  const raw=p=>tools.get('quests').execute('test',p,undefined,undefined,ctx);
  const call=async p=>JSON.parse((await raw(p)).content[0].text);
  const invitation=await raw({op:'present',presentation:'possibility',paths:[idea]});
  assert.match(invitation.content[0].text,/Conversation only/);assert.equal(events.length,0);
  const parent=await call({op:'offer',...idea,title:'Develop Egregore'});
  let q=await call({op:'offer',...idea});const offered=q;
  let p=await call({op:'update',id:parent.id,revision:parent.revision,link:q.id});
  const count=events.length;
  assert.equal((await call({op:'offer',...idea})).id,q.id);assert.equal(events.length,count);
  assert.equal((await call({op:'update',id:p.id,revision:p.revision,link:q.id})).revision,p.revision);assert.equal(events.length,count);
  let section=journalSections(p,[q],2).find(x=>x.id==='possibilities');
  assert.match(section.label,/· 1$/);for(const value of [idea.title,idea.why,idea.firstMove,idea.source])assert.ok(section.text.includes(value));
  await assert.rejects(()=>call({op:'update',id:q.id,revision:q.revision,intent:'keep',state:'saved'}),/request source/);
  await assert.rejects(()=>call({op:'update',id:q.id,revision:q.revision,intent:'make',state:'active',requestMessageId:'explore',requestQuote:'not on branch'}),/does not match/);
  for(const intent of ['keep','explore','make']){
   const request=requests.find(r=>r.id===intent),state=intent==='keep'?'saved':'active';
   q=await call({op:'update',id:q.id,revision:q.revision,intent,state,requestMessageId:intent,requestQuote:request.message.content});
   assert.equal(q.intent,intent);assert.equal(q.state,state);assert.equal(q.pursuit.quote,request.message.content);
   const history=await call({op:'history',id:q.id});assert.equal(JSON.parse(history[0].body).intent,intent);
   assert.match(resumeContext(q),/INTENT/);
   assert.equal(journalSections(p,[q],2).find(x=>x.id==='possibilities').label,`Possible directions · ${intent==='keep'?1:0}`);
  }
  assert.match(questOverview(q),/Making within agreed scope/);
  q=await call({op:'update',id:q.id,revision:q.revision,title:'Refined title',goal:'An agreed bounded experiment'});
  assert.equal((await call({op:'offer',...idea})).id,q.id,'original fingerprint survives refinement');
  assert.equal((await call({op:'get',id:q.id})).revision,q.revision);
  assert.equal(offered.firstMove,q.firstMove);assert.deepEqual(sent,[]);assert.ok(!hooks.includes('agent_before_settle'));
  assert.match(GUIDANCE,/Discussing an idea does not authorize implementation/);assert.match(GUIDANCE,/substantial ideas developed together/);
 }finally{if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50})}
});
