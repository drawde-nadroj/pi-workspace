import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { matchesKey, Text, wrapTextWithAnsi, truncateToWidth } from '@earendil-works/pi-tui';
import { frameRows } from './frame.ts';
import { questionAccent } from './question-surface.ts';
import { TabbedQuestions, type BatchUIResult, type QuestionDraft } from './batch-ui.ts';
import { questionTheme, questionViewport, frameQuestion } from './question-surface.ts';
import { savedAskAppearance } from './appearance.ts';
import { sanitizeDisplayText } from './tui-primitives.ts';
import { questionStatus } from 'pi-agent-contracts/posted';
import type { PostedQuestion } from './posted-state.ts';

/** Reuse Ask's editors/choice/review machinery. Only the temporary overlay/back contract differs. */
export async function postedQuestionUI(ctx: ExtensionContext, q: PostedQuestion, current: () => boolean,
  bindClose: (close?: () => void) => void, workContext: () => string[] = () => q.planId ? [`Linked work: ${q.planId} / ${q.taskIds.join(', ') || 'plan boundary'}`] : ['Standalone question · no task links']): Promise<{ result: BatchUIResult; draft?: QuestionDraft }> {
  let draft: QuestionDraft | undefined;
  const result = await ctx.ui.custom<BatchUIResult>((tui, theme, kb, done) => {
    let settled = false;
    const finish = (result: BatchUIResult) => { if (settled) return; settled = true; draft = form.captureDraft(); done(result); };
    const palette = questionTheme(theme, savedAskAppearance());
    const contextDetails = () => [q.definition.details, ...workContext(), `Why: ${q.why}`, q.boundary, ...(q.neededNow ? [`Needed now: ${q.neededNow}`] : []),
      q.urgency === 'blocking' ? 'Only the stated boundary waits. Independent authorized work may continue.' : 'Can wait until this boundary needs the answer.'].filter(Boolean).join('\n\n');
    const form = new TabbedQuestions([{ ...q.definition, details: contextDetails() }], questionViewport(tui), palette, kb, finish, ctx.cwd, q.draft, false);
    // A posted question is not a submission: an explicit close retains the draft.
    form.preserveDraftOnDismiss = true;
    bindClose(() => finish(null));
    const component = {
      get focused() { return form.focused; }, set focused(v: boolean) { form.focused = v; },
      invalidate() { form.invalidate(); }, render(width: number) { if (current()) form.setContextDetails(contextDetails()); return form.render(width); },
      handleInput(data: string) {
        if (!current()) { finish(null); return; }
        form.setContextDetails(contextDetails());
        // Nested modes and a pending confirmation resolve their own Escape; otherwise
        // the form's own top-level close decides, so a draft asks before closing.
        if (!matchesKey(data, 'escape') || !form.backFromNestedMode()) form.handleInput(data);
      },
      isConfirmingDismiss() { return form.isConfirmingDismiss(); },
      setAdvanceListener(listener: () => void) { form.setAdvanceListener(listener); },
      getHeaderLabel() { return q.urgency === 'blocking' ? q.taskIds.length ? 'Blocks linked work' : 'Blocks stated boundary' : 'Can wait'; },
      getMoreActions() { return [{ label: 'Close and keep draft', run: () => finish(null) }, ...form.getMoreActions()]; },
    };
    return frameQuestion(component, palette, tui, undefined, true);
  }, { overlay: true, overlayOptions: { width: '75%', maxHeight: '85%', anchor: 'bottom-center' } }).finally(() => bindClose(undefined));
  return { result, draft };
}
export async function postedOutcomeUI(ctx: ExtensionContext, q: PostedQuestion, bindClose: (close?: () => void) => void) {
  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    bindClose(done);
    const palette = questionTheme(theme, savedAskAppearance());
    let scroll = 0;
    const values = q.response?.answers.flatMap(a => Array.isArray(a.answer) ? a.answer : a.answer == null ? [] : [a.answer]) ?? [];
    const body = [q.definition.question, '', questionStatus(q), q.boundary,
      ...values.map(a => typeof a === 'string' ? a : a.label),
      ...q.response?.answers.filter(a => a.note).flatMap(a => ['', 'Your note', a.note!]) ?? [],
      ...(q.response?.clarification ? ['', 'Your clarification', q.response.clarification] : []),
      ...(q.consequence ? ['', 'Reported consequence', q.consequence] : []),
      ...(q.replacementId ? [`Replacement: ${q.replacementId}`] : []),
      '', q.state === 'submitted' ? 'Submitted is not delivered. Use /questions retry <id> only if delivery is interrupted.' :
        q.state === 'delivered' ? 'Received by the model context; not yet reported applied.' :
        q.state === 'applied' ? 'Agent report, not independent verification. Tasks have not been changed automatically.' : 'Withdrawal or replacement is not approval.',
      'To correct this response, tell the agent what changed and request a provenance-preserving replacement. Delivered context and completed external effects are not undone.', ''];
    const component = {
      handleInput(data: string) { if (matchesKey(data, 'escape') || matchesKey(data, 'return') || matchesKey(data, 'ctrl+c')) return done();
        if (matchesKey(data, 'up') || matchesKey(data, 'down')) scroll = Math.max(0, scroll + (matchesKey(data, 'up') ? -1 : 1)); tui.requestRender(); },
      render(width: number) {
        const lines = body.flatMap(s => s.split('\n').flatMap(line => wrapTextWithAnsi(palette.fg('text', sanitizeDisplayText(line)), Math.max(1, width))));
        const room = Math.max(1, (questionViewport(tui).terminal.rows ?? 20) - 2); scroll = Math.min(scroll, Math.max(0, lines.length - room));
        return [...lines.slice(scroll, scroll + room), palette.fg('muted', '↑↓ scroll · Esc back')].map(line => truncateToWidth(line, Math.max(0, width), ''));
      }, getHeaderLabel() { return questionStatus(q); }, invalidate() {},
    };
    return frameQuestion(component, palette, tui, undefined, true);
  }, { overlay: true, overlayOptions: { width: '75%', maxHeight: '85%', anchor: 'center' } }).finally(() => bindClose(undefined));
}
export function questionEventCard(details: any, theme: any, expanded = false) {
  return { invalidate() {}, render(width: number) {
    const q = details?.question as PostedQuestion | undefined;
    const rows = [details?.label ?? 'Question event', q?.definition.question ?? '', q ? questionStatus(q) : '',
      ...(q?.neededNow ? [q.neededNow] : []),
      ...(q?.state === 'awaiting' ? [q.urgency === 'blocking' ? q.taskIds.length ? 'Blocks linked work' : 'Blocks stated boundary' : 'Can wait', q.boundary] : []),
      ...(q?.response?.answers ?? []).flatMap(a => [...(Array.isArray(a.answer) ? a.answer : a.answer == null ? [] : [a.answer]).map(v => typeof v === 'string' ? v : v.label), ...(a.note ? ['Your note', a.note] : [])]),
      ...(q?.response?.clarification ? ['Your clarification', q.response.clarification] : []),
      ...(q?.consequence ? [q.consequence] : []), ...(expanded && q ? [`Why: ${q.why}`, q.boundary, `Reference ${q.id} · revision ${q.revision}`, ...(q.taskIds.length ? [`Linked work: ${q.planId} / ${q.taskIds.join(', ')}`] : []),
        ...(q.definition.options.length ? ['Original choices', ...q.definition.options.flatMap(o => [o.label, o.description ?? '', ...(o.suggestion ? [`Assistant suggestion: ${o.suggestion.basis}`, o.suggestion.caveat ?? ''] : [])])] : [])] : [])];
    if (width <= 0) return [];
    const framed = width >= 10;
    const content = new Text(rows.filter(Boolean).flatMap((r, i) => String(r).split('\n').map(line => theme.fg(i === 0 ? details?.error ? 'error' : 'accent' : 'text', sanitizeDisplayText(line)))).join('\n'), 0, 0)
      .render(Math.max(1, width - (framed ? 4 : 0))).map(line => truncateToWidth(line, Math.max(1, width - (framed ? 4 : 0)), ''));
    return framed ? frameRows({ theme, width, rows: content, inset: 1, color: questionAccent(theme) }) : content;
  } };
}
