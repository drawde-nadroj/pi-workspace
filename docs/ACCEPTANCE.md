# Isolated workspace acceptance (Pi 1.0.0)

This report records **isolated checkout acceptance** and a later, separately authorized live-configuration switch. The checkout was tested with Pi 1.0.0, Node 26.8.1, npm 12.1.0 and an isolated `PI_CODING_AGENT_DIR` in a temporary directory. No model credentials or session history were copied into it. A follow-up copied only the current Home appearance preference **into a separate temporary sandbox** to compare the actual Composer look. After reviewing the remaining unknowns, the user explicitly approved switching the live Pi configuration; see [MIGRATION.md](MIGRATION.md).

## Checks and evidence

| Area | Result | Evidence and limit |
| --- | --- | --- |
| Distribution and cold start | Passed after cleanup | `npm test` packs and loads only Home, Tasks and Ask, confirms one owner per command/tool, verifies a real offline RPC process and Tasks-alone cold load. An isolated `pi install` of the checkout listed the single suite and an interactive Pi session reported `pi-home, pi-tasks, questions.ts`. The earlier empty-agent Biolume mismatch was reproduced and corrected in the checkout: a fresh 96×36 cold start now shows `pi / composer`, `/home` lists only supported Composer controls, and `/footer` opens all four rooms without creating a Home preferences file. This is not a live-installation observation. |
| Wide/narrow/fullscreen | Passed in sandbox | Fullscreen at 120×42 and 40×24 showed Composer, Tasks, Ask and Transcript rooms. In separate current-appearance sandboxes, the 120×42 dark startup showed `pi / composer` and its native framed editor; `/footer` opened the Input & footer room and keyboard Tab reached Tasks, Ask and Transcript. After the Composer-only cleanup, another isolated 120×42 dark run with a copy of the owner's `pi-home.json` repeated those checks and retained accessible element/property controls at 40×24. The 40×24 Transcript view retained its controls and sample without line overflow; optional labels truncated. Existing tests also exercise widths from 1 to 160 cells, short terminal heights, and preview hit bounds. |
| Light/regular mode | Passed in sandbox | Light theme, regular TUI mode at 64×30 and 24×20 displayed Composer and Ask and retained Tab/arrow/Enter navigation. A fresh 64×30 light/regular session with **only the owner's `pi-home.json` copied** showed `pi / composer` and the Input & footer workspace both before and after the default cleanup. Regular mode leaves mouse selection to the terminal; the workspace does not require mouse input. |
| Mouse and keyboard | Passed in sandbox | Fullscreen SGR mouse injection selected both a Transcript list entry and an Assistant label in its rendered sample. Keyboard Tab opened Tasks, Ask and Transcript; Enter changed an appearance option. Existing interaction tests cover selectable preview labels, hidden/narrow keyboard access, native grouped-tool mouse mapping and Ask choice focus. |
| Unicode and native editor | Partial interactive, automated coverage | A light-theme Ask title `質問 界面 🧭` rendered in the 64-cell workspace and preview; Discard left the saved file unchanged. Existing tests exercise CJK/emoji/combining widths, one cursor marker and native draft restoration. An isolated Pi+pi-vim session showed INSERT/NORMAL mode, edits and undo and opened/closed `/footer`. This is **not** a physical IME candidate-window test. |
| Transaction and reload | Passed in sandbox | Changing Transcript identity to `quiet`, Ctrl+Z, changing it again and Ctrl+S updated only the isolated `pi-footer.json`. This was repeated after the Composer-only cleanup: the cloned Home preference stayed byte-for-byte identical to the live file, the live footer preference remained absent, `/reload` completed and reopening Transcript displayed `quiet`. A separate unsaved Unicode title was discarded with the saved preference bytes unchanged. Tests also cover malformed/unknown-version settings, failed Save, time provenance and native fallbacks. |
| Rollback mechanics | Partial drill | After stopping the sandbox Pi process, `pi remove` removed the suite from **isolated settings**. Restoring a backed-up isolated `settings.json` made the suite visible to `pi list` again, and a fresh offline Pi start opened `/footer`. The saved `pi-footer.json` was byte-for-byte unchanged. The authorized live switch left the old Home/Tasks directories in place and added tested exact exclusions; its settings-only rollback is documented in a restricted backup but has **not** been exercised on the live installation. |
| Non-TUI and fallback | Automated only | Offline Pi RPC startup and repeated extension loads passed. A repeat checkout run after the cleanup passed all 304 tests, Ask typecheck and Frame/Ask/suite pack checks. Unit tests cover standalone Ask, Frame, Tasks without Home, unsupported/graphical/self-rendering tool fallback and Pi's native adapters. A live authenticated model turn and real question replacement were not exercised in the sandbox. |

## Post-switch live-configuration check

After explicit approval despite the remaining gaps, the live settings replaced the two standalone Frame/Ask package entries with one checkout suite path and added exact exclusions for old Home/Tasks auto-discovery. The old source directories and saved preferences remained unchanged. A separate fresh offline Pi RPC process found one suite-owned `/home`, `/footer`, `/tasks`, `/recaps` and `/composer-preview` command. A no-session terminal process started with Composer and the existing pi-vim, displayed `/footer` at 100×36 and 40×24, opened `/tasks`, completed `/reload` and reopened `/footer`. There was no model call, preference save or session-history change. This **does not** mean the already-running Pi conversation changed in place; a fresh user process is required. The original settings, source and preference copies and checksum-guarded rollback instructions are in the restricted `~/.pi/backups/pi-workspace-*/` directory; see [MIGRATION.md](MIGRATION.md).

**Not verified by a person at the terminal:** physical IME positioning/candidate selection, actual font/color legibility across the user's terminal themes, transcript selection while dragging, animation perception/reduced motion, an authenticated tool run, and live-installation rollback. Automated tests and the offline post-switch start cover the relevant layout and state contracts, but are not substitutes for these observations. The user approved the live switch with these unknowns; do not describe the suite as fully visually accepted on that basis.

## Repeatable isolated review

Use a **fresh, temporary** agent directory outside `~/.pi` and a throwaway project. Do not run `pi install` against your normal agent directory or start the suite alongside the older live copies. **A fresh checkout now defaults to Composer.** To review any custom saved appearance rather than only defaults, optionally copy *only* existing `pi-home.json` and `pi-footer.json` into the sandbox before launching Pi. The owner's `pi-home.json` selected Composer; `pi-footer.json` did not exist, so only Home was copied in the earlier comparison. Do not copy credentials, sessions, task history or a whole agent directory. For example:

```bash
cd ~/code/pi-workspace
npm ci && npm test && npm run pack:check
sandbox=$(mktemp -d)
mkdir -p "$sandbox/agent" "$sandbox/project"
# Optional: match your saved appearance without changing live Pi.
for name in pi-home.json pi-footer.json; do
  if test -f "$HOME/.pi/agent/$name"; then
    install -m 600 "$HOME/.pi/agent/$name" "$sandbox/agent/$name"
  fi
done
PI_CODING_AGENT_DIR="$sandbox/agent" PI_OFFLINE=1 pi install "$PWD"
cd "$sandbox/project"
PI_CODING_AGENT_DIR="$sandbox/agent" PI_OFFLINE=1 pi --offline --no-session \
  --no-context-files --no-skills --no-prompt-templates --no-themes --no-approve \
  --use-theme dark
```

No model sign-in is necessary to inspect `/footer`. Test its four rooms, use keyboard and fullscreen mouse where available, change a visual control, Undo, Discard, Save, then `/reload` and reopen. Repeat with `--use-theme light --tui-mode regular` and a narrow terminal. Use Pi's actual terminal to check IME, selection, theme contrast and motion. Stop Pi before deleting the **temporary** sandbox; do not remove or overwrite your live preference files. Add `pi-vim` only in the sandbox if checking that optional integration. Capture no private drafts or credentials in a committed log.

The authorized live switch and its rollback are recorded in [MIGRATION.md](MIGRATION.md). For ordinary use, finish the current Pi conversation and start Pi in a fresh process rather than relying on cached modules from this already-running session. Further rollouts or preference changes still require separate authorization.
