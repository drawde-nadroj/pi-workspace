import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {jiti,root,plain,visibleWidth} from '../../pi-egregore/tests/host.mjs';
const {possibilityMarkdown}=await jiti.import(fileURLToPath(new URL('../possibility-markdown.ts',import.meta.url)));
const {default:register}=await jiti.import(fileURLToPath(new URL('../index.ts',import.meta.url)));
const {getThemeByName,getMarkdownTheme,initTheme}=await import(pathToFileURL(join(root,'@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js')));
const {ExtensionRunner}=await import(pathToFileURL(join(root,'@earendil-works/pi-coding-agent/dist/core/extensions/runner.js')));
const {AssistantMessageComponent}=await import(pathToFileURL(join(root,'@earendil-works/pi-coding-agent/dist/modes/interactive/components/assistant-message.js')));
const marked='The answer you asked for.\n\n**Possibility · A return page 世界 🌱**\n\nIt could help us recover a thought.\n\nBack to your question.';
test('only explicitly marked assistant titles transform; examples, ordinary text and incomplete streaming stay intact',()=>{
 const theme=getThemeByName('dark');
 for(const messageType of ['user','assistant-thinking'])assert.equal(possibilityMarkdown(marked,{messageType},theme),marked);
 for(const text of ['ordinary Possibility · text','**Possibility · unfinished','> **Possibility · quoted**','    **Possibility · code**','```md\n**Possibility · example**\n```','~~~~\n**Possibility · example**\n~~~~','<!--\n**Possibility · comment**\n-->','**Possibility · [a link](https://example.test)**'])assert.equal(possibilityMarkdown(text,{messageType:'assistant'},theme),text);
 assert.equal(possibilityMarkdown(marked,{messageType:'assistant'}),marked);
 const rendered=possibilityMarkdown(marked,{messageType:'assistant'},theme);
 assert.ok(rendered.includes('101;214;173'));assert.equal(plain(rendered),marked.replace('**Possibility · A return page 世界 🌱**','Possibility · A return page 世界 🌱'));
 assert.ok(marked.includes('**Possibility'),'input retained');
});
test('native assistant rendering keeps main answer, green title, neutral prose and cell bounds',t=>{
 if(typeof ExtensionRunner.prototype.getMarkdownTransformers !== 'function'){t.skip('Host lacks public Markdown-transform capability; plain fallback and registration are tested separately.');return;}
 initTheme('dark');
 for(const name of ['dark','light']){
  const theme=getThemeByName(name),transform=(text,ctx)=>possibilityMarkdown(text,ctx,theme);
  const message={role:'assistant',content:[{type:'text',text:marked}],stopReason:'stop',timestamp:1};
  const before=structuredClone(message);
  const component=new AssistantMessageComponent(message,false,getMarkdownTheme(),'Thinking...',0,[transform]);
  for(const width of [8,24,64,100]){
   const rows=component.render(width);assert.ok(rows.every(row=>visibleWidth(row)<=width));
   if(width>=64){const text=plain(rows.join('\n'));assert.match(text,/The answer you asked for/);assert.match(text,/Possibility · A return page/);assert.match(text,/Back to your question/);}
  }
  const rows=component.render(100),green=name==='light'?'0;107;80':'101;214;173';
  assert.ok(rows.find(r=>plain(r).includes('Possibility')).includes(green));
  assert.ok(!rows.find(r=>plain(r).includes('It could help')).includes(green));
  assert.deepEqual(message,before);
 }
});
test('optional public transformer follows theme lifecycle and absent capability retains standalone loading',async()=>{
 const handlers=new Map();let transform;
 register({registerTool:()=>{},registerCommand:()=>{},events:{emit:()=>{}},on:(n,fn)=>handlers.set(n,fn),registerMarkdownTransformer:fn=>transform=fn});
 assert.equal(transform(marked,{messageType:'assistant'}),marked);
 const ui={theme:getThemeByName('dark')};await handlers.get('session_start')({}, {ui});
 assert.ok(transform(marked,{messageType:'assistant'}).includes('101;214;173'));
 ui.theme=getThemeByName('light');assert.ok(transform(marked,{messageType:'assistant'}).includes('0;107;80'));
 await handlers.get('session_shutdown')();assert.equal(transform(marked,{messageType:'assistant'}),marked);
 assert.doesNotThrow(()=>register({registerTool:()=>{},registerCommand:()=>{},events:{emit:()=>{}},on:()=>{}}));
});
