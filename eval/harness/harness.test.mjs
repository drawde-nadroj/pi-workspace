import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './cli.mjs';
import { scenarios, fixtureFiles } from './scenarios.mjs';
import { template, validateReport, compareReports, metricNames } from './report.mjs';
import { verify } from './verify.mjs';

function report(variant) {
  return { ...template(variant), model: 'test/model', protocolId: 'synthetic-v1', configuration: 'fixed synthetic configuration', intervention: variant, revision: `fixture-${variant}` };
}
function reviewed(row, success = true) {
  return { ...row, status: 'reviewed', success, reviewer: 'synthetic test', reviewNotes: 'Synthetic test data; not a real model run.', evidence: ['fixture-only'], metrics: { ...row.metrics, requirementOmissions: 0, unauthorizedActions: 0 } };
}

test('scenario inventory covers all six approved failure types with operator checks', () => {
  assert.deepEqual(scenarios.map(s => s.id), ['premature-stop', 'redundant-verification', 'missed-follow-up', 'answer-caveat', 'skip-is-not-consent', 'decision-after-compaction']);
  for (const scenario of scenarios) {
    assert.ok(scenario.prompt && scenario.steps.length && scenario.review.length);
  }
});

test('templates cannot be mistaken for measured or reviewed runs', () => {
  assert.throws(() => validateReport(template('baseline')), /Provide model/);
  const a = report('baseline'), b = report('candidate');
  validateReport(a);
  const result = compareReports(a, b);
  assert.equal(result.reviewedPairs, 0);
  assert.equal(result.excluded.length, 6);
  assert.equal(result.missingScenarios.length, 6);
  assert.equal(result.metrics.costUsd.meanCandidateMinusBaseline, null);
  assert.equal(result.metrics.costUsd.pairs, 0);
  assert.throws(() => template('other'), /Variant/);
});

test('paired comparison reports regressions and uses only known paired metrics', () => {
  const a = report('baseline'), b = report('candidate');
  a.records[0] = reviewed(a.records[0]); b.records[0] = reviewed(b.records[0], false);
  a.records[0].metrics.toolCalls = 8; b.records[0].metrics.toolCalls = 5;
  a.records[0].metrics.costUsd = 0.2; // Candidate missing: must not become zero.
  const result = compareReports(a, b);
  assert.equal(result.reviewedPairs, 1);
  assert.deepEqual(result.outcomes.regressed, ['premature-stop/1']);
  assert.equal(result.metrics.toolCalls.meanCandidateMinusBaseline, -3);
  assert.equal(result.metrics.costUsd.pairs, 0);
  assert.equal(result.perPair[0].candidateNotes, 'Synthetic test data; not a real model run.');
  b.model = 'different';
  assert.throws(() => compareReports(a, b), /Unmatched model/);
});

test('provenance, duplicate pairs, invalid metrics, and unsupported success claims fail closed', () => {
  const mutations = [
    r => { r.records.push(r.records[0]); },
    r => { r.records[0].success = true; },
    r => { r.records[0].metrics.toolCalls = -1; },
    r => { r.records[0].metrics.toolCalls = 1.5; },
    r => { delete r.records[0].metrics.costUsd; },
    r => { r.records[0].status = 'reviewed'; },
    r => { r.records[0].scenarioId = 'unknown'; },
    r => { r.scenarioVersion = 999; },
    r => { r.records[0] = reviewed(r.records[0]); r.records[0].metrics.unauthorizedActions = 1; },
    r => { r.records[0].interruptionBurden = 6; },
  ];
  for (const mutate of mutations) {
    const r = report('baseline'); mutate(r);
    assert.throws(() => validateReport(r));
  }
  assert.ok(metricNames.includes('humanResponseMs'));
  assert.ok(metricNames.includes('redundantChecks'));
});

test('repeat IDs pair explicitly; missing counterparts are not pooled', () => {
  const a = report('baseline'), b = report('candidate');
  a.records = [reviewed({ ...a.records[0], repeat: 2 })];
  b.records = [reviewed(b.records[0])];
  const result = compareReports(a, b);
  assert.equal(result.reviewedPairs, 0);
  assert.deepEqual(result.excluded.sort(), ['premature-stop/1', 'premature-stop/2']);
});

test('CLI prepares fresh fixtures and templates without overwriting existing work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-harness-test-'));
  try {
    const directory = join(root, 'fixture');
    const prepared = await main(['prepare', 'premature-stop', directory]);
    assert.equal(prepared.scenario.id, 'premature-stop');
    assert.deepEqual((await readdir(directory)).sort(), Object.keys(fixtureFiles).sort());
    assert.equal(await readFile(join(directory, 'label.mjs'), 'utf8'), fixtureFiles['label.mjs']);
    await assert.rejects(main(['prepare', 'premature-stop', directory]), /EEXIST/);
    await assert.rejects(main(['prepare', 'unknown', join(root, 'invalid')]), /Unknown/);
    const path = join(root, 'report.json');
    await main(['template', 'baseline', path]);
    await assert.rejects(main(['template', 'candidate', path]), /EEXIST/);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).variant, 'baseline');
    await assert.rejects(main(['run-model']), /Usage/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('external artifact verifier rejects broken behavior and missed follow-up, but does not claim full success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-harness-verify-'));
  try {
    const directory = join(root, 'fixture');
    await main(['prepare', 'premature-stop', directory]);
    await assert.rejects(verify('premature-stop', directory), /Behavior check failed/);
    assert.equal((await verify('skip-is-not-consent', directory)).artifactChecks, 'passed');
    await writeFile(join(directory, 'label.mjs'), "export function formatLabel(value) { return value.trim() || '(untitled)'; }\n");
    const passed = await verify('answer-caveat', directory);
    assert.equal(passed.artifactChecks, 'passed');
    assert.match(passed.warning, /not full scenario success/);
    await assert.rejects(verify('skip-is-not-consent', directory), /changed without approval/);
    await assert.rejects(verify('missed-follow-up', directory));
    await writeFile(join(directory, 'README.md'), "# Label helper\n\nEmpty labels use '(untitled)'.\n");
    assert.equal((await verify('missed-follow-up', directory)).artifactChecks, 'passed');
    await assert.rejects(verify('answer-caveat', directory));
    await assert.rejects(verify('unknown', directory), /Unknown scenario/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
