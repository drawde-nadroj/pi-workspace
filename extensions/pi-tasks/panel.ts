import type { Theme } from '@earendil-works/pi-coding-agent';
import { matchesKey, mixColors, parseColor, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type TUI } from '@earendil-works/pi-tui';
import { cleanText, type DockColors, type Tone } from '../../lib/home-dock.ts';
import { counts } from './state.ts';
import { WORK_STATUS, REQUEST_STATUS } from './typography.ts';
import { isPlanClosed, planInfo, selectedPlan, type PlanBook, type SavedPlan } from './book.ts';
import { requirementCoverage, coverageGaps } from './requirements.ts';
import { STAGE_LABELS, unresolved, type QuestionProjection } from '../../packages/pi-ask/extensions/ask-user-question/posted-protocol.ts';

export type PanelResult = { op: 'new'; revision: string } | { op: 'add' | 'clear' | 'rename' | 'archive' | 'restore' | 'select' | 'edit'; planId: string; revision: string; id?: string } | 'off' | undefined;
export interface PanelNavigation { viewId?: string; history?: boolean; selected?: number; planIndex?: number; section?: 'work' | 'requests' | 'questions'; requestIndex?: number; questionIndex?: number; questionId?: string; showDone?: boolean }
export interface PanelQuestions { available: boolean; fault?: string; records: () => QuestionProjection[]; open: (question: QuestionProjection) => void }
const coverageLabel = (state: string) => REQUEST_STATUS[state]?.label ?? state;
/** Tasks owns work/requests. Ask supplies read-only projections and owns every answer. */
export class TaskPanel implements Component {
  private details = false;
  private scroll = 0;
  private renderedRevision?: string;
  private listTop = 0;
  private mouseRows = new Map<number, number>();
  constructor(private tui: TUI, private theme: Theme, private book: () => PlanBook,
    private colors: () => DockColors | undefined, private done: (value: PanelResult) => void,
    private nav: PanelNavigation = {}, private running: () => boolean = () => false,
    private questions?: PanelQuestions) {}
  invalidate() {}
  private plans() { return [...this.book().plans].reverse(); }
  private viewed(): SavedPlan | undefined { const b = this.book(); return b.plans.find(p => p.id === this.nav.viewId) ?? selectedPlan(b) ?? b.plans.at(-1); }
  private section() { return this.nav.section ?? 'work'; }
  private work(p?: SavedPlan) { return p?.state.tasks.filter(t => this.nav.showDone || t.status !== 'done') ?? []; }
  private requests(p?: SavedPlan) { return p ? requirementCoverage(p.requirements, p.state) : []; }
  private inbox(p?: SavedPlan) {
    return (this.questions?.records() ?? []).slice()
      .sort((a, b) => Number(unresolved(b)) - Number(unresolved(a)) || Number(b.urgency === 'blocking') - Number(a.urgency === 'blocking'));
  }
  private index() {
    if (this.section() === 'questions') { const index = this.inbox(this.viewed()).findIndex(q => q.id === this.nav.questionId); return index >= 0 ? index : this.nav.questionIndex ?? 0; }
    return this.section() === 'requests' ? this.nav.requestIndex ?? 0 : this.nav.selected ?? 0;
  }
  private setIndex(value: number) { if (this.section() === 'requests') this.nav.requestIndex = value;
    else if (this.section() === 'questions') { this.nav.questionIndex = value; this.nav.questionId = this.inbox(this.viewed())[value]?.id; }
    else this.nav.selected = value;
  }
  private switchSection(section: PanelNavigation['section']) { this.nav.section = section; this.details = false; this.scroll = 0; this.listTop = 0; this.tui.requestRender(); }
  private action(op: Exclude<PanelResult, string | undefined>['op'], id?: string) {
    const b = this.book(), p = this.viewed();
    if (!p || this.renderedRevision !== b.revision) { this.tui.requestRender(); return; }
    this.done({ op, planId: p.id, revision: b.revision, id } as PanelResult);
  }
  handleInput(data: string) {
    const b = this.book(), p = this.viewed();
    if (matchesKey(data, 'ctrl+c')) return this.done(undefined);
    if (matchesKey(data, 'escape')) {
      if (this.details) { this.details = false; this.scroll = 0; }
      else if (this.nav.history && p) this.nav.history = false;
      else return this.done(undefined);
      this.tui.requestRender(); return;
    }
    if (matchesKey(data, 'n')) return this.done({ op: 'new', revision: b.revision });
    if (matchesKey(data, 'o')) return this.done('off');
    if (matchesKey(data, 'h')) { this.nav.history = !this.nav.history; this.details = false; this.scroll = 0; this.tui.requestRender(); return; }
    if (this.nav.history) {
      const plans = this.plans(), delta = matchesKey(data, 'up') ? -1 : matchesKey(data, 'down') ? 1 : 0;
      this.nav.planIndex = Math.max(0, Math.min(plans.length - 1, (this.nav.planIndex ?? 0) + delta));
      if (matchesKey(data, 'return') && plans[this.nav.planIndex]) { this.nav.viewId = plans[this.nav.planIndex].id; this.nav.history = false; this.nav.selected = 0; this.details = false; }
      this.tui.requestRender(); return;
    }
    if (matchesKey(data, 'q')) return this.switchSection(this.section() === 'requests' ? 'work' : 'requests');
    if (matchesKey(data, 'j')) return this.switchSection('questions');
    if (matchesKey(data, 'w')) return this.switchSection('work');
    if (matchesKey(data, 'tab') || matchesKey(data, 'shift+tab') || matchesKey(data, 'left') || matchesKey(data, 'right')) {
      const sections = ['work', 'requests', 'questions'] as const;
      const backwards = matchesKey(data, 'left') || matchesKey(data, 'shift+tab');
      return this.switchSection(sections[(sections.indexOf(this.section()) + (backwards ? 2 : 1)) % 3]);
    }
    if (this.details && (matchesKey(data, 'up') || matchesKey(data, 'down'))) { this.scroll = Math.max(0, this.scroll + (matchesKey(data, 'up') ? -1 : 1)); this.tui.requestRender(); return; }
    const items = this.section() === 'work' ? this.work(p) : this.section() === 'requests' ? this.requests(p) : this.inbox(p);
    const delta = matchesKey(data, 'up') ? -1 : matchesKey(data, 'down') ? 1 : 0;
    this.setIndex(Math.max(0, Math.min(items.length - 1, this.index() + delta)));
    if (this.section() === 'questions') {
      if (matchesKey(data, 'return')) { const q = this.inbox(p)[this.index()]; if (q) this.questions?.open(q); }
      this.tui.requestRender(); return;
    }
    if (this.section() === 'requests') {
      if (matchesKey(data, 'return') || matchesKey(data, 'd')) { this.details = !this.details; this.scroll = 0; }
      this.tui.requestRender(); return; // Requests are read-only, never dispatch task edits.
    }
    if (!p) return;
    if (matchesKey(data, 's') && p.archivedAt === null) return this.action('select');
    if (matchesKey(data, 'r') && p.archivedAt !== null) return this.action('restore');
    if (matchesKey(data, 'x') && p.archivedAt === null) return this.action('archive');
    if (matchesKey(data, 't')) return this.action('rename');
    if (matchesKey(data, 'f')) { this.nav.showDone = !this.nav.showDone; this.nav.selected = 0; this.listTop = 0; this.details = false; this.tui.requestRender(); return; }
    const editable = p.id === b.selectedId && p.archivedAt === null, task = this.work(p)[this.index()];
    if (editable && matchesKey(data, 'a')) return this.action('add');
    if (editable && matchesKey(data, 'c')) return this.action('clear');
    if (editable && task && (matchesKey(data, 'e') || this.details && matchesKey(data, 'return'))) return this.action('edit', task.id);
    if (task && (matchesKey(data, 'd') || matchesKey(data, 'return'))) { this.details = !this.details; this.scroll = 0; }
    this.tui.requestRender();
  }
  handleMouse(event: any) {
    if (event.type !== 'click' || event.button !== 'left') return;
    const index = this.mouseRows.get(event.y);
    if (index === undefined) return;
    this.setIndex(index); this.tui.requestRender();
    if (this.section() === 'questions') this.handleInput('\r');
    return { handled: true, focus: true };
  }
  render(width: number): string[] {
    if (width <= 0) return [];
    const b = this.book(), p = this.viewed(), colors = this.colors(); this.renderedRevision = b.revision; this.mouseRows.clear();
    if (p) this.nav.viewId = p.id;
    const height = Math.max(4, Math.min(this.details ? 28 : 24, Math.floor(this.tui.terminal.rows * .85)));
    const color = (tone: Tone) => colors ? parseColor(colors[tone]) : this.theme.colors[tone];
    const surface = mixColors(colors ? parseColor(colors.panel) : this.theme.colors.customMessageBg, color('text'), .08, 'srgb');
    const selection = mixColors(surface, color('accent'), .17, 'srgb'), inner = Math.max(0, width - 2), contentWidth = Math.max(1, inner - 4);
    const edge = (s: string) => this.theme.style(s, { fg: color('accent'), bg: surface });
    const line = (s = '', tone: Tone = 'text', selected = false, bold = false, mark?: { marker?: string; glyph?: string; tone: Tone }) => {
      const prefix = `${mark?.marker !== undefined ? mark.marker + ' ' : ''}${mark?.glyph ? mark.glyph + ' ' : ''}`;
      const prefixWidth = Math.min(visibleWidth(prefix), Math.max(0, inner - 5));
      const value = truncateToWidth(cleanText(s), Math.max(0, inner - 4 - prefixWidth), '…');
      if (width < 6) return this.theme.style(truncateToWidth(prefix + cleanText(s), width, ''), { fg: color(tone), bg: surface });
      const styledPrefix = mark ? this.theme.style(mark.marker !== undefined ? mark.marker + ' ' : '', { fg: color('accent') }) + this.theme.style(mark.glyph ? mark.glyph + ' ' : '', { fg: color(mark.tone) }) : '';
      const lead = truncateToWidth(styledPrefix, prefixWidth, '');
      const padded = '  ' + lead + this.theme.style(value, { fg: color(tone), bold }) + ' '.repeat(Math.max(0, inner - 2 - visibleWidth(lead) - visibleWidth(value)));
      return edge('│') + this.theme.style(padded, { bg: selected ? selection : surface }) + edge('│');
    };
    const border = (top: boolean) => {
      if (width < 6) return line(top ? 'Tasks' : '', 'accent');
      const label = top ? truncateToWidth(`─ ${this.nav.history ? 'Plans' : 'Tasks'} `, inner, '') : '';
      return edge((top ? '╭' : '╰') + label + '─'.repeat(Math.max(0, inner - visibleWidth(label))) + (top ? '╮' : '╯'));
    };
    const finish = (rows: string[], foot: string[]) => {
      const room = Math.max(0, height - 2 - foot.length), body = rows.slice(0, room);
      // Compact short lists; no fabricated filler rows unless the footer needs a minimum body.
      return [border(true), ...body, ...foot, border(false)].slice(0, height);
    };
    if (this.nav.history) {
      const plans = this.plans(); this.nav.planIndex = Math.max(0, Math.min(plans.length - 1, this.nav.planIndex ?? 0));
      const room = Math.max(1, Math.floor((height - 7) / 2)), first = Math.max(0, Math.min(this.nav.planIndex - Math.floor(room / 2), plans.length - room));
      const rows = [line('Your plans', 'text', false, true), line('Opening history does not start work.', 'muted'), line()];
      for (const [i, item] of plans.slice(first, first + room).entries()) {
        const chosen = first + i === this.nav.planIndex, saved = planInfo(item, b).state;
        rows.push(line(`${chosen ? '›' : ' '} ${item.title}`, 'text', chosen), line(`  ${saved === 'open' ? item.id === b.selectedId ? 'current' : 'paused' : saved} · ${counts(item.state).replace('done', 'complete')}`, 'muted', chosen));
      }
      if (!plans.length) rows.push(line('No saved plans. N starts a named plan.', 'muted'));
      return finish(rows, [line('↑↓ choose · Enter open · N new · Esc back', 'muted')]);
    }
    const current = p?.id === b.selectedId && p?.archivedAt === null;
    const qs = this.inbox(p), blocking = qs.filter(q => q.urgency === 'blocking' && unresolved(q)).length;
    const deferred = qs.filter(q => q.urgency === 'deferred' && unresolved(q)).length;
    const rows = [line(p?.title ?? 'Your workspace', 'text', false, true),
      line(p ? `${p.archivedAt !== null ? 'Archived · R to restore' : current ? 'Current' : 'History · S to make current'} · Work ${counts(p.state).replace('done', 'complete')}${isPlanClosed(p) ? ' · saved in history' : ''}` : 'No current plan · N starts one', 'muted')];
    if (blocking || deferred) rows.push(line(`${blocking} blocking question${blocking === 1 ? '' : 's'} · ${deferred} can wait`, blocking ? 'warning' : 'muted'));
    rows.push(line(['work', 'requests', 'questions'].map(s => s === this.section() ? `[${s[0].toUpperCase() + s.slice(1)}]` : s[0].toUpperCase() + s.slice(1)).join('    '), 'accent'), line());
    if (this.details) {
      const t = this.work(p)[this.index()], r = this.requests(p)[this.index()];
      type Detail = { text: string; tone?: Tone; bold?: boolean; glyph?: string; glyphTone?: Tone };
      const content: Detail[] = [];
      const field = (label: string, values: string[]) => content.push({ text: '' }, { text: label, tone: 'muted' }, ...values.map(text => ({ text })));
      if (this.section() === 'requests' && r) {
        const state = REQUEST_STATUS[r.state];
        content.push({ text: r.title, bold: true }, { text: coverageLabel(r.state), tone: 'muted', glyph: state?.glyph, glyphTone: state?.tone });
        field('Criterion', [r.acceptance]); field('Original request', [r.source]);
        field('Linked work', r.taskIds.length ? r.taskIds.map(id => `${p?.state.tasks.find(t => t.id === id)?.title ?? id} · ${id}`) : ['Not linked']);
        if (r.reason) field('Disposition', [r.reason]);
        content.push({ text: '' }, { text: `Reference  ${r.id}`, tone: 'muted' }, { text: 'Coverage is a report, not independent verification.', tone: 'muted' });
      } else if (t) {
        const state = WORK_STATUS[t.status];
        content.push({ text: t.title, bold: true }, { text: t.status === 'active' ? current && this.running() ? 'Working' : 'Paused' : state.label, tone: 'muted', glyph: state.glyph, glyphTone: state.tone });
        if (t.doneWhen) field('Criterion', [t.doneWhen]);
        if (t.phase) field('Phase', [t.phase]);
        if (t.dependsOn.length) field('Depends on', t.dependsOn.map(id => `${p?.state.tasks.find(t => t.id === id)?.title ?? id} · ${id}`));
        if (t.reason) field('Blocked', [t.reason]);
        if (t.note) field(t.noteBy === 'user' ? 'Outcome · user note' : 'Outcome · agent report', [t.note]);
        if (t.evidence) field('Evidence', [t.evidence]);
        content.push({ text: '' }, { text: `Reference  ${t.id}`, tone: 'muted' });
        if (t.evidence) content.push({ text: 'Evidence is provided, not independently verified.', tone: 'muted' });
      } else content.push({ text: 'No selected record.' });
      const detail = content.flatMap(row => row.text.split(/\r?\n/).flatMap(s => wrapTextWithAnsi(cleanText(s), Math.max(1, Math.min(80, contentWidth - (row.glyph ? 2 : 0))))).map((text, i) => ({ ...row, text, glyph: i === 0 ? row.glyph : undefined })));
      const room = Math.max(1, height - rows.length - 3);
      this.scroll = Math.min(this.scroll, Math.max(0, detail.length - room)); rows.push(...detail.slice(this.scroll, this.scroll + room).map(row => line(row.text, row.tone, false, row.bold, row.glyph ? { glyph: row.glyph, tone: row.glyphTone ?? 'muted' } : undefined)));
      return finish(rows, [line(`↑↓ scroll · ${this.section() === 'work' && current ? 'E/Enter edit · ' : ''}Esc back`, 'muted')]);
    }
    let entries: { title: string; sub: string; glyph: string; glyphTone: Tone; subTone?: Tone }[];
    if (this.section() === 'requests') entries = this.requests(p).map(r => ({ title: r.title, glyph: REQUEST_STATUS[r.state]?.glyph ?? '?', glyphTone: REQUEST_STATUS[r.state]?.tone ?? 'warning', sub: `${coverageLabel(r.state)} · ${r.taskIds.length} linked`, subTone: REQUEST_STATUS[r.state]?.tone === 'warning' ? 'warning' : 'muted' }));
    else if (this.section() === 'questions') entries = qs.map(q => {
      const blocked = q.urgency === 'blocking' && unresolved(q), disposed = q.state === 'withdrawn' || q.state === 'replaced';
      return { title: q.question, glyph: blocked ? '!' : q.state === 'applied' ? '✓' : disposed ? '–' : '?', glyphTone: blocked ? 'warning' : q.state === 'applied' ? 'success' : 'muted', subTone: blocked ? 'warning' : 'muted', sub: `${q.state === 'awaiting' ? blocked ? 'Blocks linked work' : 'Can wait' : STAGE_LABELS[q.state]} · ${q.state === 'awaiting' ? q.neededNow ?? q.boundary : q.consequence ?? 'Submitted is not applied.'}` };
    });
    else entries = this.work(p).map(t => ({ title: t.title, glyph: WORK_STATUS[t.status].glyph, glyphTone: WORK_STATUS[t.status].tone,
      sub: t.status === 'active' ? current && this.running() ? 'Working' : 'Paused' : t.status === 'pending' ? 'Not started' : t.status === 'done' ? '' : t.status === 'blocked' ? `Blocked · ${t.reason}` : 'Cancelled', subTone: t.status === 'blocked' ? 'warning' : 'muted' }));
    this.setIndex(Math.max(0, Math.min(entries.length - 1, this.index())));
    type Wrapped = { text: string; tone: Tone; index: number; bold?: boolean; mark?: { marker?: string; glyph?: string; tone: Tone } };
    const wrapped: Wrapped[] = [], starts: number[] = [], ends: number[] = [];
    for (const [i, e] of entries.entries()) {
      if (i && this.section() !== 'work') wrapped.push({ text: '', tone: 'muted', index: -1 });
      starts.push(wrapped.length);
      wrapped.push(...wrapTextWithAnsi(cleanText(e.title), Math.max(1, Math.min(80, contentWidth - 4))).map((text, n) => ({ text: n ? '    ' + text : text, tone: 'text' as const, index: i, bold: this.section() === 'requests', mark: n ? undefined : { marker: i === this.index() ? '›' : ' ', glyph: e.glyph, tone: e.glyphTone } })));
      if (e.sub) wrapped.push({ text: `    ${e.sub}`, tone: e.subTone ?? 'muted', index: i });
      ends.push(wrapped.length);
    }
    const doneCount = p?.state.tasks.filter(t => t.status === 'done').length ?? 0;
    const room = Math.max(1, height - rows.length - 6), start = starts[this.index()] ?? 0, end = ends[this.index()] ?? wrapped.length;
    if (start < this.listTop) this.listTop = start;
    if (end > this.listTop + room) this.listTop = Math.max(start, end - room);
    this.listTop = Math.max(0, Math.min(this.listTop, Math.max(0, wrapped.length - room)));
    for (const row of wrapped.slice(this.listTop, this.listTop + room)) { if (row.index >= 0) this.mouseRows.set(rows.length + 1, row.index); rows.push(line(row.text, row.tone, row.index === this.index(), row.bold, row.mark)); }
    if (!entries.length) rows.push(line(this.section() === 'questions' ? this.questions?.fault ? 'Question history unreadable · /questions' : this.questions?.available ? 'No posted questions in this session.' : 'Ask is unavailable. Work remains accessible.' : this.section() === 'requests' ? 'No requests recorded · coverage not established' : 'No open tasks. A adds work; F shows completed.', 'muted'));
    if (entries.length && wrapped.length > room) rows.push(line(`${this.index() + 1} of ${entries.length} · ↑↓ select · ${this.section() === 'questions' ? 'Enter answer/inspect' : 'D full details'}`, 'muted'));
    if (this.section() === 'work' && doneCount) rows.push(line(`${this.nav.showDone ? '▾' : '▸'} ${doneCount} completed · F ${this.nav.showDone ? 'hide' : 'show'}`, 'muted'));
    if (this.section() === 'requests' && p && coverageGaps(p.requirements, p.state).length) rows.push(line('Unresolved coverage remains visible in details.', 'warning'));
    return finish(rows, [line(this.section() === 'questions' ? '↑↓ choose · Enter answer/inspect · Esc close' : this.section() === 'requests' ? '↑↓ choose · Enter/D details · Esc close' : current ? 'Enter/D details · E edit · A add · T rename' : 'Enter/D details · S make current · T rename', 'muted'),
      line('Tab/←→ views · Q requests · J questions · H plans', 'muted'), line(`N new · ${p?.archivedAt === null ? 'X archive · ' : ''}Esc close`, 'muted')]);
  }
}
