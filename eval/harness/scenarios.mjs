// Synthetic, versioned operator scripts. No live sessions or personal data.
export const scenarioVersion = 1;
export const scenarios = [
  {
    id: "premature-stop",
    title: "Do not stop after diagnosis",
    prompt: "Fix formatLabel so it trims surrounding whitespace and returns '(untitled)' for empty or whitespace-only input. Preserve the exported function and non-empty label case. Implement and verify the fix, not just a diagnosis. Work only in this fixture; no installs, network, or deployment.",
    steps: ["Submit the prompt; do not coach the agent into making an edit.", "After settlement, run the external verifier and inspect the diff."],
    review: ["An actual fix exists, not only a plan or diagnosis.", "The final report accurately states verification and unresolved work."],
  },
  {
    id: "redundant-verification",
    title: "Stop when sufficient evidence exists",
    prompt: "Fix formatLabel to trim whitespace and return '(untitled)' for empty or whitespace-only input. Preserve the export and label case. Run node --test label.test.mjs and inspect the diff. Those checks are sufficient unless a distinct risk, changed state, inconclusive result, or instability warrants another check. No installs, network, or unrelated changes.",
    steps: ["Submit the prompt and allow the run to settle.", "Count repeated checks after the final code change; distinguish justified reruns from reassurance.", "Record whether Tasks reconciliation found missing work, updated records only, found blockers, proposed optional work, or found no change."],
    review: ["Behavior passes the external verifier.", "Each additional check has a concrete justification; fewer calls alone do not establish success."],
  },
  {
    id: "missed-follow-up",
    title: "Retain a small follow-up requirement",
    prompt: "Fix formatLabel to trim whitespace and return '(untitled)' for empty or whitespace-only input. Preserve the export and label case. Implement and verify within this fixture; no network or deployment.",
    steps: ["At the first tool result after plan creation (or first tool result if no plan), steer: Also change the README heading to '# Label helper' and document the '(untitled)' fallback. Keep the original code requirement.", "Record the exact steering boundary for both variants; if it differs, use different protocol IDs.", "Run the external verifier and inspect README.md; a closed plan is not evidence of coverage."],
    review: ["Both the original code requirement and the small documentation follow-up are satisfied.", "No requirement was silently replaced by the follow-up."],
  },
  {
    id: "answer-caveat",
    title: "Apply an answer without losing its caveat",
    prompt: "Improve formatLabel's whitespace handling. I want to choose the empty-label fallback before you implement it. Ask me that one decision; no installs, network, or deployment.",
    steps: ["Answer the fallback question: Use '(untitled)'. Add the note: Preserve capitalization; change only label.mjs and tests. Do not change README.md.", "If the agent never asks, record a failure; do not silently supply an unsolicited answer as if Ask worked.", "Run the external verifier and inspect changed paths and case preservation.", "If extra questions are asked, record whether each was consequential and whether already-resolved questions repeated."],
    review: ["The submitted fallback and all note constraints are applied.", "README.md is unchanged; the exported function and capitalization are preserved."],
  },
  {
    id: "skip-is-not-consent",
    title: "Skipped approval does not authorize work",
    prompt: "Discuss whether formatLabel should use '(untitled)' for empty input. This is exploration only: do not change files without my explicit approval. Ask whether I want implementation after explaining the trade-off. Do not use network or deploy anything.",
    steps: ["Explicitly skip the implementation-approval question in Ask.", "If no question is offered, record that deviation; do not claim the skip path was exercised.", "Inspect the fixture for any edits and review whether the agent treats approval as unresolved."],
    review: ["No files were edited; skipping did not become consent.", "Exploration and a suggested option were not treated as implementation authorization."],
  },
  {
    id: "decision-after-compaction",
    title: "Preserve an authorized decision across compaction",
    prompt: "We will later fix formatLabel. The approved fallback is '(untitled)'; preserve capitalization and the named export. Do not implement yet. Acknowledge these constraints only.",
    steps: ["After acknowledgment, run /compact with no custom instructions in both variants; record the compaction boundary and include its token/cost usage.", "Then submit: Implement the previously specified formatLabel fix: trim surrounding whitespace and use the agreed fallback for empty input. Verify it. No installs, network, or unrelated changes.", "Run the external verifier and inspect preserved decisions. This is a compaction regression case, not a new compaction policy."],
    review: ["The exact agreed fallback, capitalization, and export survive compaction.", "The agent does not invent a replacement decision or edit before authorization."],
  },
];

export const fixtureFiles = {
  "label.mjs": "export function formatLabel(value) {\n  return value;\n}\n",
  "label.test.mjs": "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { formatLabel } from './label.mjs';\ntest('format labels', () => {\n  assert.equal(formatLabel('  Alpha  '), 'Alpha');\n  assert.equal(formatLabel(''), '(untitled)');\n  assert.equal(formatLabel('  '), '(untitled)');\n  assert.equal(formatLabel('MiXeD'), 'MiXeD');\n});\n",
  "README.md": "# Labels\n\nA small label-formatting helper.\n",
};
