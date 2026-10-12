// Synthetic, memory-only state. No Pi integration, storage, timers, or network.
export const labels = { awaiting: 'Awaiting answer', submitted: 'Answer submitted', delivered: 'Delivered to agent', applied: 'Agent reports applied', withdrawn: 'Withdrawn' };
export function createState() {
  return {
    tasks: [
      { id: 't1', title: 'Make requests readable', status: 'done', detail: 'Plain-language titles lead. Original wording and acceptance criteria remain available in details.', request: 'r1' },
      { id: 't2', title: 'Check narrow layouts and keyboard navigation', status: 'active', detail: 'Independent local verification can continue while the release decision waits.', request: 'r2' },
      { id: 't3', title: 'Prepare the final handoff', status: 'pending', detail: 'The summary preference can wait until this step begins.', request: 'r2' },
      { id: 't4', title: 'Resolve the release boundary', status: 'blocked', detail: 'No publishing before the release decision has been delivered and applied.', request: 'r3' }
    ],
    requests: [
      { id: 'r1', title: 'Understand requests without learning IDs', status: 'Completion reported', source: 'Make the request view readable. I should not need to understand r1 to use it.', acceptance: 'Plain-language request titles lead; technical IDs and full criteria remain available in details.', tasks: ['t1'] },
      { id: 'r2', title: 'Keep the experience coherent at every width', status: 'Work remaining', source: 'Make the task panel, question overlay, and chat feel like one system, even in a small terminal.', acceptance: 'Narrow layouts preserve meaning and keyboard access. The same state has the same label across surfaces.', tasks: ['t2', 't3'] },
      { id: 'r3', title: 'Keep release actions behind an explicit decision', status: 'Work remaining', source: 'Ask before any publishing. Local verification can continue independently.', acceptance: 'The release boundary remains in place until the answer has been delivered and its consequence recorded.', tasks: ['t4'] }
    ],
    questions: [
      { id: 'q1', title: 'Should this refresh stay local?', short: 'Release boundary', urgency: 'blocking', state: 'awaiting', task: 't4', why: 'This changes the release scope. Nothing will be published from this preview.', boundary: 'Release actions wait. Local checks can continue.', options: [ { value: 'local', label: 'Keep it local', detail: 'Prepare a handoff; do not publish.' }, { value: 'release', label: 'Allow a later release step', detail: 'In the sample only: release still waits for verification.' } ], draft: { choice: '', note: '', custom: '' } },
      { id: 'q2', title: 'How much detail should the handoff include?', short: 'Final handoff', urgency: 'deferred', state: 'awaiting', task: 't3', why: 'Your preference changes the final report, not the current local checks.', boundary: 'Can wait until the handoff starts.', options: [ { value: 'brief', label: 'A concise summary', detail: 'Result, verification, and remaining limitations.' }, { value: 'detailed', label: 'A detailed walkthrough', detail: 'Include rationale and how the pieces connect.' } ], draft: { choice: '', note: '', custom: '' } }
    ],
    events: [
      { kind: 'plan', title: 'Plan created', body: 'Prepare the workspace refresh · 4 tasks', tone: 'accent' },
      { kind: 'posted', questionId: 'q1', title: 'Release decision requested', body: 'Release actions wait; local verification can continue.', tone: 'warning' },
      { kind: 'posted', questionId: 'q2', title: 'Handoff preference requested', body: 'Can wait until the final report.', tone: 'muted' }
    ]
  };
}
const find = (state, id) => { const q = state.questions.find(q => q.id === id); if (!q) throw new Error('Unknown question'); return q; };
export function saveDraft(state, id, patch) { const q = find(state, id); if (q.state !== 'awaiting') throw new Error('Question is no longer editable'); Object.assign(q.draft, patch); }
export function submit(state, id) {
  const q = find(state, id);
  if (q.state !== 'awaiting') throw new Error('This question already has an outcome');
  const option = q.options.find(o => o.value === q.draft.choice);
  const text = q.draft.choice === 'custom' ? q.draft.custom.trim() : option?.label;
  if (!text) throw new Error('Choose an answer or write your own');
  q.answer = { value: q.draft.choice, text, note: q.draft.note };
  q.state = 'submitted';
  state.events.push({ kind: 'submitted', questionId: id, title: 'You answered', body: text, note: q.answer.note, tone: 'user' });
}
export function advance(state, id) {
  const q = find(state, id);
  if (q.state === 'submitted') {
    q.state = 'delivered';
    state.events.push({ kind: 'delivered', questionId: id, title: 'Answer delivered', body: 'Available at the next model boundary. Not yet reported applied.', tone: 'accent' });
  } else if (q.state === 'delivered') {
    q.state = 'applied';
    const task = state.tasks.find(t => t.id === q.task);
    if (q.id === 'q1' && q.answer.value !== 'custom') {
      task.status = 'done';
      task.detail = q.answer.value === 'local' ? 'Sample consequence: keep the refresh local. Publishing is excluded.' : 'Sample consequence: a later release step may be planned, but still needs verified prerequisites. No action has been executed.';
      state.requests.find(r => r.id === 'r3').status = 'Completion reported';
      q.consequence = task.detail;
    } else if (q.id === 'q1') {
      task.status = 'blocked';
      q.consequence = 'The custom instruction was acknowledged. The release boundary stays blocked pending scope reconciliation; no approval is inferred.';
      task.detail = q.consequence;
    } else {
      q.consequence = `Sample handoff preference recorded: ${q.answer.text}. Local checks remain unchanged.`;
    }
    state.events.push({ kind: 'applied', questionId: id, title: 'Agent reports applying the answer', body: q.consequence, note: q.answer.note ? 'Your note remains part of the answer; this preview does not interpret it.' : '', tone: 'success' });
  } else throw new Error('No lifecycle step available');
}
export function withdraw(state, id) {
  const q = find(state, id);
  if (q.state !== 'awaiting') throw new Error('Only unanswered questions can be withdrawn');
  q.state = 'withdrawn';
  state.events.push({ kind: 'withdrawn', questionId: id, title: 'Question withdrawn', body: 'Sample agent withdrawal. This is not an answer or approval; linked work is unchanged.', tone: 'muted' });
}
export function counts(state) {
  return { done: state.tasks.filter(t => t.status === 'done').length, total: state.tasks.length, blocking: state.questions.filter(q => q.urgency === 'blocking' && ['awaiting', 'submitted', 'delivered'].includes(q.state)).length, deferred: state.questions.filter(q => q.urgency === 'deferred' && q.state === 'awaiting').length };
}
