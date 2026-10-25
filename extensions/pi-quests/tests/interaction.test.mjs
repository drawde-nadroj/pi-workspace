import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url);
const {default:register}=await jiti.import('../index.ts');
test('native journal Save is quiet, questions persist, Start sends exactly one user request',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quest-ui-')), previous=process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR=dir;
 try {
  const commands=new Map(), tools=new Map(), sent=[], entries=[];
  register({appendEntry:(customType,data)=>entries.push({type:'custom',customType,data}),events:{emit:()=>{}},registerTool:t=>tools.set(t.name,t),registerCommand:(n,c)=>commands.set(n,c),on:()=>{},sendUserMessage:m=>sent.push(m)});
  const actions=[];
  const ctx={cwd:dir,hasUI:true,isIdle:()=>true,sessionManager:{getSessionId:()=> 's',getBranch:()=>entries},ui:{notify:(m,t)=>{if(t==='error')throw new Error(m)},select:async(title,options)=>{
   const next=actions.shift(); const result=next==='pick'?options[1]:next; if(result!==undefined)assert.ok(options.includes(result),`Unavailable option: ${result}`);return result;
  },input:async()=> 'What connects?',editor:async()=> 'An example'}};
  const execute=async p=>JSON.parse((await tools.get('quests').execute('call',p,undefined,undefined,ctx)).content[0].text);
  const q=await execute({op:'offer',title:'Explore',why:'Discover',firstMove:'Discuss',source:'Conversation'});
  actions.push('pick','Keep for later',undefined); await commands.get('quests').handler('',ctx);
  assert.equal((await execute({op:'get',id:q.id})).state,'saved');assert.deepEqual(sent,[]);
  actions.push('pick','More actions','Questions','Add a question',undefined);await commands.get('quests').handler('',ctx);
  assert.equal((await execute({op:'get',id:q.id})).questions[0].text,'What connects?');
  actions.push('pick','Continue in chat');await commands.get('quests').handler('',ctx);
  assert.equal((await execute({op:'get',id:q.id})).state,'active');assert.equal(sent.length,1);assert.match(sent[0],/Continue this quest/);assert.equal(entries.at(-1).customType,'pi-quests:focus-v1');assert.match(sent[0],/quests resume/);
 }finally{if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50})}
});
