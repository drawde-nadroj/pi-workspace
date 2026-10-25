import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { QuestStore } = await jiti.import('../store.ts');
const seed = { title:'A useful primitive', why:'Reuse an idea', firstMove:'Explore an example', source:'Current discussion', kind:'depth' };
async function fixture(fn) { const dir = mkdtempSync(join(tmpdir(),'pi-quests-')); try { await fn(new QuestStore(join(dir,'journal.sqlite')), dir); } finally { await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50}); } }
test('persistent paths retain origins, promotion, questions, links and history across connections', () => fixture((s, dir) => {
  const local = join(dir,'project');
  let q = s.offer(seed, local, 'session-a');
  const other = s.offer({...seed,title:'Related'}, join(dir,'elsewhere'), 'session-b');
  assert.equal(s.list(local).length,1);
  q = s.update(q.id,q.revision,{global:true,question:'Where else?',link:other.id,evidence:'A concrete example'},'agent');
  q = s.update(q.id,q.revision,{questionId:q.questions[0].id,answer:'Language learning'},'user');
  const reread = new QuestStore(s.path).get(q.id);
  assert.equal(reread.origin.session,'session-a'); assert.equal(reread.questions[0].answer,'Language learning');
  assert.equal(s.list(join(dir,'third')).length,1); assert.deepEqual(reread.links,[other.id]);
  assert.equal(s.history(q.id).length,3);
}));
test('Start and Save belong to the user; revisions protect concurrent edits and completion needs evidence', () => fixture((s,dir) => {
  let q=s.offer(seed,dir,'s');
  for(const state of ['saved','active','declined','completed','paused']) assert.throws(()=>s.update(q.id,q.revision,{state},'agent'));
  q=s.update(q.id,q.revision,{state:'saved'},'user');
  assert.equal(q.state,'saved');
  assert.throws(()=>s.update(q.id,1,{title:'stale'},'agent'),/changed/);
  q=s.update(q.id,q.revision,{state:'active',goal:'Write a reusable example'},'user');
  assert.throws(()=>s.update(q.id,q.revision,{state:'completed'},'agent'),/evidence/);
  q=s.update(q.id,q.revision,{state:'completed',evidence:'Wrote the example'},'agent');
  assert.equal(q.state,'completed'); assert.equal(s.history(q.id).length,4);
}));
test('invalid text and links fail without partial changes', () => fixture((s,dir) => {
  assert.throws(()=>s.offer({...seed,title:'\x1b[31m'},dir,'s'));
  const q=s.offer(seed,dir,'s');
  assert.throws(()=>s.update(q.id,q.revision,{title:'Changed',link:'missing'},'agent'));
  assert.equal(s.get(q.id).title,seed.title);
}));
const install=join(homedir(),'.pi/agent/install');
const host=process.env.PI_WORKSPACE_HOST_MODULES || process.env.PI_HOME_HOST_MODULES || join(install,'releases',readFileSync(join(install,'current-version'),'utf8').trim(),'node_modules');
test('standalone host loads Quests without a settlement continuation', () => fixture(async (_s,dir) => {
  const previous=process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR=dir;
  try {
    const {loadExtensions}=await import(pathToFileURL(join(host,'@earendil-works/pi-coding-agent/dist/core/extensions/loader.js')));
    const loaded=await loadExtensions([fileURLToPath(new URL('../index.ts',import.meta.url))],dir);
    assert.deepEqual(loaded.errors,[]);
    const extension=loaded.extensions[0];
    assert.ok(extension.tools.has('quests')); assert.ok(extension.commands.has('quests'));
    assert.equal(extension.handlers.has('agent_before_settle'),false);
  } finally { if(previous===undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR=previous; }
}));
