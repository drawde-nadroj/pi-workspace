import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getKeybindings, visibleWidth, parseColor, CURSOR_MARKER } from '@earendil-works/pi-tui';
import { emptyPostedBook, postQuestion, changeQuestion, restorePostedBook, POSTED_ENTRY, ANSWER_MESSAGE, QUESTION_EVENT, postedContext, type PostedInput } from '../extensions/ask-user-question/posted-state.ts';
import { registerPostedQuestions } from '../extensions/ask-user-question/posted.ts';
import { TabbedQuestions } from '../extensions/ask-user-question/batch-ui.ts';
import { POSTED } from '../extensions/ask-user-question/posted-protocol.ts';
import { questionEventCard } from '../extensions/ask-user-question/posted-ui.ts';
import { sanitizeDisplayText } from '../extensions/ask-user-question/tui-primitives.ts';

const input: PostedInput = { question: 'Keep this local?', urgency: 'blocking', why: 'Release scope belongs to you.', boundary: 'Publishing waits. Local checks can continue.' };
const response = { status: 'answered' as const, answers: [{ questionIndex: 0, answer: 'Keep it local', note: 'No public upload.' }] };
const change = (b: any, op: any) => changeQuestion(b, 'q1', b.questions[0].revision, op);
const plainTheme: any = { appearance: 'dark', fg: (_: string, t: string) => t, bg: (_: string, t: string) => t, bold: (t: string) => t };

test('posted questions persist distinct states; notes and boundary survive application without Task mutation', () => {
  let b = postQuestion(emptyPostedBook(), input), initial = structuredClone(b);
  assert.equal(b.questions[0].state, 'awaiting');
  assert.throws(() => change(b, { op: 'apply', reason: 'Pretend approval' }), /delivered answer/);
  b = change(b, { op: 'submit', response }); assert.equal(b.questions[0].state, 'submitted');
  assert.doesNotMatch(postedContext(b), /No public upload/);
  b = change(b, { op: 'deliver' }); assert.equal(b.questions[0].state, 'delivered'); assert.match(postedContext(b), /No public upload/);
  b = change(b, { op: 'apply', reason: 'Publishing is excluded; prepare a local handoff.' });
  assert.equal(b.questions[0].state, 'applied'); assert.equal(b.questions[0].response.answers[0].note, 'No public upload.');
  assert.deepEqual(restorePostedBook(b), b); assert.equal(initial.questions[0].state, 'awaiting');
  assert.throws(() => change(b, { op: 'apply', reason: 'Duplicate' }), /delivered answer/);
});
test('needed-now escalation keeps the original submission identity and preserves the answer', () => {
  let b = postQuestion(emptyPostedBook(), { ...input, urgency: 'deferred', planId: 'p1', taskIds: ['t1'] });
  b = change(b, { op: 'submit', response }); const submitted = structuredClone(b.questions[0]);
  b = change(b, { op: 'needed', reason: 'The linked handoff is needed now.' });
  assert.equal(b.questions[0].urgency, 'blocking'); assert.equal(b.questions[0].submissionRevision, submitted.revision);
  assert.notEqual(b.questions[0].revision, submitted.revision); assert.deepEqual(b.questions[0].response, submitted.response);
  b = change(b, { op: 'deliver' }); assert.deepEqual(restorePostedBook(b), b);
  assert.equal(b.questions[0].state, 'delivered'); assert.match(postedContext(b), /needed now/);
});

test('skips and clarification can be delivered but never become reported approval', () => {
  for (const response of [
    { status: 'skipped', answers: [{ questionIndex: 0, answer: null, skipped: true }] },
    { status: 'clarification_requested', answers: [{ questionIndex: 0, answer: null }], clarification: 'What is publishing?' },
  ]) {
    let b = postQuestion(emptyPostedBook(), input); b = change(b, { op: 'submit', response }); b = change(b, { op: 'deliver' });
    assert.throws(() => change(b, { op: 'apply', reason: 'Approved' }), /not consent/);
    assert.deepEqual(restorePostedBook(b), b);
  }
});
test('replacement preserves the original and rejects stale revisions and duplicate submission', () => {
  let b = postQuestion(emptyPostedBook(), input), revision = b.questions[0].revision;
  b = change(b, { op: 'replace', reason: 'Scope is now local only.', input: { ...input, question: 'Which handoff format?', urgency: 'deferred' } });
  assert.equal(b.questions[0].state, 'replaced'); assert.equal(b.questions[0].replacementId, 'q2');
  assert.equal(b.questions[0].definition.question, input.question);
  assert.throws(() => changeQuestion(b, 'q1', revision, { op: 'submit', response }), /Question changed/);
  assert.deepEqual(restorePostedBook(b), b);
});
test('future/malformed history and invalid links, choices, answers, or drafts fail closed', () => {
  const b = postQuestion(emptyPostedBook(), input);
  assert.throws(() => restorePostedBook({ ...b, version: 2 }), /Unsupported/);
  assert.throws(() => restorePostedBook({ ...b, questions: [...b.questions, ...b.questions] }), /Invalid question/);
  assert.throws(() => postQuestion(b, { ...input, taskIds: ['t1'] }), /Task links/);
  assert.throws(() => postQuestion(b, { ...input, options: [] }), /choices/);
  assert.throws(() => postQuestion(b, { ...input, options: [{ label: ' ' }] }), /nonblank/);
  assert.throws(() => change(b, { op: 'draft', draft: { selected: [null] } }), /draft/);
  assert.throws(() => change(b, { op: 'submit', response: { status: 'answered', answers: [{ questionIndex: 0, answer: { type: 'option', label: 'Fake', value: 'fake', index: 0 } }] } }), /original choice/);
  assert.throws(() => change(b, { op: 'submit', response: { ...response, answers: [{ questionIndex: 0, answer: 'a'.repeat(140000) }] } }), /oversized/);
});
test('durable drafts restore unsubmitted text, custom selections and note input', () => {
  const tui: any = { terminal: { rows: 40 }, requestRender() {} };
  const q = { question: 'Why?', mode: 'text' as const, options: [] };
  const a = new TabbedQuestions([q], tui, plainTheme, getKeybindings(), () => {});
  a.handleInput('An unfinished answer');
  const draft = a.captureDraft(); assert.equal(draft.committed, false);
  let b = postQuestion(emptyPostedBook(), { ...input, question: q.question }); b = change(b, { op: 'draft', draft });
  const saved = restorePostedBook(b).questions[0].draft;
  const reopened = new TabbedQuestions([q], tui, plainTheme, getKeybindings(), () => {}, process.cwd(), saved);
  assert.match(sanitizeDisplayText(reopened.render(80).join('\n')), /An unfinished answer/);
  assert.equal(b.questions[0].state, 'awaiting'); assert.equal(b.questions[0].response, undefined);
});

function harness(mode = 'tui') {
  const hooks = new Map<string, any[]>(), commands = new Map<string, any>(), tools = new Map<string, any>(), subs = new Map<string, any[]>();
  const entries: any[] = [], messages: any[] = [], notices: string[] = [], widgets = new Map(); let branch = entries, fail = false;
  const forms: any[] = [];
  const colors = Object.fromEntries(['text', 'accent', 'muted', 'customMessageBg'].map(k => [k, parseColor(k === 'customMessageBg' ? '#171925' : k === 'accent' ? '#bbadff' : '#dcdcee')]));
  const theme = { ...plainTheme, colors, getColorMode: () => 'truecolor', style: (t: string) => t };
  const ctx: any = { mode, hasUI: mode === 'tui', cwd: process.cwd(), sessionManager: { getSessionId: () => 'posted-test', getBranch: () => branch },
    ui: { theme, notify: (s: string) => notices.push(s), setWidget: (k: string, v: any) => v ? widgets.set(k, v) : widgets.delete(k), confirm: async () => false,
      custom: (factory: any, options: any) => new Promise(resolve => { const component = factory({ terminal: { rows: 40 }, requestRender() {} }, theme, getKeybindings(), resolve); component.focused = true; forms.push({ component, options }); }), select: async () => undefined } };
  const pi: any = { events: { on(k: string, fn: any) { if (!subs.has(k)) subs.set(k, []); subs.get(k)!.push(fn); }, emit(k: string, d: any) { for (const fn of subs.get(k) ?? []) fn(d); } },
    on(k: string, fn: any) { if (!hooks.has(k)) hooks.set(k, []); hooks.get(k)!.push(fn); }, registerTool: (t: any) => tools.set(t.name, t), registerCommand: (k: string, c: any) => commands.set(k, c),
    registerEntryRenderer() {}, registerMessageRenderer() {}, appendEntry(customType: string, data: any) { if (fail) throw new Error('Storage failed'); entries.push({ type: 'custom', customType, data: structuredClone(data) }); }, sendMessage: (m: any, opts: any) => messages.push({ ...structuredClone(m), role: 'custom', opts }) };
  registerPostedQuestions(pi, fn => fn());
  const emit = async (k: string, d: any = {}) => { let result: any; for (const fn of hooks.get(k) ?? []) result = await fn(d, ctx) ?? result; return result; };
  const call = (p: any) => tools.get('question_queue').execute('test', p, undefined, undefined, ctx);
  return { pi, ctx, entries, messages, forms, notices, widgets, emit, call, commands, branch(b: any[]) { branch = b; }, fail() { fail = true; } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('native standalone posting returns immediately; overlay back keeps draft; explicit submission steers; context receipts deliver', async () => {
  const h = harness(); await h.emit('session_start'); await h.call({ op: 'post', question: input });
  assert.equal(h.forms.length, 0); assert.equal(h.messages.length, 0); assert.ok(h.widgets.has('pi-ask:posted'));
  let opening = h.commands.get('questions').handler('q1', h.ctx); await tick();
  let f = h.forms.at(-1); assert.equal(f.options.overlay, true);
  f.component.handleInput('Keep it local'); f.component.handleInput('\x1b'); await opening;
  assert.equal(h.entries.at(-1).data.questions[0].draft.textBuffer, 'Keep it local');
  opening = h.commands.get('questions').handler('q1', h.ctx); await tick(); f = h.forms.at(-1);
  for (const width of [12, 24, 80, 120]) assert.ok(f.component.render(width).every((r: string) => visibleWidth(r) <= width));
  assert.match(sanitizeDisplayText(f.component.render(80).join('\n')), /Keep it local/);
  assert.ok(f.component.render(80).join('\n').includes(CURSOR_MARKER));
  f.component.handleInput('\r'); f.component.handleInput('\r'); await opening;
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].opts.deliverAs, 'steer');
  assert.equal(h.entries.at(-1).data.questions[0].state, 'submitted');
  const submitted = structuredClone(h.messages[0]);
  const context = await h.emit('context', { messages: h.messages });
  assert.equal(h.entries.filter(e => e.customType === POSTED_ENTRY).at(-1).data.questions[0].state, 'delivered');
  assert.match(context.messages.at(-1).content, /Keep it local/);
  const listed = JSON.parse((await h.call({ op: 'list' })).content[0].text);
  await h.call({ op: 'apply', id: 'q1', revision: listed.questions[0].revision, reason: 'Keep the release local.' });
  assert.equal(JSON.parse((await h.call({ op: 'list' })).content[0].text).questions[0].state, 'applied');
  assert.deepEqual(h.messages[0], submitted, 'historical submission must not rewrite to applied');
  assert.equal(h.entries.filter(e => e.customType === QUESTION_EVENT).length, 1, 'only delivery needs an extra visible event; tool results own their events');
});
test('branch/reload closes old input and rejects stale responses; submitted responses are never automatically resent', async () => {
  const h = harness(); await h.emit('session_start'); await h.call({ op: 'post', question: input });
  const opening = h.commands.get('questions').handler('q1', h.ctx); await tick();
  h.forms.at(-1).component.handleInput('Stale draft');
  h.branch([]); await h.emit('session_tree'); await opening;
  assert.equal(h.messages.length, 0); assert.match(h.notices.join('\n'), /stale response/);
  h.branch(h.entries); await h.emit('session_start');
  await h.emit('session_compact'); assert.equal(h.messages.length, 0);
});
test('malformed storage and failed persistence cannot overwrite or publish success', async () => {
  const h = harness(); h.entries.push({ type: 'custom', customType: POSTED_ENTRY, data: { version: 99 } }); await h.emit('session_start');
  await assert.rejects(() => h.call({ op: 'post', question: input }), /unreadable/); assert.equal(h.entries.length, 1);
  const failed = harness(); await failed.emit('session_start'); failed.fail();
  await assert.rejects(() => failed.call({ op: 'post', question: input }), /Storage failed/);
  assert.equal(failed.entries.length, 0); assert.equal(failed.messages.length, 0);
});
test('non-TUI posting remains functional and linked questions require a current catalogue', async () => {
  const h = harness('print'); await h.emit('session_start');
  await assert.rejects(() => h.call({ op: 'post', question: { ...input, planId: 'p1', taskIds: ['t1'] } }), /unavailable/);
  h.pi.events.emit(POSTED.catalogue, { version: 1, sessionId: 'posted-test', available: true, plans: [{ id: 'p1', taskIds: ['t1'] }] });
  await h.call({ op: 'post', question: { ...input, planId: 'p1', taskIds: ['t1'] } });
  await h.commands.get('questions').handler('q1', h.ctx); assert.equal(h.forms.length, 0); assert.match(h.notices.join('\n'), /interactive TUI/);
});
test('chat preserves exact answers/notes, sanitizes terminal controls, and fits small widths', () => {
  let b = postQuestion(emptyPostedBook(), input); b = change(b, { op: 'submit', response: { status: 'answered', answers: [{ questionIndex: 0, answer: 'Local 界面', note: 'Line 1\nLine 2\x1b[31m' }] } });
  const card = questionEventCard({ label: 'You submitted a response', question: b.questions[0] }, plainTheme);
  for (const width of [1, 8, 24, 80]) assert.ok(card.render(width).every((s: string) => visibleWidth(s) <= width));
  assert.match(card.render(80).join('\n'), /Line 1.*\n.*Line 2/); assert.doesNotMatch(card.render(80).join('\n'), /\x1b\[31m/);
});
