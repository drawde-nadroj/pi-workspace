import { createState, labels, saveDraft, submit, advance, withdraw, counts } from './model.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = createState(), view = 'work', selectedQuestion = null, returnFocus = null;
const symbols = { done: '✓', active: '↳', pending: '○', blocked: '!', blocking: '!', deferred: '?' };
const taskLabels = { done: 'Completion reported', active: 'Local checks · sample active work', pending: 'Not started', blocked: 'Waiting on a decision' };
function announce(text) { $('#announcement').textContent = text; }
function renderSummary() {
  const c = counts(state);
  $('#plan-summary').innerHTML = `<span>${c.done} of ${c.total} tasks complete</span>${c.blocking ? `<span class="warning">${c.blocking} blocking question</span>` : ''}${c.deferred ? `<span>${c.deferred} can wait</span>` : ''}`;
  const unanswered = state.questions.filter(q => q.state === 'awaiting').length;
  $('#question-count').textContent = unanswered;
  $('#open-questions').textContent = unanswered ? `${unanswered} question${unanswered === 1 ? '' : 's'}` : 'Review answers';
}
function taskRow(t) {
  return `<button class="list-row" data-kind="task" data-id="${t.id}" data-status="${t.status}"><span class="row-symbol" aria-hidden="true">${symbols[t.status]}</span><span class="row-body"><span class="row-title">${esc(t.title)}</span><span class="row-status">${taskLabels[t.status]}</span></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
}
function questionRow(q) {
  const subtitle = q.state === 'awaiting' ? q.boundary : q.state === 'withdrawn' ? 'Not an answer. Linked work is unchanged.' : q.state === 'applied' ? q.consequence : q.state === 'submitted' ? 'Saved in this preview. Not delivered or applied yet.' : 'Available to the sample agent. Not reported applied yet.';
  return `<button class="list-row" data-kind="question" data-id="${q.id}" data-status="${q.urgency}"><span class="row-symbol" aria-hidden="true">${q.state === 'applied' ? '✓' : q.state === 'withdrawn' ? '–' : symbols[q.urgency]}</span><span class="row-body"><span class="row-title">${esc(q.title)}</span><span class="row-subtitle">${esc(subtitle)}</span>${q.state !== 'awaiting' ? `<span class="row-status">${labels[q.state]}</span>` : ''}</span><span class="row-arrow" aria-hidden="true">›</span></button>`;
}
function renderView() {
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
  });
  $('#view').setAttribute('aria-labelledby', `tab-${view}`);
  if (view === 'work') {
    const open = state.tasks.filter(t => t.status !== 'done'), done = state.tasks.filter(t => t.status === 'done');
    $('#view').innerHTML = `<p class="group-label">IN PROGRESS & NEXT</p>${open.map(taskRow).join('')}${done.length ? `<details class="completed-group"><summary>${done.length} completed · agent-reported</summary>${done.map(taskRow).join('')}</details>` : ''}`;
    $('#view-hint').textContent = 'Details stay one step away';
  } else if (view === 'requests') {
    $('#view').innerHTML = `<p class="group-label">WHAT YOU ASKED FOR</p>${state.requests.map(r => `<button class="list-row" data-kind="request" data-id="${r.id}"><span class="row-symbol ${r.status === 'Completion reported' ? 'success' : ''}" aria-hidden="true">${r.status === 'Completion reported' ? '✓' : '○'}</span><span class="row-body"><span class="row-title">${esc(r.title)}</span><span class="row-subtitle">${r.status} · ${r.tasks.length} linked task${r.tasks.length === 1 ? '' : 's'}</span></span><span class="row-arrow" aria-hidden="true">›</span></button>`).join('')}`;
    $('#view-hint').textContent = 'Original wording is preserved in details';
  } else {
    const blocking = state.questions.filter(q => q.state === 'awaiting' && q.urgency === 'blocking');
    const deferred = state.questions.filter(q => q.state === 'awaiting' && q.urgency === 'deferred');
    const answered = state.questions.filter(q => q.state !== 'awaiting');
    $('#view').innerHTML = `${blocking.length ? `<p class="group-label warning">NEEDS YOUR ANSWER TO PROCEED</p>${blocking.map(questionRow).join('')}` : ''}${deferred.length ? `<p class="group-label">CAN ANSWER WHILE WORK CONTINUES</p>${deferred.map(questionRow).join('')}` : ''}${answered.length ? `<p class="group-label">ANSWERS & OUTCOMES</p>${answered.map(questionRow).join('')}` : ''}`;
    $('#view-hint').textContent = 'Answer here. Stay connected to the work.';
  }
}
function renderEvents() {
  const events = $('#events');
  const atBottom = events.scrollHeight - events.scrollTop - events.clientHeight < 40;
  // Historical entries are append-only. Only new events enter the live region.
  for (let i = events.children.length; i < state.events.length; i++) {
    const e = state.events[i], article = document.createElement('article');
    article.className = 'event'; article.dataset.tone = e.tone;
    article.id = `event-${i}`;
    article.innerHTML = `<div class="event-meta"><span>${e.tone === 'user' ? 'YOU' : 'SAMPLE EVENT'}</span><span>${String(i + 1).padStart(2, '0')}</span></div><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p>${e.note ? `<details><summary>Note · preserved with the answer</summary><p>${esc(e.note)}</p></details>` : ''}${e.questionId ? `<button class="event-link" id="event-question-${i}" data-question="${e.questionId}">Open related question ↗</button>` : ''}`;
    events.append(article);
  }
  if (atBottom) events.scrollTop = events.scrollHeight;
}
function render() { renderSummary(); renderView(); renderEvents(); }
function setView(next, focus = false) { view = next; renderView(); if (focus) $(`#tab-${view}`).focus(); }
function rememberFocus(element) { returnFocus = element?.dataset.id ? `[data-kind="${element.dataset.kind}"][data-id="${element.dataset.id}"]` : element?.id ? `#${element.id}` : `#tab-${view}`; }
function restoreFocus() { const target = returnFocus && $(returnFocus); (target || $(`#tab-${view}`)).focus(); }
function positionDialog(dialog) {
  if (!dialog.open) return;
  const anchor = $('#workspace').getBoundingClientRect();
  const width = dialog.offsetWidth, height = dialog.offsetHeight;
  dialog.style.left = `${Math.max(15, Math.min(anchor.left + (anchor.width - width) / 2, innerWidth - width - 15))}px`;
  dialog.style.top = `${Math.max(20, Math.min(anchor.top + 20, innerHeight - height - 20))}px`;
}
function detail(kind, id, opener) {
  rememberFocus(opener);
  const item = (kind === 'task' ? state.tasks : state.requests).find(x => x.id === id);
  const related = state.questions.find(q => q.task === id);
  const body = kind === 'task' ? `<section class="detail-section"><h3>STATUS</h3><p>${taskLabels[item.status]}</p></section><section class="detail-section"><h3>PURPOSE & BOUNDARY</h3><p>${esc(item.detail)}</p></section><section class="detail-section"><h3>RELATED REQUEST</h3><p>${esc(state.requests.find(r => r.id === item.request)?.title)}</p></section>${related ? `<button class="primary" id="detail-question" data-question="${related.id}">Open related question ↗</button>` : ''}` : `<section class="detail-section"><h3>ORIGINAL WORDING · SAMPLE</h3><p>${esc(item.source)}</p></section><section class="detail-section"><h3>WHAT SATISFACTION LOOKS LIKE</h3><p>${esc(item.acceptance)}</p></section><section class="detail-section"><h3>LINKED WORK</h3><p>${item.tasks.map(id => esc(state.tasks.find(t => t.id === id).title)).join('<br>')}</p></section><section class="detail-section"><h3>COVERAGE</h3><p>${item.status}. This is a structural report, not independent verification.</p></section>`;
  $('#detail-dialog').innerHTML = `<div class="dialog-shell"><div class="dialog-top"><button class="back-button" id="detail-back">← Back to ${view}</button><span>REFERENCE ${item.id}</span></div><h2 id="detail-title">${esc(item.title)}</h2>${body}<p class="simulation-note">SYNTHETIC RECORD · NO LIVE TASKS OR REQUESTS</p></div>`;
  $('#detail-dialog').showModal(); positionDialog($('#detail-dialog'));
  $('#detail-back').onclick = () => $('#detail-dialog').close();
  if ($('#detail-question')) $('#detail-question').onclick = event => { $('#detail-dialog').close(); setView('questions'); openAsk(event.currentTarget.dataset.question, $('[data-id="' + event.currentTarget.dataset.question + '"]')); };
}
function openAsk(id, opener) {
  rememberFocus(opener); selectedQuestion = id; renderAsk(); $('#ask-dialog').showModal(); positionDialog($('#ask-dialog'));
}
function renderAsk() {
  const q = state.questions.find(q => q.id === selectedQuestion);
  const type = `<span class="question-type ${q.urgency}">${q.urgency === 'blocking' ? 'BLOCKS LINKED WORK' : 'CAN WAIT'}</span>`;
  const top = `<div class="dialog-top"><button class="back-button" id="ask-back">← Back to Questions</button><span>TASKS → ${esc(q.short)}</span></div>${type}<h2 id="ask-title">${esc(q.title)}</h2><p class="question-context">${esc(q.why)}</p><div class="boundary ${q.urgency}">${esc(q.boundary)}</div>`;
  if (q.state === 'awaiting') {
    $('#ask-dialog').innerHTML = `<div class="dialog-shell">${top}<form id="answer-form"><fieldset class="answer-options"><legend class="sr-only">Choose an answer</legend>${[...q.options, { value: 'custom', label: 'Something else', detail: 'Write your own answer; no approval is inferred.' }].map(o => `<label class="option"><input type="radio" name="answer" value="${o.value}" ${q.draft.choice === o.value ? 'checked' : ''}><span><strong>${esc(o.label)}</strong><small>${esc(o.detail)}</small></span></label>`).join('')}</fieldset><div id="custom-field" ${q.draft.choice !== 'custom' ? 'hidden' : ''}><label class="field-label" for="custom-answer">Your answer</label><textarea id="custom-answer" placeholder="What would you like instead?">${esc(q.draft.custom)}</textarea></div><label class="field-label" for="answer-note">A note or caveat <span class="muted">· optional</span></label><textarea id="answer-note" placeholder="Anything the agent should keep with this answer…">${esc(q.draft.note)}</textarea><p id="form-error" class="form-error" role="alert"></p><div class="form-footer"><p>Back keeps your draft.<br>Submit saves only to this preview.</p><button class="primary" id="submit-answer" type="submit" ${!q.draft.choice || q.draft.choice === 'custom' && !q.draft.custom.trim() ? 'disabled' : ''}>Submit answer →</button></div></form><button class="withdraw-button" id="withdraw-question">Simulate agent withdrawal · not an answer</button></div>`;
    const updateEnabled = () => { $('#submit-answer').disabled = !q.draft.choice || q.draft.choice === 'custom' && !q.draft.custom.trim(); };
    document.querySelectorAll('input[name=answer]').forEach(input => input.onchange = () => { saveDraft(state, q.id, { choice: input.value }); $('#custom-field').hidden = input.value !== 'custom'; updateEnabled(); if (input.value === 'custom') $('#custom-answer').focus(); });
    $('#custom-answer').oninput = event => { saveDraft(state, q.id, { custom: event.target.value }); updateEnabled(); };
    $('#answer-note').oninput = event => saveDraft(state, q.id, { note: event.target.value });
    $('#answer-form').onsubmit = event => {
      event.preventDefault();
      try { submit(state, q.id); render(); $('#ask-dialog').close(); announce('Answer submitted to the preview. It is not delivered or applied yet.'); }
      catch (error) { $('#form-error').textContent = error.message; }
    };
    $('#withdraw-question').onclick = () => { withdraw(state, q.id); render(); $('#ask-dialog').close(); announce('Sample question withdrawn. No approval; linked work unchanged.'); };
  } else {
    const stages = ['submitted', 'delivered', 'applied'], index = stages.indexOf(q.state);
    const body = q.state === 'withdrawn' ? `<p class="result-note">Withdrawn in the sample. This is not an answer or approval. The linked work has not changed.</p>` : `<div class="journey" aria-label="Answer lifecycle">${stages.map((step, i) => `<span class="${i <= index ? 'reached' : ''}">${i + 1}. ${step === 'applied' ? 'Reported applied' : step[0].toUpperCase() + step.slice(1)}</span>`).join('')}</div><div class="answer-block"><p class="eyebrow user-color">YOUR ANSWER</p><p>${esc(q.answer.text)}</p>${q.answer.note ? `<p class="answer-note">${esc(q.answer.note)}</p>` : ''}</div><p class="result-note">${q.state === 'submitted' ? 'Your answer is saved in this preview. The release boundary has not changed.' : q.state === 'delivered' ? 'The sample agent has received the answer. Receiving it does not mean it has been applied.' : esc(q.consequence)}</p>${q.state !== 'applied' ? `<div class="form-footer"><p>Demo controls—not live delivery.<br>No action executes.</p><button class="primary" id="advance-answer">${q.state === 'submitted' ? 'Simulate delivery →' : 'Simulate application →'}</button></div>` : ''}`;
    $('#ask-dialog').innerHTML = `<div class="dialog-shell">${top}<p class="eyebrow">${labels[q.state].toUpperCase()}</p>${body}<p class="simulation-note">SAMPLE LIFECYCLE · NO AGENT RECEIVES THIS ANSWER</p></div>`;
    if ($('#advance-answer')) $('#advance-answer').onclick = () => { advance(state, q.id); render(); renderAsk(); positionDialog($('#ask-dialog')); ($('#advance-answer') || $('#ask-back')).focus(); announce(labels[q.state]); };
  }
  $('#ask-back').onclick = () => $('#ask-dialog').close();
}
window.addEventListener('resize', () => { positionDialog($('#ask-dialog')); positionDialog($('#detail-dialog')); });
$('#ask-dialog').addEventListener('close', restoreFocus);
$('#detail-dialog').addEventListener('close', () => { if (!$('#ask-dialog').open) restoreFocus(); });
$('#view').onclick = event => { const row = event.target.closest('.list-row'); if (!row) return; row.dataset.kind === 'question' ? openAsk(row.dataset.id, row) : detail(row.dataset.kind, row.dataset.id, row); };
$('#view').onkeydown = event => {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const rows = [...$('#view').querySelectorAll('.list-row')].filter(row => row.getClientRects().length);
  if (!rows.length) return;
  event.preventDefault(); const i = rows.indexOf(document.activeElement), delta = event.key === 'ArrowDown' ? 1 : -1;
  rows[(i + delta + rows.length) % rows.length].focus();
};
$('.tabs').onclick = event => { const button = event.target.closest('[data-view]'); if (button) setView(button.dataset.view); };
$('.tabs').onkeydown = event => {
  if (!['ArrowLeft', 'ArrowRight', 'Workspace', 'End'].includes(event.key)) return;
  event.preventDefault(); const views = ['work', 'requests', 'questions'], i = views.indexOf(view);
  setView(event.key === 'Workspace' ? views[0] : event.key === 'End' ? views[2] : views[(i + (event.key === 'ArrowRight' ? 1 : 2)) % 3], true);
};
$('#events').onclick = event => { const button = event.target.closest('[data-question]'); if (button) { $('#workspace').hidden = false; $('#closed-hint').hidden = true; setView('questions'); openAsk(button.dataset.question, button); } };
$('#open-questions').onclick = () => { $('#workspace').hidden = false; $('#closed-hint').hidden = true; setView('questions', true); };
$('#close-workspace').onclick = () => { $('#workspace').hidden = true; $('#closed-hint').hidden = false; $('#reopen-workspace').focus(); };
$('#reopen-workspace').onclick = () => { $('#workspace').hidden = false; $('#closed-hint').hidden = true; $(`#tab-${view}`).focus(); };
$('#theme-toggle').onclick = event => { const light = document.documentElement.dataset.theme !== 'light'; document.documentElement.dataset.theme = light ? 'light' : 'dark'; event.currentTarget.textContent = light ? 'Dark theme' : 'Light theme'; event.currentTarget.setAttribute('aria-pressed', String(light)); };
$('#width-toggle').onclick = event => { const narrow = document.body.classList.toggle('narrow'); event.currentTarget.textContent = narrow ? 'Wide view' : 'Narrow view'; event.currentTarget.setAttribute('aria-pressed', String(narrow)); };
$('#reset').onclick = () => { state = createState(); view = 'work'; selectedQuestion = null; $('#events').replaceChildren(); $('#workspace').hidden = false; $('#closed-hint').hidden = true; render(); announce('Sample reset. All preview answers and drafts cleared.'); };
render();
