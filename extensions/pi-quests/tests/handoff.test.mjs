import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {jiti,root,visibleWidth,plain} from '../../pi-egregore/tests/host.mjs';
const {getThemeByName}=await import(pathToFileURL(join(root,'@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js')));
const {handoffPaths,handoffRows,handoffText,isHandoff}=await jiti.import(fileURLToPath(new URL('../handoff.ts',import.meta.url)));
const {default:register,GUIDANCE}=await jiti.import(fileURLToPath(new URL('../index.ts',import.meta.url)));
const paths=[{kind:'depth',title:'A journal that remembers 世界 🌱',why:'Develop continuity.',firstMove:'Read the recorded state together.',source:'Your question about an outdated next move.'},{kind:'breadth',title:'Carry a discovery elsewhere',why:'Connect writing and language practice.',firstMove:'Choose one thought to express.',source:'Our conversation about words worth repeating.'}];
test('handoff fits widths, themes and expanded source text with labelled jade/gold directions',()=>{
 const h=handoffPaths(paths,()=>{throw Error('unexpected database read')});
 for(const name of ['dark','light']) {
  const th=getThemeByName(name),before=structuredClone(th.colors);
  for(const width of [0,1,2,8,23,24,40,80,120]) for(const expanded of [false,true]) {
   const lines=handoffRows(th,width,h,expanded);
   for(const line of lines)assert.ok(visibleWidth(line)<=width,`${name}/${width}: ${visibleWidth(line)}`);
   if(width>=24)assert.match(plain(lines.at(-1)),/^╰.*╯$/);
  }
  const rows=handoffRows(th,100,h).join('\n');
  for(const label of ['Where next?','Deepen','Connect','First move:','From:','Conversation only'])assert.ok(plain(rows).includes(label));
  assert.notEqual(handoffRows(th,100,h).find(l=>plain(l).includes('Deepen')).match(/\x1b\[[0-9;]+m/g)?.join(),handoffRows(th,100,h).find(l=>plain(l).includes('Connect')).match(/\x1b\[[0-9;]+m/g)?.join());
  assert.deepEqual(th.colors,before);
 }
 const long=handoffPaths([{...paths[0],source:'Detail '.repeat(400)+'SOURCE END'}],()=>{});
 assert.match(plain(handoffRows(getThemeByName('dark'),40,long).join('\n')),/Expand tool output/);
 assert.doesNotMatch(plain(handoffRows(getThemeByName('dark'),40,long).join('\n')),/SOURCE END/);
 assert.match(plain(handoffRows(getThemeByName('dark'),40,long,true).join('\n')),/SOURCE END/);
 assert.equal(isHandoff({presentation:'pi-quests:where-next-v1',paths:[{}]}),false);
 const safe=handoffPaths([{...paths[0],title:'Name\x1b[31m\x1b]52;c;evil\x07'}],()=>{});
 assert.doesNotMatch(handoffText(safe),/\x1b|\x07/);
});
test('present is a non-persisting invitation and existing references are immutable snapshots',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quest-handoff-')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=dir;
 try {
  const tools=new Map(),events=[],sent=[],hooks=[];
  register({registerTool:t=>tools.set(t.name,t),registerCommand:()=>{},events:{emit:(...a)=>events.push(a)},on:n=>hooks.push(n),sendMessage:m=>sent.push(m),sendUserMessage:m=>sent.push(m)});
  const ctx={cwd:dir,sessionManager:{getSessionId:()=> 's',getBranch:()=>[]}},tool=tools.get('quests');
  const call=p=>tool.execute('fixture',p,undefined,undefined,ctx);
  let result=await call({op:'present',paths});assert.equal(result.details.paths.length,2);assert.equal(existsSync(join(dir,'quests/journal.sqlite')),false);
  assert.deepEqual(events,[]);assert.deepEqual(sent,[]);assert.ok(!hooks.includes('agent_before_settle'));
  const q=JSON.parse((await call({op:'offer',...paths[0]})).content[0].text);
  const before=JSON.parse((await call({op:'history',id:q.id})).content[0].text),eventCount=events.length;
  result=await call({op:'present',paths:[{id:q.id}]});assert.equal(result.details.paths[0].questId,q.id);
  assert.equal(result.details.paths[0].state,'offered');assert.equal(events.length,eventCount);
  assert.deepEqual(JSON.parse((await call({op:'history',id:q.id})).content[0].text),before);
  assert.equal(JSON.parse((await call({op:'get',id:q.id})).content[0].text).revision,q.revision);
  for(const bad of [[],[{}],[{id:q.id,title:'Override'}],[{id:q.id},{id:q.id}],[{...paths[0],source:' '}],Array(5).fill(paths[0])])await assert.rejects(()=>call({op:'present',paths:bad}));
  assert.match(plain(tool.renderResult(result,{expanded:false,isPartial:false},getThemeByName('dark')).render(80).join('\n')),/Where next/);
  assert.match(tool.renderResult({content:[{type:'text',text:'Old result'}],details:undefined},{expanded:false},getThemeByName('dark')).render(80).join('\n'),/Old result/);
  const fallback={content:[{type:'text',text:'A long ordinary result. '.repeat(400)}],details:undefined};
  assert.ok(tool.renderResult(fallback,{expanded:false},getThemeByName('dark')).render(40).length<=9);
  assert.ok(tool.renderResult(fallback,{expanded:true},getThemeByName('dark')).render(40).length>9);
  const {ToolExecutionComponent}=await import(pathToFileURL(join(root,'@earendil-works/pi-coding-agent/dist/modes/interactive/components/tool-execution.js')));
  const native=new ToolExecutionComponent('quests','fixture',{op:'present',paths},undefined,tool,{requestRender:()=>{}},dir);
  native.setArgsComplete();native.updateResult({...result,isError:false});
  for(const width of [24,64,100]){const lines=native.render(width);assert.ok(lines.every(l=>visibleWidth(l)<=width));assert.match(plain(lines.join('\n')),/Where next/);}
  assert.match(GUIDANCE,/Deepen.*Connect/);assert.match(GUIDANCE,/name, value, source and a possible first move/);assert.match(GUIDANCE,/does not call for a second suggestions message/);
 }finally{if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
});
