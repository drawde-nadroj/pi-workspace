import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
import {readFileSync} from 'node:fs';
import {stripVTControlCharacters as plain} from 'node:util';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const install=join(homedir(),'.pi/agent/install');
const modules=process.env.PI_WORKSPACE_HOST_MODULES || process.env.PI_HOME_HOST_MODULES || join(install,'releases',readFileSync(join(install,'current-version'),'utf8').trim(),'node_modules');
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-tui':join(modules,'@earendil-works/pi-tui/dist/index.js')}});
const {createQuestSelector,QUEST_PALETTES,questSelect}=await jiti.import('../surface.ts');
const {getThemeByName,initTheme}=await import(pathToFileURL(join(modules,'@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js')));
const {visibleWidth}=await import(pathToFileURL(join(modules,'@earendil-works/pi-tui/dist/index.js')));
initTheme('dark',false);
test('jade/gold surface fits narrow and wide Unicode widths in both themes; selection survives resize',()=>{
 for(const name of ['dark','light']) {
  let selected; const th=getThemeByName(name);
  const panel=createQuestSelector(th,'Explore 世界 🌱\nSource: a useful idea',['Read','Start','Save'],()=>24,v=>selected=v);
  for(const width of [1,2,8,24,40,80,120]) for(const line of panel.render(width)) assert.ok(visibleWidth(line)<=width,`${name} ${width}: ${visibleWidth(line)}`);
  panel.handleInput('\x1b[B'); panel.render(40); panel.handleInput('\r'); assert.equal(selected,'Start');
  panel.handleInput('\x1b');assert.equal(selected,undefined);
  assert.equal(th.appearance,name);
 }
});
test('gold discovery text, jade title and neutral body are rendered without altering theme',()=>{
 const th=getThemeByName('dark');const original=th.colors.text;
 const output=createQuestSelector(th,'Body\nDiscovery / evidence: Example',['Read'],()=>30,()=>{}).render(80).join('\n');
 assert.match(output,/Quests/);assert.match(output,/Explore · Connect/);assert.match(output,/Discovery \/ evidence/);
 assert.equal(th.colors.text,original);
 // WCAG luminance contrast against representative dark and light canvas colors.
 const lum=hex=>{const c=hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 for(const [name,bg] of [['dark','#181818'],['light','#ffffff']]) for(const color of Object.values(QUEST_PALETTES[name])) {const a=lum(color),b=lum(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5)}
});
test('height budget retains bottom rail and selected action through long content and resize',()=>{
 let height=60,selected;
 const choices=Array.from({length:12},(_,i)=>`Action ${i}`);
 const panel=createQuestSelector(getThemeByName('dark'),Array.from({length:180},(_,i)=>`Detail ${i} 世界`).join('\n'),choices,()=>height,v=>selected=v);
 for(height of [60,24,12,8,6,5,3,1,0,40]) for(const width of [2,4,20,80,200]) {
  const lines=panel.render(width);assert.ok(lines.length<=height,`${width}x${height}: ${lines.length}`);
  for(const line of lines)assert.ok(visibleWidth(line)<=width);
  if(height>=6&&width>=4){assert.match(plain(lines.at(-1)),/^╰.*╯$/);assert.ok(lines.some(l=>plain(l).includes('Action'))||width<20);}
  panel.handleInput('\x1b[6~');
 }
 height=24;panel.render(80);for(let i=0;i<11;i++)panel.handleInput('\x1b[B');
 const end=panel.render(80).map(plain).join('\n');assert.match(end,/Action 11/);panel.handleInput('\r');assert.equal(selected,'Action 11');
});
test('quest dialog uses an explicitly bounded overlay, independent of editor widgets',async()=>{
 let options,view;const terminal={rows:30};
 const pending=questSelect({mode:'tui',ui:{custom:async(factory,opts)=>{options=opts;view=factory({terminal,requestRender:()=>{}},getThemeByName('dark'),{},()=>{});return undefined}}},'Long detail\n'.repeat(200),['Continue','History']);
 await pending;assert.equal(options.overlay,true);assert.equal(options.overlayOptions.maxHeight,'90%');
 for(const rows of [30,12,6,2]){terminal.rows=rows;const lines=view.render(80);assert.ok(lines.length<=Math.max(1,Math.floor(rows*.9)));if(rows>=7)assert.match(plain(lines.at(-1)),/^╰.*╯$/);}
});
test('long details scroll and non-TUI selection retains native fallback',async()=>{
 const panel=createQuestSelector(getThemeByName('dark'),Array.from({length:50},(_,i)=>`Paragraph ${i}`).join('\n'),['Back'],()=>15,()=>{});
 const first=panel.render(60).join('\n');panel.handleInput('\x1b[6~');const next=panel.render(60).join('\n');assert.notEqual(first,next);
 let calls=0;assert.equal(await questSelect({mode:'rpc',ui:{select:async()=>{calls++;return 'Save'}}},'Title',['Save']),'Save');assert.equal(calls,1);
});
