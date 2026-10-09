# Isolated workspace acceptance (Pi 1.0.0)

This report covers the **checkout suite**, not the live installation. The checkout was tested with Pi 1.0.0, Node 26.8.1, npm 12.1.0 and an isolated `PI_CODING_AGENT_DIR` in a temporary directory. No model credentials or session history were copied into it; no live Pi settings or extensions were changed. In a follow-up, only the current Home appearance preference was copied **into a separate temporary sandbox** to compare the actual Composer look. `docs/MIGRATION.md` remains a proposal, not an authorization.

## Checks and evidence

| Area | Result | Evidence and limit |
| --- | --- | --- |
| Distribution and cold start | Passed, with a default-look mismatch | `npm test` packs and loads only Home, Tasks and Ask, confirms one owner per command/tool, verifies a real offline RPC process and Tasks-alone cold load. An isolated `pi install` of the checkout listed the single suite and an interactive Pi session reported `pi-home, pi-tasks, questions.ts`. **An empty agent directory still starts in legacy Biolume**, not the owner's saved Composer look. Do not use that initial screen as evidence for the current design. |
| Wide/narrow/fullscreen | Passed in sandbox | Fullscreen at 120×42 and 40×24 showed Composer, Tasks, Ask and Transcript rooms. In a separate current-appearance sandbox, the 120×42 dark startup showed `pi / composer` and its native framed editor; `/footer` opened the Input & footer room and Tab reached Tasks, Ask and Transcript. The 40×24 Transcript view retained its controls and sample without line overflow; optional labels truncated. Existing tests also exercise widths from 1 to 160 cells, short terminal heights, and preview hit bounds. |
| Light/regular mode | Passed in sandbox | Light theme, regular TUI mode at 64×30 and 24×20 displayed Composer and Ask and retained Tab/arrow/Enter navigation. A fresh 64×30 light/regular session with **only the owner's `pi-home.json` copied** showed `pi / composer` and the Input & footer workspace, not Biolume. Regular mode leaves mouse selection to the terminal; the workspace does not require mouse input. |
| Mouse and keyboard | Passed in sandbox | Fullscreen SGR mouse injection selected both a Transcript list entry and an Assistant label in its rendered sample. Keyboard Tab opened Tasks, Ask and Transcript; Enter changed an appearance option. Existing interaction tests cover selectable preview labels, hidden/narrow keyboard access, native grouped-tool mouse mapping and Ask choice focus. |
| Unicode and native editor | Partial interactive, automated coverage | A light-theme Ask title `質問 界面 🧭` rendered in the 64-cell workspace and preview; Discard left the saved file unchanged. Existing tests exercise CJK/emoji/combining widths, one cursor marker and native draft restoration. An isolated Pi+pi-vim session showed INSERT/NORMAL mode, edits and undo and opened/closed `/footer`. This is **not** a physical IME candidate-window test. |
| Transaction and reload | Passed in sandbox | Changing Transcript identity to `quiet`, Ctrl+Z, changing it again and Ctrl+S updated only the isolated `pi-footer.json`. `/reload` completed; reopening Transcript displayed `quiet`. A separate unsaved Unicode title was discarded with the saved preference bytes unchanged. Tests also cover malformed/unknown-version settings, failed Save, time provenance and native fallbacks. |
| Rollback mechanics | Partial drill | After stopping the sandbox Pi process, `pi remove` removed the suite from **isolated settings**. Restoring a backed-up isolated `settings.json` made the suite visible to `pi list` again, and a fresh offline Pi start opened `/footer`. The saved `pi-footer.json` was byte-for-byte unchanged. This does **not** exercise the live move/restore of old Home/Tasks extension directories. |
| Non-TUI and fallback | Automated only | Offline Pi RPC startup and repeated extension loads passed. Unit tests cover standalone Ask, Frame, Tasks without Home, unsupported/graphical/self-rendering tool fallback and Pi's native adapters. A live authenticated model turn and real question replacement were not exercised in the sandbox. |

**Not verified by a person at the terminal:** physical IME positioning/candidate selection, actual font/color legibility across the user's terminal themes, transcript selection while dragging, animation perception/reduced motion, an authenticated tool run, and live-installation rollback. Automated tests cover the relevant layout and state contracts, but they are not substitutes for these observations. Do not describe the suite as fully visually accepted on that basis.

## Repeatable isolated review

Use a **fresh, temporary** agent directory outside `~/.pi` and a throwaway project. Do not run `pi install` against your normal agent directory or start the suite alongside the older live copies. **Without saved appearance preferences, this checkout still defaults to Biolume.** To review the owner's actual Composer appearance, optionally copy *only* existing `pi-home.json` and `pi-footer.json` into the sandbox before launching Pi. The owner's `pi-home.json` selected Composer; `pi-footer.json` did not exist, so only Home was copied. Do not copy credentials, sessions, task history or a whole agent directory. For example:

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

Before any live switch, a person must sign off on the unverified observations above and check the exact backup/restore procedure in [MIGRATION.md](MIGRATION.md). The next step is **not** automatic installation.
