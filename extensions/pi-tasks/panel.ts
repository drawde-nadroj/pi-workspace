import type { Theme } from '@earendil-works/pi-coding-agent';
import { matchesKey, mixColors, parseColor, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type TUI } from '@earendil-works/pi-tui';
import { cleanText, type DockColors, type Tone } from '../../lib/workspace-dock.ts';
import { progressText } from './state.ts';
import { WORK_STATUS, REQUEST_STATUS, planWord, workWord } from './typography.ts';
import { planInfo, selectedPlan, type PlanBook, type SavedPlan } from './book.ts';
import { requirementCoverage, coverageGaps } from './requirements.ts';
import { unresolved, type QuestionProjection } from '../../packages/pi-ask/extensions/ask-user-question/posted-protocol.ts';

export type PanelResult = { op: 'new'; revision: string } | { op: 'add' | 'clear' | 'rename' | 'archive' | 'restore' | 'select' | 'edit'; planId: string; revision: string; id?: string } | 'off' | undefined;
export interface PanelNavigation {
  viewId?: string; history?: boolean; planIndex?: number; view?: 'work' | 'requests';
  help?: boolean; searching?: boolean; query?: string; key?: string; showDone?: boolean;
}
export interface PanelQuestions { available: boolean; fault?: string; records: () => QuestionProjection[]; open: (question: QuestionProjection) => void }
interface Entry { key: string; kind: 'question' | 'task' | 'request'; id?: string; title: string; glyph: string; glyphTone: Tone; sub?: string; subTone?: Tone; active?: boolean }
interface Detail { text: string; tone?: Tone; bold?: boolean; glyph?: string; glyphTone?: Tone }
/** One action bar, trimmed from the end; the final help/back segment always survives. */
function fitBar(segments: string[], width: number): string {
  if (width < 16) return segments.at(-1) ?? '? help';
  const kept = [...segments];
  while (kept.length > 1 && visibleWidth(kept.join(' · ')) > Math.max(0, width - 6)) kept.splice(kept.length - 2, 1);
  return kept.join(' · ');
}
function ageText(now: number, updatedAt: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
const HELP = [
  { title: 'Work', rows: ['Enter  open details or answer', 'A      add a task', 'E      edit the selected task', 'F      show completed work', 'V      requests and coverage'] },
  { title: 'Plans', rows: ['N  new plan', 'H  plan list', 'S  make current', 'R  restore archived', 'X  archive', 'C  clear tasks', 'T  rename plan'] },
  { title: 'Other', rows: ['O      turn Tasks off', '?      close this help', 'Esc    close the panel'] },
] as const;
/** Tasks owns work and requests. Ask supplies read-only projections and owns every answer. */
export class TaskPanel implements Component {
  private details = false;
  private scroll = 0;
  private renderedRevision?: string;
  private listTop = 0;
  private libraryTop = 0;
  private mouseRows = new Map<number, number>();
  constructor(private tui: TUI, private theme: Theme, private book: () => PlanBook,
    private colors: () => DockColors | undefined, private done: (value: PanelResult) => void,
    private nav: PanelNavigation = {}, private running: () => boolean = () => false,
    private questions?: PanelQuestions) {}
  invalidate() {}
  private viewed(): SavedPlan | undefined { const b = this.book(); return b.plans.find(p => p.id === this.nav.viewId) ?? selectedPlan(b) ?? b.plans.at(-1); }
  private isCurrent(p: SavedPlan) { return p.id === this.book().selectedId && p.archivedAt === null; }
  private openTasks(p: SavedPlan) {
    const rank = { active: 0, blocked: 1, pending: 2 } as Record<string, number>;
    return p.state.tasks.filter(t => rank[t.status] !== undefined).slice().sort((a, b) => rank[a.status] - rank[b.status]);
  }
  private unresolvedQuestions(): QuestionProjection[] {
    return (this.questions?.records() ?? []).filter(unresolved)
      .sort((a, b) => Number(b.urgency === 'blocking') - Number(a.urgency === 'blocking'));
  }
  private questionLink(q: QuestionProjection): string {
    if (!q.planId) return 'This session';
    const p = this.book().plans.find(plan => plan.id === q.planId);
    return `${p?.title ?? q.planId} / ${q.taskIds.map(id => p?.state.tasks.find(t => t.id === id)?.title ?? id).join(', ') || 'plan boundary'}`;
  }
  private workEntries(p?: SavedPlan): Entry[] {
    // Session questions lead the list even before a named plan exists.
    const entries: Entry[] = this.unresolvedQuestions().map(q => ({ key: `q:${q.id}`, kind: 'question' as const, id: q.id,
      title: q.question, glyph: q.urgency === 'blocking' ? '!' : '?', glyphTone: q.urgency === 'blocking' ? 'warning' as Tone : 'muted' as Tone,
      sub: `${q.urgency === 'blocking' ? 'Waiting for you' : 'Can wait'} · ${this.questionLink(q)}`,
      subTone: q.urgency === 'blocking' ? 'warning' as Tone : 'muted' as Tone }));
    if (!p) return entries;
    const work = this.openTasks(p).map(t => ({ key: `t:${t.id}`, kind: 'task' as const, id: t.id, title: t.title,
      glyph: WORK_STATUS[t.status].glyph, glyphTone: WORK_STATUS[t.status].tone, active: t.status === 'active',
      ...(t.status === 'active' ? { sub: workWord(t.status, this.isCurrent(p) && this.running()), subTone: 'accent' as Tone }
        : t.status === 'blocked' ? { sub: `Blocked · ${t.reason}`, subTone: 'warning' as Tone } : {}) }));
    const closed = this.nav.showDone ? p.state.tasks.filter(t => t.status === 'done' || t.status === 'cancelled') : [];
    const done = closed.map(t => ({ key: `t:${t.id}`, kind: 'task' as const, id: t.id, title: t.title,
      glyph: WORK_STATUS[t.status].glyph, glyphTone: WORK_STATUS[t.status].tone, sub: WORK_STATUS[t.status].label, subTone: 'muted' as Tone }));
    return [...entries, ...work, ...done];
  }
  private requestEntries(p?: SavedPlan): Entry[] {
    return (p ? requirementCoverage(p.requirements, p.state) : []).map(r => ({ key: `r:${r.id}`, kind: 'request' as const, id: r.id,
      title: r.title, glyph: REQUEST_STATUS[r.state]?.glyph ?? '?', glyphTone: REQUEST_STATUS[r.state]?.tone ?? 'warning',
      sub: `${REQUEST_STATUS[r.state]?.label ?? r.state} · ${r.taskIds.length} linked`,
      subTone: REQUEST_STATUS[r.state]?.tone === 'warning' ? 'warning' : 'muted' }));
  }
  /** The one placeholder-free view answer: a fresh panel is the work list, not an unnamed neither. */
  private view(): 'work' | 'requests' { return this.nav.view ?? 'work'; }
  private entries(p?: SavedPlan): Entry[] { return this.view() === 'requests' ? this.requestEntries(p) : this.workEntries(p); }
  /** Selection follows the record key, so arriving work cannot move it. */
  private select(entries: Entry[]): number {
    const index = entries.findIndex(e => e.key === this.nav.key);
    const chosen = index >= 0 ? index : 0;
    this.nav.key = entries[chosen]?.key;
    return chosen;
  }
  private action(op: Exclude<PanelResult, string | undefined>['op'], id?: string) {
    const b = this.book(), p = this.viewed();
    if (!p || this.renderedRevision !== b.revision) { this.tui.requestRender(); return; }
    this.done({ op, planId: p.id, revision: b.revision, id } as PanelResult);
  }
  private resetList() { this.details = false; this.scroll = 0; this.listTop = 0; }
  private library(b: PlanBook) {
    const groups = ['Current', 'Open', 'Finished', 'Archived'].map(title => ({ title,
      plans: b.plans.filter(p => planWord(planInfo(p, b).state, p.id === b.selectedId) === title) }));
    const query = (this.nav.query ?? '').trim().toLowerCase();
    for (const group of groups) group.plans = group.plans.filter(p => !query || p.title.toLowerCase().includes(query))
      .sort((a, b2) => b2.updatedAt - a.updatedAt || (a.id < b2.id ? 1 : -1));
    return { groups: groups.filter(g => g.plans.length), shown: groups.flatMap(g => g.plans) };
  }
  handleInput(data: string) {
    const b = this.book(), p = this.viewed();
    if (matchesKey(data, 'ctrl+c')) return this.done(undefined);
    if (this.nav.help) {
      if (matchesKey(data, 'escape') || data === '?') { this.nav.help = false; this.scroll = 0; }
      else if (matchesKey(data, 'up') || matchesKey(data, 'down')) this.scroll = Math.max(0, this.scroll + (matchesKey(data, 'up') ? -1 : 1));
      this.tui.requestRender(); return;
    }
    if (this.nav.searching) {
      if (matchesKey(data, 'escape')) { this.nav.query = ''; this.nav.searching = false; }
      else if (matchesKey(data, 'return')) this.nav.searching = false;
      else if (matchesKey(data, 'backspace') || data === '\x7f') this.nav.query = Array.from(this.nav.query ?? '').slice(0, -1).join('');
      else { const chars = Array.from(data); if (chars.length === 1 && chars[0] >= ' ') this.nav.query = (this.nav.query ?? '') + chars[0]; }
      this.nav.planIndex = 0; this.tui.requestRender(); return;
    }
    if (matchesKey(data, 'escape')) {
      if (this.details) { this.details = false; this.scroll = 0; }
      else if (this.view() === 'requests') { this.nav.view = 'work'; this.resetList(); }
      else if (this.nav.history) this.nav.history = false;
      else return this.done(undefined);
      this.tui.requestRender(); return;
    }
    if (data === '?') { this.nav.help = true; this.scroll = 0; this.tui.requestRender(); return; }
    const key = (name: string) => data === name || data === name.toUpperCase();
    if (key('n')) return this.done({ op: 'new', revision: b.revision });
    if (key('o')) return this.done('off');
    if (key('h')) {
      this.nav.history = !this.nav.history; this.resetList(); this.libraryTop = 0; this.nav.planIndex = 0;
      this.nav.query = ''; this.nav.searching = false; this.tui.requestRender(); return;
    }
    if (this.nav.history) {
      const shown = this.library(b).shown;
      const delta = matchesKey(data, 'up') ? -1 : matchesKey(data, 'down') ? 1 : 0;
      this.nav.planIndex = Math.max(0, Math.min(shown.length - 1, (this.nav.planIndex ?? 0) + delta));
      if (data === '/') { this.nav.searching = true; this.nav.query = ''; }
      else if (matchesKey(data, 'return') && shown[this.nav.planIndex]) {
        this.nav.viewId = shown[this.nav.planIndex].id; this.nav.history = false; this.nav.key = undefined; this.resetList();
      }
      this.tui.requestRender(); return;
    }
    if (key('v')) { this.nav.view = this.view() === 'requests' ? 'work' : 'requests'; this.resetList(); this.tui.requestRender(); return; }
    const entries = this.entries(p);
    const chosen = this.select(entries), entry = entries[chosen];
    if (this.details) {
      // Details scroll with the arrows; only an editable task offers the edit shortcut.
      if (matchesKey(data, 'up') || matchesKey(data, 'down')) this.scroll = Math.max(0, this.scroll + (matchesKey(data, 'up') ? -1 : 1));
      else if (key('e') && p && entry?.kind === 'task' && entry.id && this.isCurrent(p) && p.archivedAt === null) return this.action('edit', entry.id);
      this.tui.requestRender(); return;
    }
    const delta = matchesKey(data, 'up') ? -1 : matchesKey(data, 'down') ? 1 : 0;
    if (delta) {
      this.nav.key = entries[Math.max(0, Math.min(entries.length - 1, chosen + delta))]?.key;
      this.tui.requestRender(); return;
    }
    if (this.view() === 'requests') {
      if (matchesKey(data, 'return') && entry) { this.details = true; this.scroll = 0; }
      this.tui.requestRender(); return; // Requests are read-only, never dispatch task edits.
    }
    if (entry?.kind === 'question') {
      // A question row answers only to Enter: plan and task edits ignore it.
      if (matchesKey(data, 'return')) { const record = this.questions?.records().find(q => q.id === entry.id); if (record) this.questions?.open(record); }
      this.tui.requestRender(); return;
    }
    if (!p) { this.tui.requestRender(); return; }
    const current = this.isCurrent(p), editable = current && p.archivedAt === null;
    if (key('f')) { this.nav.showDone = !this.nav.showDone; this.nav.key = undefined; this.resetList(); this.tui.requestRender(); return; }
    if (key('s') && p.archivedAt === null && !current) return this.action('select');
    if (key('r') && p.archivedAt !== null) return this.action('restore');
    if (key('x') && p.archivedAt === null) return this.action('archive');
    if (key('t') && p.archivedAt === null) return this.action('rename');
    if (editable && key('a')) return this.action('add');
    if (editable && key('c')) return this.action('clear');
    if (editable && entry?.kind === 'task' && entry.id && key('e')) return this.action('edit', entry.id);
    if (entry?.kind === 'task' && matchesKey(data, 'return')) { this.details = true; this.scroll = 0; }
    this.tui.requestRender();
  }
  handleMouse(event: any) {
    if (event.type !== 'click' || event.button !== 'left') return;
    const index = this.mouseRows.get(event.y);
    if (index === undefined) return;
    if (this.nav.history) {
      const plan = this.library(this.book()).shown[index];
      this.nav.planIndex = index;
      if (plan) { this.nav.viewId = plan.id; this.nav.history = false; this.nav.key = undefined; this.resetList(); }
    } else {
      const entries = this.entries(this.viewed());
      this.nav.key = entries[index]?.key;
      if (entries[index]?.kind === 'question') this.handleInput('\r');
    }
    this.tui.requestRender();
    return { handled: true, focus: true };
  }
  private helpRows(width: number): Detail[] {
    const rows: Detail[] = [];
    if (width >= 72) {
      const [work, plans, other] = HELP;
      const leftWidth = Math.max(...work.rows.map(text => visibleWidth(text)), ...other.rows.map(text => visibleWidth(text))) + 4;
      rows.push({ text: `${work.title.padEnd(leftWidth)}${plans.title}`, tone: 'accent', bold: true });
      for (let i = 0; i < Math.max(work.rows.length, plans.rows.length); i++) {
        rows.push({ text: `${(work.rows[i] ?? '').padEnd(leftWidth)}${plans.rows[i] ?? ''}`.trimEnd(), tone: 'text' });
      }
      rows.push({ text: other.title, tone: 'accent', bold: true });
      for (const text of other.rows) rows.push({ text, tone: 'text' });
      return rows;
    }
    HELP.forEach((section, index) => {
      if (index) rows.push({ text: '', tone: 'muted' });
      rows.push({ text: section.title, tone: 'accent', bold: true });
      for (const text of section.rows) rows.push({ text, tone: 'text' });
    });
    return rows;
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
    const line = (s = '', tone: Tone = 'text', selected = false, bold = false, mark?: { marker?: string; glyph?: string; tone: Tone }, active = false) => {
      const prefix = `${mark?.marker !== undefined ? mark.marker + ' ' : ''}${mark?.glyph ? mark.glyph + ' ' : ''}`;
      const prefixWidth = Math.min(visibleWidth(prefix), Math.max(0, inner - 5));
      const value = truncateToWidth(cleanText(s), Math.max(0, inner - 4 - prefixWidth), '…');
      if (width < 6) return this.theme.style(truncateToWidth(prefix + cleanText(s), width, ''), { fg: color(tone), bg: surface });
      const styledPrefix = mark ? this.theme.style(mark.marker !== undefined ? mark.marker + ' ' : '', { fg: color('accent') }) + this.theme.style(mark.glyph ? mark.glyph + ' ' : '', { fg: color(mark.tone) }) : '';
      const lead = truncateToWidth(styledPrefix, prefixWidth, '');
      const padded = '  ' + lead + this.theme.style(value, { fg: color(tone), bold }) + ' '.repeat(Math.max(0, inner - 2 - visibleWidth(lead) - visibleWidth(value)));
      return edge('│') + this.theme.style(padded, { bg: selected ? selection : active ? mixColors(surface, color('accent'), .08, 'srgb') : surface }) + edge('│');
    };
    const border = (top: boolean) => {
      const label = this.nav.history ? 'Plans' : 'Tasks';
      if (width < 6) return line(top ? label : '', 'accent');
      const text = top ? truncateToWidth(`─ ${label} `, inner, '') : '';
      return edge((top ? '╭' : '╰') + text + '─'.repeat(Math.max(0, inner - visibleWidth(text))) + (top ? '╮' : '╯'));
    };
    const finish = (rows: string[], foot: string[]) => {
      const room = Math.max(0, height - 2 - foot.length), body = rows.slice(0, room);
      return [border(true), ...body, ...foot, border(false)].slice(0, height);
    };
    if (this.nav.help) {
      const rows = this.helpRows(width), room = Math.max(1, height - 3);
      this.scroll = Math.min(this.scroll, Math.max(0, rows.length - room));
      return finish(rows.slice(this.scroll, this.scroll + room).map(row => line(row.text, row.tone, false, row.bold)), [line('Esc back', 'muted')]);
    }
    if (this.nav.history) {
      const { groups, shown } = this.library(b);
      this.nav.planIndex = Math.max(0, Math.min(Math.max(0, shown.length - 1), this.nav.planIndex ?? 0));
      const rows = [line('Plans', 'text', false, true)], starts: number[] = [], planRow = new Map<number, number>();
      let index = 0;
      for (const group of groups) {
        rows.push(line(group.title, 'accent', false, true));
        for (const plan of group.plans) {
          const chosen = index === this.nav.planIndex;
          starts.push(rows.length);
          planRow.set(rows.length, index); planRow.set(rows.length + 1, index); index++;
          rows.push(line(`${chosen ? '›' : ' '} ${plan.title}`, 'text', chosen), line(`  ${progressText(plan.state)} · ${ageText(Date.now(), plan.updatedAt)}`, 'muted', chosen));
        }
      }
      if (!shown.length) rows.push(line(this.nav.query ? `No plans match "${this.nav.query}" · Esc clears` : 'No plans yet · N starts one', 'muted'), line());
      const room = Math.max(1, height - 4), start = starts[this.nav.planIndex] ?? 0;
      if (start < this.libraryTop) this.libraryTop = start;
      if (start + 2 > this.libraryTop + room) this.libraryTop = Math.max(0, start + 2 - room);
      this.libraryTop = Math.max(0, Math.min(this.libraryTop, Math.max(0, rows.length - room)));
      const body = rows.slice(this.libraryTop, this.libraryTop + room);
      body.forEach((_, i) => { const plan = planRow.get(this.libraryTop + i); if (plan !== undefined) this.mouseRows.set(i + 2, plan); });
      const bar = this.nav.searching ? [`Search: ${this.nav.query || 'type a title'}`, 'Enter keep', 'Esc clear'] : ['Enter open', '/ search', 'N new', 'Esc back'];
      return finish(body, [line(fitBar(bar, width), 'muted')]);
    }
    const current = p ? this.isCurrent(p) : false, entries = this.entries(p);
    const chosen = this.select(entries);
    const rows: string[] = [];
    const info = p ? planInfo(p, b) : undefined;
    if (p) {
      rows.push(line(p.title, 'text', false, true));
      rows.push(line(info ? `${planWord(info.state, current)} · ${progressText(p.state)}` : '', 'muted'));
    } else {
      rows.push(line('No plan yet', 'text', false, true));
      rows.push(line('A plan appears when you or the agent starts substantial work.', 'muted'));
    }
    if (this.view() === 'requests') rows.push(line('Requests · read-only', 'accent'), line());
    if (this.details) {
      const entry = entries[chosen], task = entry?.kind === 'task' ? p?.state.tasks.find(t => t.id === entry.id) : undefined;
      const request = entry?.kind === 'request' && p ? requirementCoverage(p.requirements, p.state).find(r => r.id === entry.id) : undefined;
      const content: Detail[] = [];
      const field = (label: string, values: string[]) => content.push({ text: '' }, { text: label, tone: 'muted' }, ...values.map(text => ({ text })));
      if (request) {
        const mark = REQUEST_STATUS[request.state];
        content.push({ text: request.title, bold: true }, { text: mark?.label ?? request.state, tone: 'muted', glyph: mark?.glyph, glyphTone: mark?.tone });
        field('Original request', [request.source]);
        field('Done when', [request.acceptance]);
        field('Linked work', request.taskIds.length ? request.taskIds.map(id => `${p?.state.tasks.find(t => t.id === id)?.title ?? id} · ${id}`) : ['Not linked']);
        if (request.reason) field('Disposition', [request.reason]);
        content.push({ text: '' }, { text: `Reference  ${request.id}`, tone: 'muted' }, { text: 'Coverage is a report, not independent verification.', tone: 'muted' });
      } else if (task) {
        const mark = WORK_STATUS[task.status];
        content.push({ text: task.title, bold: true },
          { text: workWord(task.status, current && this.running()), tone: 'muted', glyph: mark.glyph, glyphTone: mark.tone });
        if (task.reason && task.status === 'blocked') field('Waiting on', [task.reason]);
        if (task.doneWhen) field('Done when', [task.doneWhen]);
        if (task.note) field(task.noteBy === 'user' ? 'Outcome · your note' : 'Outcome · agent report', [task.note]);
        if (task.evidence) field('Evidence', [task.evidence]);
        if (task.dependsOn.length) field('Depends on', task.dependsOn.map(id => `${p?.state.tasks.find(t => t.id === id)?.title ?? id} · ${id}`));
        const gates = this.unresolvedQuestions().filter(q => q.planId === p?.id && q.taskIds.includes(task.id));
        if (gates.length) field('Questions', gates.map(q => `${q.question} · ${q.id}`));
        content.push({ text: '' }, { text: `Reference  ${task.id}`, tone: 'muted' });
        if (task.evidence) content.push({ text: 'Reported, not independently verified.', tone: 'muted' });
      } else content.push({ text: 'No selected record.' });
      const detail = content.flatMap(row => row.text.split(/\r?\n/).flatMap(s => wrapTextWithAnsi(cleanText(s), Math.max(1, Math.min(80, contentWidth - (row.glyph ? 2 : 0))))).map((text, i) => ({ ...row, text, glyph: i === 0 ? row.glyph : undefined })));
      const room = Math.max(1, height - rows.length - 3);
      this.scroll = Math.min(this.scroll, Math.max(0, detail.length - room));
      rows.push(...detail.slice(this.scroll, this.scroll + room).map(row => line(row.text, row.tone, false, row.bold, row.glyph ? { glyph: row.glyph, tone: row.glyphTone ?? 'muted' } : undefined)));
      const editable = !!task && !!p && current && p.archivedAt === null;
      const bar = editable ? ['↑↓ scroll', 'E edit', 'Esc back'] : ['↑↓ scroll', 'Esc back'];
      return finish(rows, [line(fitBar(bar, width), 'muted')]);
    }
    const warnings: string[] = [];
    const gaps = p ? coverageGaps(p.requirements, p.state).length : 0;
    if (gaps && this.view() === 'work') warnings.push(`! ${gaps} request${gaps === 1 ? ' needs' : 's need'} review · V`);
    const mark = (entry: Entry, index: number) => ({ marker: index === chosen ? '›' : ' ', glyph: entry.glyph, tone: entry.glyphTone });
    const wrapped: Array<{ text: string; tone: Tone; index: number; bold?: boolean; mark?: { marker?: string; glyph?: string; tone: Tone } }> = [];
    const starts: number[] = [], ends: number[] = [];
    for (const [index, entry] of entries.entries()) {
      if (index === 1 && entries[0]?.kind === 'question' && entry.kind === 'task') wrapped.push({ text: '', tone: 'muted', index: -1 });
      starts.push(wrapped.length);
      wrapped.push(...wrapTextWithAnsi(cleanText(entry.title), Math.max(1, Math.min(80, contentWidth - 4))).map((text, n) => ({
        text: n ? '    ' + text : text, tone: 'text' as const, index, bold: entry.active || entry.kind === 'request', mark: n ? undefined : mark(entry, index) })));
      if (entry.sub) wrapped.push({ text: `    ${entry.sub}`, tone: entry.subTone ?? 'muted', index });
      ends.push(wrapped.length);
    }
    const doneCount = p?.state.tasks.filter(t => t.status === 'done').length ?? 0;
    // Reserve the footer warning, the position line and the F toggle before slicing the list.
    const doneReserve = doneCount ? 1 : 0;
    const capacity = Math.max(1, height - 3 - warnings.length), headerRows = rows.length;
    const base = Math.max(1, capacity - headerRows - doneReserve);
    const needsPosition = entries.length > 0 && wrapped.length > base - 1;
    const room = Math.max(1, base - (needsPosition ? 1 : 0)), start = starts[chosen] ?? 0, end = ends[chosen] ?? wrapped.length;
    if (start < this.listTop) this.listTop = start;
    if (end > this.listTop + room) this.listTop = Math.max(start, end - room);
    this.listTop = Math.max(0, Math.min(this.listTop, Math.max(0, wrapped.length - room)));
    for (const row of wrapped.slice(this.listTop, this.listTop + room)) {
      if (row.index >= 0) this.mouseRows.set(rows.length + 1, row.index);
      rows.push(line(row.text, row.tone, row.index === chosen, row.bold, row.mark, entries[row.index]?.active));
    }
    if (!entries.length) {
      rows.push(line(this.view() === 'requests' ? 'No requests recorded.'
        : this.questions?.fault ? 'Question history unreadable · /questions'
        : this.questions?.available === false ? 'Ask is unavailable. Work remains accessible.'
        : 'No open tasks. A adds work; F shows completed.', 'muted'));
    }
    if (entries.length && wrapped.length > room) rows.push(line(`${chosen + 1} of ${entries.length} · ↑↓ select`, 'muted'));
    if (this.view() === 'work' && doneCount) rows.push(line(`${this.nav.showDone ? '▾' : '▸'} ${doneCount} done · F`, 'muted'));
    const bar = this.view() === 'requests' ? ['Enter details', 'Esc back']
      : !p ? ['N new', 'H plans', '? help']
      : p.archivedAt !== null ? ['Enter details', 'R restore', 'H plans', '? help']
      : current ? ['Enter details', 'A add', 'N new', 'H plans', '? help']
      : ['Enter details', 'S make current', 'H plans', '? help'];
    // The footer is at most one warning line plus the action bar; the body stays pure work.
    return finish(rows, [...warnings.map(text => line(text, 'warning')), line(fitBar(bar, width), 'muted')]);
  }
}
