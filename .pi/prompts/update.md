---
description: Update Pi and patch this workspace suite to the new host
argument-hint: "[check|all]"
---
Update the Pi host and make this checkout work on it.

Work only in the current checkout (the `pi-egregore` source). Do not commit, push, publish, or change live Pi settings, trust decisions or personal preferences.

Mode from the user: `${1:-self}`

- `check` — report installed versus latest without installing, then stop.
- `self` or empty — update Pi only, then patch this suite.
- `all` — update Pi and installed packages, then patch this suite.
- Anything else — show the three accepted values and stop.

Read `AGENTS.md`, `README.md` and `docs/ARCHITECTURE.md` before editing source. Changes must follow the existing component ownership; do not restructure the suite to fit a new host.

## 0. Record the baseline before changing anything

```bash
pi --version; node --version; npm --version
git status --short; git rev-parse --abbrev-ref HEAD
cat ~/.pi/agent/install/current-version
grep -rn "Pi [0-9][0-9.]* host\|supported baseline" README.md docs/INSTALL.md docs/ARCHITECTURE.md
npm test
npm run typecheck --workspace=pi-ask
npm run pack:check
```

Keep three separate facts; never collapse them into one "version":

- **Installed host** — `pi --version`, and the release directory that `current-version` names.
- **Host under test** — tests resolve `PI_WORKSPACE_HOST_MODULES`, else `~/.pi/agent/install/releases/$(cat current-version)/node_modules`. If `pi` on `PATH` is npm-installed, or a `PI_*_HOST_MODULES` override is exported, these can differ. State which host the pipeline actually used; that is the target this patch must satisfy.
- **Recorded baseline** — the Pi version this repository claims to be verified against, as written in `docs/INSTALL.md` and `README.md`.

Classify the baseline instead of stopping on it. Record each failure verbatim (test name, error, file) in a ledger, and mark the tree's pre-existing dirty files. The ledger is evidence, not an excuse: after patching, every entry must be either fixed or explicitly reclassified with evidence for the new failure.

Stop and report only when:

- dependency installation cannot complete (`npm ci` fails), so the pipeline gives no signal at all; or
- **host under test equals the recorded baseline and the baseline is red**. The suite is then broken on the host it claims to support, which is a separate bug-fix task, not a host upgrade. Say that plainly and stop.

Otherwise continue, including when the baseline is red because the host is already ahead of the recorded baseline — that is the expected case for repairing a suite that Pi was upgraded before `/update` ran.

## 1. `check` mode: report only

Report the installed host, the host under test, the recorded baseline, and whether they differ; that delta is what later phases act on. Compare against `npm view @earendil-works/pi-coding-agent version` (this uses the network). Include the new host's `CHANGELOG.md` sections above the installed version so the user can judge the change. Install nothing and edit nothing.

## 2. Update the host

- `self`: `pi update`
- `all`: `pi update --all`

Do not add `--approve`/`--no-approve`; those control project trust, not updates. Do not use `--force` unless the managed installation is demonstrably corrupt, and say why. A local-path package in `--all` may fail to update; report that and continue patching for the Pi upgrade rather than repairing the user's environment.

Verify the new state: `pi --version`, a matching directory in `~/.pi/agent/install/releases/`, and the updated `current-version`. Re-read the host under test after the update; it must be the new release.

"When `pi update` says it is already current" is not a stop condition. Compare the installed host against the recorded baseline: continue whenever they differ, so a suite that is already stale gets repaired, and stop only when they match and the phase 0 ledger is empty.


## 3. Read what actually changed

Define the endpoints before diffing. `new` is the host under test from phase 2. `old` is the release directory for the **recorded baseline** version, which is not necessarily the release that was installed when this command started — a suite upgraded earlier has already lost that one:

```bash
ls ~/.pi/agent/install/releases            # pick the recorded baseline if it is still present
old=~/.pi/agent/install/releases/<recorded-baseline>/node_modules/@earendil-works
new=~/.pi/agent/install/releases/<host-under-test>/node_modules/@earendil-works
git diff --no-index --stat "$old/pi-coding-agent/dist" "$new/pi-coding-agent/dist"
git diff --no-index -- "$old/pi-coding-agent/dist/index.d.ts" "$new/pi-coding-agent/dist/index.d.ts"
git diff --no-index -- "$old/pi-tui/dist/index.d.ts" "$new/pi-tui/dist/index.d.ts"
git diff --no-index -- "$old/pi-ai/dist/index.d.ts" "$new/pi-ai/dist/index.d.ts"
```

A `git diff --no-index` exit status of 1 means the files differ, not that the command failed. If the recorded-baseline release directory is gone, use the nearest older release still installed, say which one you used, and note that it may predate the actual baseline. Also read:

- every `CHANGELOG.md` section between the old and new version;
- the changed `.d.ts` files under `pi-coding-agent/dist/core` and `dist/core/extensions`;
- `dist/migrations.js` for settings or file migrations that touch this suite;
- the installed documentation for `extensions.md`, `tui.md`, `slash-commands.md`, `prompt-templates.md`, `settings.md`, `packages.md`, `message-types.md` and `session-format.md`;
- the new `package.json` `engines` range.

If no older release directory exists, say so and rely on the changelog plus direct inspection of the new declarations. Do not claim a diff you did not perform.

## 3a. Turn the baseline ledger into the repair list

When the host was already upgraded before this command ran, the baseline failures *are* the compatibility breakage. Map each ledger entry to the change that caused it, so phase 4 starts from evidence rather than from a blind audit. Entries you cannot explain from the diff must still be carried forward and reclassified in phase 6 — never quietly dropped, and never cited as the reason to stop.


## 4. Map this repository onto the changed surface

- Find every host import: `grep -rn "@earendil-works/" extensions packages lib tests eval --include=*.ts --include=*.mjs`.
- Revalidate the guarded native internals that no public API covers: `native-message-adapter.ts`, `paint-guard.ts`, `grouped-tools.ts`, `activity-blocks.ts`, `sent-messages.ts`, `copy-selection.ts`, `recaps.ts`, `packages/pi-ask/extensions/ask-user-question/{appearance,posted,tui-primitives}.ts`, and the alias targets in `extensions/pi-egregore/tests/host.mjs`. Keep these behind their existing single documented boundary; do not add a second private-field cast path.
- Check the contracts the suite versions itself: `pi-egregore.json` settings keys and validation, the `pi-footer.json`/`pi-home.json` fallbacks, `pi-tasks.json`, extension event names, slash-command registration, footer and editor slots, theme JSON shape, and keybindings.
- Check Ask's renderer-owned fake-cursor protocol and hardware-cursor suppression if the TUI diff touches cursors.
- If a public API changed, migrate every callsite. Do not leave a shim that keeps the old shape alive.

## 5. Patch

- Fix the source. Never delete, skip or weaken a test to get green. When Pi legitimately changed behavior, update the expectation and state why.
- Refresh the development host in the lockfile so CI tests the new host rather than the old one. Pruning the host entries is what re-resolves them, because `*` peers already satisfied keep their locked version:

  ```bash
  node -e 'const fs=require("fs");const p="package-lock.json";const l=JSON.parse(fs.readFileSync(p,"utf8"));for(const k of Object.keys(l.packages))if(k.includes("@earendil-works/"))delete l.packages[k];fs.writeFileSync(p,JSON.stringify(l,null,2)+"\n")'
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund
  npm ci
  node -e 'console.log(require("./package-lock.json").packages["node_modules/@earendil-works/pi-coding-agent"].version)'
  ```

  The lock must resolve the new version while `package.json` gains no Pi dependency and its peers stay `*`. If npm insists on adding one, stop and report the conflict rather than changing the package contract.
- Update every place that states the verified-host baseline, using the **recorded baseline** version (not the new one) as the search term: `grep -rn "<recorded baseline version>" --exclude-dir=node_modules --exclude-dir=.git .` covers `README.md`, `docs/INSTALL.md`, `docs/ARCHITECTURE.md`, `docs/MIGRATION.md`, `docs/TRY-PREVIEW.md`, `extensions/pi-egregore/README.md`, `extensions/pi-egregore/FOOTER.md`, `extensions/pi-tasks/README.md` and the `Select locked … host` step in `.github/workflows/test.yml`. Add a short compatibility section to `docs/MIGRATION.md` in the style of the existing one, and an `Unreleased` bullet in `CHANGELOG.md`. Leave historical changelog entries and lockfile integrity hashes alone.
- Re-read the new Node engine range and the optional pi-vim note. Change the Node/npm baseline or the Vim guidance only if the new host actually changes them.

## 6. Verify on the new host

```bash
npm test
npm run typecheck --workspace=pi-ask
npm run pack:check
```

`tests/suite-package.test.mjs` packs the suite and cold-loads it in an isolated Pi, so a green `npm test` already exercises the new host through the `current-version` release. Also confirm the CI host path explicitly: `PI_WORKSPACE_HOST_MODULES="$PWD/node_modules" npm test` after `npm ci`.

Reconcile the phase 0 ledger against this run. Every entry must be fixed, or explicitly reclassified with evidence that it is a separate pre-existing fault outside this upgrade — for example a missing `fd` binary, or a failure reproducible on the recorded baseline with the same error. A ledger entry that merely stopped failing because a test was weakened does not count as fixed. Green tests with an unreconciled ledger is not a completed update; report the gap.

Then cold-load the real surface in a throwaway agent directory following `docs/ACCEPTANCE.md` → "Repeatable isolated review", and exercise `/egregore`, `/tasks`, `/composer` and `/questions`. Start a fresh Pi process for this: `/reload` is not proof after a host upgrade.

## Report

- The recorded baseline, the installed host, the host the pipeline actually used, and which update command ran.
- Whether the baseline was already red on entry, and what each ledger entry became (fixed, reclassified with evidence, or still open).
- API changes found, files patched, and behavior deliberately changed.
- Each check actually run with its result, and every check not run with the reason.
- Remaining risk, especially guarded internals you could not revalidate and anything only a human can confirm (IME, theme contrast, real mouse, authenticated tool flows).
