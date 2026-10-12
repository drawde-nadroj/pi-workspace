import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, saveDraft, submit, advance, withdraw, counts } from './model.mjs';

test('initial sample distinguishes a blocker from a deferred question', () => {
  assert.deepEqual(counts(createState()), { done: 1, total: 4, blocking: 1, deferred: 1 });
});
test('drafting alone does not answer or change the linked work', () => {
  const s = createState(); saveDraft(s, 'q1', { choice: 'local', note: 'Keep this caveat.' });
  assert.equal(s.questions[0].state, 'awaiting'); assert.equal(s.tasks[3].status, 'blocked');
  assert.equal(s.events.length, 3);
});
test('submission and delivery preserve the release boundary; application records the sample consequence', () => {
  const s = createState(); saveDraft(s, 'q1', { choice: 'local', note: 'No public upload.' }); submit(s, 'q1');
  assert.equal(s.questions[0].state, 'submitted'); assert.equal(s.tasks[3].status, 'blocked');
  advance(s, 'q1'); assert.equal(s.questions[0].state, 'delivered'); assert.equal(s.tasks[3].status, 'blocked');
  advance(s, 'q1'); assert.equal(s.tasks[3].status, 'done'); assert.match(s.tasks[3].detail, /Publishing is excluded/);
  assert.equal(s.questions[0].answer.note, 'No public upload.');
  assert.equal(s.events[3].note, 'No public upload.');
  assert.deepEqual(s.events.map(e => e.kind), ['plan', 'posted', 'posted', 'submitted', 'delivered', 'applied']);
  assert.throws(() => advance(s, 'q1'));
});
test('custom scope is not inferred to approve publishing', () => {
  const s = createState(); saveDraft(s, 'q1', { choice: 'custom', custom: 'Ask me tomorrow', note: 'No automatic approval' });
  submit(s, 'q1'); advance(s, 'q1'); advance(s, 'q1');
  assert.equal(s.tasks[3].status, 'blocked'); assert.match(s.questions[0].consequence, /no approval is inferred/);
  assert.equal(s.requests[2].status, 'Work remaining');
});
test('deferred answer changes neither task completion nor release scope', () => {
  const s = createState(); saveDraft(s, 'q2', { choice: 'detailed' }); submit(s, 'q2'); advance(s, 'q2'); advance(s, 'q2');
  assert.equal(s.tasks[2].status, 'pending'); assert.equal(s.tasks[3].status, 'blocked'); assert.equal(counts(s).done, 1);
});
test('missing, unknown, and duplicate answers are rejected without extra events', () => {
  const s = createState(); assert.throws(() => submit(s, 'q1'));
  saveDraft(s, 'q1', { choice: 'invented' }); assert.throws(() => submit(s, 'q1'));
  saveDraft(s, 'q1', { choice: 'custom', custom: '   ' }); assert.throws(() => submit(s, 'q1'));
  saveDraft(s, 'q1', { choice: 'local' }); submit(s, 'q1');
  assert.throws(() => submit(s, 'q1')); assert.throws(() => saveDraft(s, 'q1', { note: 'late change' }));
  assert.equal(s.events.length, 4); assert.throws(() => advance(s, 'unknown'));
});
test('withdrawal is not approval and keeps linked work unchanged', () => {
  const s = createState(); withdraw(s, 'q1');
  assert.equal(s.tasks[3].status, 'blocked'); assert.equal(s.questions[0].answer, undefined);
  assert.throws(() => submit(s, 'q1')); assert.throws(() => withdraw(s, 'q1'));
});
test('new sample resets answer state and historical events without shared references', () => {
  const a = createState(); saveDraft(a, 'q1', { choice: 'local' }); submit(a, 'q1');
  const b = createState(); assert.equal(b.questions[0].state, 'awaiting'); assert.equal(b.questions[0].draft.choice, ''); assert.equal(b.events.length, 3);
});
