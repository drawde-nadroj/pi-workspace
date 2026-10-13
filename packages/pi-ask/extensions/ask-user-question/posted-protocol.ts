/** Trusted, process-local display/link protocol. No components, callbacks or plan mutations. */
export const POSTED = {
  probe: 'pi-ask:posted:v1:probe', update: 'pi-ask:posted:v1:update', open: 'pi-ask:posted:v1:open',
  catalogue: 'pi-tasks:links:v1:update', catalogueProbe: 'pi-tasks:links:v1:probe',
  interaction: 'pi-workspace:interaction:v1', needed: 'pi-ask:posted:v1:needed',
} as const;
export type QuestionStage = 'awaiting' | 'submitted' | 'delivered' | 'applied' | 'withdrawn' | 'replaced';
export const STAGE_LABELS: Record<QuestionStage, string> = {
  awaiting: 'Awaiting answer', submitted: 'Response submitted', delivered: 'Delivered to agent',
  applied: 'Agent reports applied', withdrawn: 'Withdrawn · not approval', replaced: 'Replaced',
};
export interface QuestionProjection {
  id: string; revision: number; question: string; urgency: 'blocking' | 'deferred'; state: QuestionStage;
  boundary: string; planId?: string; taskIds: string[]; responseStatus?: string; consequence?: string; replacementId?: string; neededNow?: string;
}
export interface QuestionSnapshot { version: 1; sessionId: string; available: boolean; questions: QuestionProjection[]; fault?: string }
export interface QuestionOpen { version: 1; sessionId: string; id: string; revision: number }
export interface TaskCatalogue { version: 1; sessionId: string; available: boolean; attentionHosted?: boolean; plans: { id: string; taskIds: string[]; title?: string; tasks?: { id: string; title: string }[] }[] }
export function isTaskCatalogue(value: unknown): value is TaskCatalogue {
  const v = value as TaskCatalogue;
  const title = (s: unknown, limit: number) => typeof s === 'string' && s.length <= limit;
  return !!v && v.version === 1 && typeof v.sessionId === 'string' && typeof v.available === 'boolean' &&
    (v.attentionHosted === undefined || typeof v.attentionHosted === 'boolean') && Array.isArray(v.plans) && v.plans.length <= 100 &&
    v.plans.every(p => p && /^p[1-9]\d*$/.test(p.id) && Array.isArray(p.taskIds) && p.taskIds.length <= 100 &&
      p.taskIds.every(id => typeof id === 'string' && /^t[1-9]\d*$/.test(id)) &&
      (p.title === undefined || title(p.title, 2000)) && (p.tasks === undefined || Array.isArray(p.tasks) && p.tasks.length <= 100 &&
        p.tasks.every(t => t && p.taskIds.includes(t.id) && title(t.title, 4000))));
}
export function questionStatus(q: { state: QuestionStage; responseStatus?: string; response?: { status: string } }): string {
  const kind = q.responseStatus ?? q.response?.status;
  const label = kind === 'skipped' ? 'Skipped · not approval' : kind === 'clarification_requested' ? 'Clarification requested · not approval' : kind === 'answered' ? 'Answer' : '';
  return label && ['submitted', 'delivered', 'applied'].includes(q.state) ? `${label} · ${STAGE_LABELS[q.state]}` : STAGE_LABELS[q.state];
}
export function isQuestionSnapshot(value: unknown): value is QuestionSnapshot {
  const s = value as QuestionSnapshot;
  return !!s && s.version === 1 && typeof s.sessionId === 'string' && typeof s.available === 'boolean' &&
    Array.isArray(s.questions) && s.questions.length <= 100 && s.questions.every(q => q && typeof q.id === 'string' &&
      Number.isInteger(q.revision) && typeof q.question === 'string' && typeof q.boundary === 'string' &&
      ['blocking', 'deferred'].includes(q.urgency) && Object.hasOwn(STAGE_LABELS, q.state) && Array.isArray(q.taskIds));
}
export function unresolved(q: QuestionProjection): boolean {
  return q.state === 'awaiting' || q.state === 'submitted' || q.state === 'delivered';
}
