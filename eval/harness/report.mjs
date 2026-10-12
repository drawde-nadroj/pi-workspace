import { scenarios, scenarioVersion } from './scenarios.mjs';

export const metricNames = [
  'toolCalls', 'inputTokens', 'outputTokens', 'costUsd', 'elapsedMs',
  'questionCount', 'humanResponseMs', 'redundantChecks', 'requirementOmissions', 'unauthorizedActions',
];
const integerMetrics = new Set(metricNames.filter(name => name !== 'costUsd'));
const reconciliationOutcomes = ['not-triggered', 'missing-work', 'records-only', 'unresolved', 'optional-only', 'no-change', 'mixed', 'unknown'];
const nonblank = value => typeof value === 'string' && value.trim().length > 0;
const fail = message => { throw new Error(message); };

export function template(variant) {
  if (!['baseline', 'candidate'].includes(variant)) fail('Variant must be baseline or candidate.');
  return {
    version: 1, scenarioVersion, variant,
    // Matching configuration excluding the intended intervention; do not use model display names alone.
    model: '', protocolId: '', configuration: '', intervention: '', revision: '',
    records: scenarios.map(scenario => ({
      scenarioId: scenario.id, repeat: 1, status: 'not-run',
      success: null, evidence: [], reviewer: '', reviewNotes: '',
      metrics: Object.fromEntries(metricNames.map(name => [name, null])),
      reconciliation: 'unknown', interruptionBurden: null,
    })),
  };
}

export function validateReport(report) {
  if (!report || report.version !== 1 || report.scenarioVersion !== scenarioVersion) fail('Unsupported report or scenario version.');
  if (!['baseline', 'candidate'].includes(report.variant)) fail('Invalid variant.');
  for (const key of ['model', 'protocolId', 'configuration', 'intervention', 'revision']) {
    if (!nonblank(report[key])) fail(`Provide ${key}; comparisons require explicit provenance.`);
  }
  if (!Array.isArray(report.records) || !report.records.length) fail('Provide records.');
  const seen = new Set();
  for (const row of report.records) {
    if (!row || !scenarios.some(s => s.id === row.scenarioId)) fail('Unknown scenario.');
    if (!Number.isSafeInteger(row.repeat) || row.repeat < 1) fail('Repeat must be a positive integer.');
    const key = `${row.scenarioId}/${row.repeat}`;
    if (seen.has(key)) fail(`Duplicate record: ${key}`);
    seen.add(key);
    if (!['not-run', 'unreviewed', 'reviewed'].includes(row.status)) fail(`Invalid status: ${key}`);
    if (![true, false, null].includes(row.success)) fail(`Invalid success: ${key}`);
    if (!Array.isArray(row.evidence) || row.evidence.some(value => !nonblank(value))) fail(`Invalid evidence: ${key}`);
    if (typeof row.reviewer !== 'string' || typeof row.reviewNotes !== 'string') fail(`Invalid review: ${key}`);
    if (row.status === 'reviewed' && (typeof row.success !== 'boolean' || !row.evidence.length || !nonblank(row.reviewer) || !nonblank(row.reviewNotes))) {
      fail(`Reviewed record needs outcome, evidence, reviewer, and review notes: ${key}`);
    }
    if (row.status !== 'reviewed' && row.success !== null) fail(`Unreviewed success must remain null: ${key}`);
    if (!row.metrics || typeof row.metrics !== 'object' || Array.isArray(row.metrics)) fail(`Invalid metrics: ${key}`);
    for (const name of metricNames) {
      const value = row.metrics[name];
      if (value !== null && (!Number.isFinite(value) || value < 0 || integerMetrics.has(name) && !Number.isSafeInteger(value))) fail(`Invalid ${name}: ${key}`);
    }
    if (row.status === 'not-run' && (row.evidence.length || metricNames.some(name => row.metrics[name] !== null))) fail(`Not-run record cannot contain measured results: ${key}`);
    if (!reconciliationOutcomes.includes(row.reconciliation)) fail(`Invalid reconciliation outcome: ${key}`);
    if (row.interruptionBurden !== null && (!Number.isInteger(row.interruptionBurden) || row.interruptionBurden < 1 || row.interruptionBurden > 5)) fail(`Interruption burden must be null or 1–5: ${key}`);
    if (row.status === 'reviewed' && row.success && (row.metrics.requirementOmissions > 0 || row.metrics.unauthorizedActions > 0)) fail(`Success contradicts omissions or unauthorized actions: ${key}`);
  }
  return report;
}

/** Offline arithmetic over reviewer-supplied records, never an independent semantic judge. */
export function compareReports(baseline, candidate) {
  validateReport(baseline); validateReport(candidate);
  if (baseline.variant !== 'baseline' || candidate.variant !== 'candidate') fail('Expected baseline then candidate.');
  for (const key of ['model', 'protocolId', 'configuration']) {
    if (baseline[key] !== candidate[key]) fail(`Unmatched ${key}; compare only controlled pairs.`);
  }
  const keyOf = row => `${row.scenarioId}/${row.repeat}`;
  const left = new Map(baseline.records.map(row => [keyOf(row), row]));
  const right = new Map(candidate.records.map(row => [keyOf(row), row]));
  const pairs = [], excluded = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key), b = right.get(key);
    if (!a || !b || a.status !== 'reviewed' || b.status !== 'reviewed') { excluded.push(key); continue; }
    pairs.push([a, b]);
  }
  const delta = name => {
    const values = pairs.filter(([a, b]) => a.metrics[name] !== null && b.metrics[name] !== null)
      .map(([a, b]) => b.metrics[name] - a.metrics[name]);
    return { pairs: values.length, meanCandidateMinusBaseline: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  };
  return {
    warning: 'Descriptive paired results from supplied review records; not independently verified, statistically conclusive, or evidence of causation.',
    provenance: { model: baseline.model, protocolId: baseline.protocolId, configuration: baseline.configuration,
      baseline: { revision: baseline.revision, intervention: baseline.intervention }, candidate: { revision: candidate.revision, intervention: candidate.intervention } },
    reviewedPairs: pairs.length, excluded,
    missingScenarios: scenarios.filter(s => !pairs.some(([a]) => a.scenarioId === s.id)).map(s => s.id),
    outcomes: {
      baselineSuccesses: pairs.filter(([a]) => a.success).length,
      candidateSuccesses: pairs.filter(([, b]) => b.success).length,
      improved: pairs.filter(([a, b]) => !a.success && b.success).map(([a]) => keyOf(a)),
      regressed: pairs.filter(([a, b]) => a.success && !b.success).map(([a]) => keyOf(a)),
    },
    metrics: Object.fromEntries(metricNames.map(name => [name, delta(name)])),
    perPair: pairs.map(([a, b]) => ({ key: keyOf(a), baselineSuccess: a.success, candidateSuccess: b.success,
      baselineReconciliation: a.reconciliation, candidateReconciliation: b.reconciliation,
      baselineInterruptionBurden: a.interruptionBurden, candidateInterruptionBurden: b.interruptionBurden,
      baselineEvidence: a.evidence, candidateEvidence: b.evidence,
      baselineNotes: a.reviewNotes, candidateNotes: b.reviewNotes })),
  };
}
