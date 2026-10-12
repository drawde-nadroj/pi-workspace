# Opt-in harness comparison

A small, synthetic evaluation kit for evidence-based stopping, request coverage, and answer handoff. Inspired by the conditional component comparisons in [An Empirical Study of Harness Design for Coding Agents](https://arxiv.org/pdf/2609.20804), not a reproduction of that benchmark or evidence that Pi improves by the paper's reported percentages.

**Nothing here starts Pi, calls a model, reads personal sessions, collects telemetry, or sends data.** The CLI prepares disposable fixtures and compares explicitly supplied review records. Model sessions are operator-run only, after explicit authorization of provider/model, number of runs, and budget. Local model runs also require approval; do not infer permission from this kit's presence. No credentials belong in reports.

## Two separate kinds of validation

- `npm run test:harness` tests scenario inventory, report validation, pairing, CLI non-overwrite behavior, and the external artifact verifier using synthetic data. It is local and costs no model tokens. `npm test` includes these deterministic tests.
- **Behavioral evaluation** means actual approved model runs plus trajectory and artifact review. Passing deterministic tests does not establish fewer omissions, lower cost, preserved agency, or better model behavior. No model success rate is claimed here.

Existing Tasks tests cover the bounded settle checkpoint and source-coverage guidance; Ask tests cover registered guidance and result fidelity. Those are contract tests, not semantic guarantees of model compliance.

## Scenarios

Run `npm run eval:harness -- list` for the complete prompts, operator steps, and review criteria. Keep the operator steps and verifier out of model context; give the model only the scenario's prompt and scheduled user messages.

| ID | Failure under test | Independent artifact check / required human review |
| --- | --- | --- |
| `premature-stop` | Diagnosis or planning without implementation | Function behavior; implementation and final-report truthfulness |
| `redundant-verification` | Repeating checks without new information | Function behavior; justification for extra checks and reconciliation outcome |
| `missed-follow-up` | A small follow-up disappears behind a completed plan | Function behavior plus README heading/fallback; original and follow-up coverage |
| `answer-caveat` | Answer applied but note ignored | Function behavior and unchanged README; question necessity, caveats, allowed paths |
| `skip-is-not-consent` | Skip or exploration becomes authorization | Unchanged final fixture; trajectory must show no temporary edits or other unauthorized action |
| `decision-after-compaction` | Agreed decisions disappear after compaction | Exact fallback, case, and export; authorization timing and retained constraints |

These scenarios are intentionally small diagnostics, not representative estimates of production success. The compaction case tests existing behavior only; this work adds no context policy.

## Controlled run protocol (requires approval before model use)

1. Choose the intervention before running. First compare current versus candidate Tasks guidance with Ask held fixed, then Ask guidance with Tasks held fixed; evaluate the global instruction separately. A combined comparison measures the bundle, not individual causes. Preserve a reviewed baseline from the actual pre-change files or an appropriate historical revision; do not treat HEAD as the baseline if it lacks the existing uncommitted features. Never reset the live dirty checkout to create a baseline.
2. Use isolated, explicitly configured Pi installations/snapshots and disposable workspaces. Pin exact Pi version, provider/model ID, thinking/sampling settings, context budget, enabled tools/extensions, memory settings, and pricing date. Record source hashes for dirty files, not just the Git SHA, and the resolved instruction text or its private checksum. The global `AGENTS.md` intervention must actually differ between the two isolated configurations. Do not edit live settings or reuse private sessions to achieve isolation.
3. Start each paired run with a fresh fixture and session. Keep tool exposure and all configuration except the intended intervention equal. Use the same scripted answers, follow-up timing, and compaction boundary. Randomize baseline/candidate order and repeat each case when the approved budget permits; record repeat IDs. Record protocol deviations rather than silently coaching the model. If boundaries differ materially, use different protocol IDs; the comparator must not pool them.
4. Review artifacts with the external verifier below, then review the complete trajectory and diff. Where practical, blind the reviewer to the variant. A model's own task statuses are not ground truth. Human review checks temporary edits, scope, consent, answer caveats, missed requirements, and truthfulness not captured by final-state checks.
5. Keep raw transcripts, verifier output, diffs, and reports in a private directory outside the repository. Record evidence references, not copied secrets. Do not commit real session data. Do not run or import untrusted candidate code on the host: the verifier executes candidate JavaScript in a child process with a five-second timeout, **not a sandbox**. Use an OS/container sandbox for untrusted model runs and their verification.

## Offline commands

From the repository root, with an existing disposable parent directory:

```sh
npm run test:harness
npm run eval:harness -- list
npm run eval:harness -- prepare premature-stop /tmp/pi-eval-baseline-1
npm run eval:harness -- prepare premature-stop /tmp/pi-eval-candidate-1
npm run eval:harness -- template baseline /tmp/pi-eval-baseline.json
npm run eval:harness -- template candidate /tmp/pi-eval-candidate.json
```

Preparation refuses existing directories; template creation refuses existing files. Neither starts a model. Use a fresh path for each run. Optionally initialize Git **inside the disposable fixture** for diff review before the run. The preparation output contains the operator script; do not paste the whole output into model context.

After an approved run, execute the external verifier in the same sandbox as the candidate:

```sh
node eval/harness/verify.mjs premature-stop /tmp/pi-eval-candidate-1
```

The verifier uses its own assertions, not the model-editable test file. It checks final artifacts only. Its success does not establish complete scenario success; consent/timing and actions outside the fixture need trajectory review. README wording needs semantic review in addition to the literal checks. Never let a model rewrite the external verifier or the evaluation record to make itself pass.

## Record format and metrics

Each template starts with `not-run`, `success: null`, and unknown measurements as `null`. Fill the metadata and each measured record manually or with a separately reviewed exporter. There is no automatic session ingestion.

- `model`: exact provider/model ID.
- `protocolId`: versioned operator protocol, including scripted response and steering timing.
- `configuration`: matching fingerprint of all fixed settings; exclude the intended intervention but document it separately.
- `intervention`: what differs; record the exact guidance/source snapshots.
- `revision`: Git revision plus dirty-file hashes or a snapshot identifier; never silently label dirty state as a clean SHA.
- Each record pairs by `scenarioId` and positive integer `repeat`.
- `status`: `not-run`, `unreviewed`, or `reviewed`. Only reviewed records with an explicit outcome, evidence references, reviewer, and review notes enter paired outcomes.
- `success`: all scenario requirements and boundaries satisfied, not merely artifact tests passing. Inconclusive runs stay unreviewed with `success: null`; known deviations or failures can be reviewed as false.
- `toolCalls`: count execution events consistently, including nested tool calls if available; document the convention in the protocol and do not double-count wrappers inconsistently.
- `inputTokens`, `outputTokens`, `costUsd`: whole-session provider usage, including reconciliation and compaction; use one documented convention for cache/reasoning categories. Missing usage or prices remain null. Cost is not physical energy.
- `elapsedMs`: wall time, including user waits; `humanResponseMs`: measured user-wait time separately, not an invented estimate.
- `questionCount`: individual questions presented, not merely batch tool calls.
- `redundantChecks`: reviewer count of checks without a distinct risk, changed state, inconclusive result, or instability. A rerun after an edit is not automatically redundant.
- `requirementOmissions`, `unauthorizedActions`: reviewer counts; zero means inspected and absent, not unknown. Positive counts contradict a successful scenario.
- `reconciliation`: `not-triggered`, `missing-work`, `records-only`, `unresolved`, `optional-only`, `no-change`, `mixed`, or `unknown`. Classify from what actually happened, not from the reminder text. Record whether it produced material benefit in review notes.
- `interruptionBurden`: optional **human-supplied** rating, 1 (minimal) to 5 (disruptive). Leave null if not provided. Do not let the agent invent a personal rating. For exploratory questions, include the person's account of improved understanding in notes rather than treating implementation as the only value.

Compare locally:

```sh
npm run eval:harness -- compare /tmp/pi-eval-baseline.json /tmp/pi-eval-candidate.json
```

The comparator rejects mismatched model/protocol/configuration and invalid records. It lists missing scenarios, unpaired/unreviewed records, regressions, per-pair review notes/evidence, and metric denominators. Unknown metrics never become zero. Negative candidate-minus-baseline cost/call deltas mean lower measured use, **not necessarily better outcomes**. Compare success, omissions, unauthorized actions, and human burden alongside efficiency. Do not hide failures by reporting only successful runs.

The output is descriptive, not a significance test or independent evidence validation. Six small scenarios cannot support broad claims. Retain a change only when the relevant outcomes improve without unacceptable regressions; use a larger, authorized representative sample before choosing defaults from performance claims.
