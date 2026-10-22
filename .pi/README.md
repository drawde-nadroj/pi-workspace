# Project-local Pi commands

Files here load only when Pi runs in this checkout, and only after Pi is told to trust this folder (Pi asks once, `--approve` trusts for one run, `/trust` saves the decision). Commands appear in the editor after `/reload`.

## `/update [check|all]`

Updates the Pi host and patches the suite to it: a classified baseline (recorded baseline versus installed host, with a failure ledger), changelog and declaration diff against the recorded baseline release, every callsite and guarded native internal reviewed, version statements and the lockfile host refreshed, then the full pipeline with the ledger reconciled plus an isolated cold load. An already-upgraded, already-broken suite is repaired rather than refused.

- `/update` — update Pi, then patch this suite.
- `/update all` — update Pi and installed packages, then patch.
- `/update check` — report installed versus latest and stop.

The prompt is intentionally project-scoped: its commands, version references and verification steps name this repository's files, so it is not copied to the global `~/.pi/agent/prompts`.

## Tracking

`.gitignore` ignores `.pi/` because Pi writes runtime state (`settings.json`, `sessions`, trust and auth files) there. Only `prompts/` and this file are un-ignored, because they are shared tooling rather than personal preferences. Add another un-ignore rule for a new shared resource instead of committing the whole directory.
