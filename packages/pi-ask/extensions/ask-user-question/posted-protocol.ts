/** Trusted, process-local display/link protocol. No components, callbacks or plan mutations. */
export const POSTED = {
  probe: 'pi-ask:posted:v1:probe', update: 'pi-ask:posted:v1:update', open: 'pi-ask:posted:v1:open',
  catalogue: 'pi-tasks:links:v1:update', catalogueProbe: 'pi-tasks:links:v1:probe',
  interaction: 'pi-workspace:interaction:v1', needed: 'pi-ask:posted:v1:needed',
} as const;
export type QuestionStage = 'awaiting' | 'submitted' | 'delivered' | 'applied' | 'withdrawn' | 'replaced';
export const STAGE_LABELS: Record<QuestionStage, string> = {
  awaiting: 'Awaiting answer', submitted: 'Answer submitted', delivered: 'Delivered to agent',
  applied: 'Agent reports applied', withdrawn: 'Withdrawn · not approval', replaced: 'Replaced',
};
export interface QuestionProjection {
  id: string; revision: number; question: string; urgency: 'blocking' | 'deferred'; state: QuestionStage;
  boundary: string; planId?: string; taskIds: string[]; responseStatus?: string; consequence?: string; replacementId?: string; neededNow?: string;
}
export interface QuestionSnapshot { version: 1; sessionId: string; available: boolean; questions: QuestionProjection[]; fault?: string }
export interface QuestionOpen { version: 1; sessionId: string; id: string; revision: number }
export interface TaskCatalogue { version: 1; sessionId: string; available: boolean; plans: { id: string; taskIds: string[] }[] }
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
