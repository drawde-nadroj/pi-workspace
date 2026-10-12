# The thread: Tasks × Ask interaction study

An isolated browser prototype of the proposed terminal workflow. Open `index.html` in Herdr or serve this dedicated folder over loopback HTTP. This is **not a Pi extension, a settings editor, or a native terminal renderer**.

## Try it

1. Open Work and Requests. Select a row to reveal the full purpose or original wording. Technical IDs live in details, not in the list titles.
2. Open Questions. Release scope blocks linked work; handoff detail can wait.
3. Select a question, choose an answer, and add a note. Back or Escape keeps the draft and returns to the same row.
4. Submit. The answer is now submitted—not delivered, applied, or permission to run a tool.
5. Reopen the answer. Use **Simulate delivery**, then **Simulate application**, to follow the distinct states and append-only chat events.
6. Try a custom release instruction: the sample must retain the blocked release boundary, not infer approval.
7. Use the light-theme and narrow-view controls, or resize the browser.
8. Reset sample clears all in-memory answers, drafts and events.

All data is synthetic and in memory. No network requests beyond loading the local page/assets, persistence, timers, model calls, publishing, session ingestion, native draft changes or preference writes. Refreshing loses the sample state. Simulation controls do not communicate with a real agent. The demonstration's active task is authored sample data, not actual work.

## Cross-surface cohesion and `/workspace`

Shared meanings must be consistent; ownership and settings authority must remain distinct. This preview does **not** automatically apply existing personal Pi preferences. Its theme/width controls are preview-only, not competing live preferences.

| Proposed surface | State owner / visual adapter | `/workspace` consideration | Fallback and integration boundary |
| --- | --- | --- | --- |
| Work, Requests, Questions in `/tasks` | Tasks owns plans/requests; Ask owns questions; proposed adapter links records | The current Tasks room styles Home's **persistent overview**, not the entire `/tasks` modal. Do not silently extend its settings to unrelated slots. Any new supported modal visual controls need a named adapter and explicit contract in the appropriate room. | `/tasks` and task state remain usable without Home. Question records should not require Tasks to exist. |
| Selected-question overlay | Ask owns input, drafts, answers and question revisions | Use Ask's existing shell preferences where supported. Extend the Ask room for genuinely new safe visual elements; preserve question wording, options, notes, focus and answer semantics. | Standalone Ask retains defaults and an independent interaction path. Real Pi overlay focus, keyboard, mouse, IME and Vim checks remain unperformed. |
| Meaningful chat/tool events | Each component owns its event/result; Home adapts eligible transcript surfaces | Review Transcript settings, self-rendering exclusions, identity/status treatments and native expansion. Do not claim that current Transcript settings already control Tasks/Ask custom bodies. | Native/self-rendering tools remain available without Home. Historical records must not silently rewrite to claim later outcomes. |
| Composer and ongoing-work indication | Home presentation; Pi runtime owns execution | Preserve Input & footer settings and the native editor. A posted question must not falsely pause all work; a focused answer interaction must not animate as background decoration. | Native draft, Vim, completion, IME and sourced run clocks remain unchanged. The Composer pictured here is a labeled sketch only. |
| Appearance transaction | Home workspace host with component-owned validators | `pi-workspace.json` remains the versioned visual authority for existing rooms and their shared Save/Undo/Discard. No second live settings file for the same field. Unknown versions and stale writes remain protected. | `pi-tasks.json` retains Tasks enablement and independent fallback settings. Do not imply an atomic transaction across files. |

No live adapters or preferences changed. A future implementation needs a versioned question/link lifecycle, delivery acknowledgments, revision checking, session/branch/reload behavior, and consent enforcement where actions require it. The preview's state machine establishes design examples, **not** production guarantees. Notes are stored and displayed verbatim; their meaning is not interpreted by this sample. A simulated application event explicitly preserves that limitation.

## Suggested permanent project rule (not installed)

The existing project `AGENTS.md` already covers component ownership and `/workspace` visual authority. A broader rule could be added to that file if authorized:

> **Cross-surface cohesion:** Before changing behavior, terminology, state, or appearance, identify the affected surfaces—including `/workspace`, panels, overlays, chat/tool cards, and standalone fallbacks. Keep shared meanings consistent, preserve each component's ownership, and verify affected surfaces. Explicitly state which surfaces are unchanged and why. Extend the existing settings authority rather than creating a competing control; do not unify distinct states, clocks, or input contracts merely for visual consistency.

## Verification

```sh
node --test design/tasks-ask-preview/model.test.mjs
node --check design/tasks-ask-preview/app.mjs
```

Optional browser checks use an **already installed** Playwright; no project dependency is added:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/absolute/path/to/compatible/chromium \
node --test design/tasks-ask-preview/browser.test.mjs
```

`CHROMIUM_EXECUTABLE` is optional when the chosen Playwright's browser is already installed. Browser tests skip explicitly when `PLAYWRIGHT_MODULE` is absent. Screenshots go to `/tmp/pi-tasks-ask-preview-checks` by default, not Git. `PREVIEW_SCREENSHOTS` can set another local path.

Automated checks cover draft preservation, explicit submission, independent delivery/application, consent boundaries for custom answers and withdrawal, note preservation/HTML escaping, historical event order, keyboard navigation and focus restoration, close/reopen, no horizontal overflow at 1440/980/390 browser widths, dialog bounds, theme switches, and no external requests. These are browser checks, not Pi terminal cell-width or native-input tests. Screenshot review is not a human usability test.

No package exports, dependencies, runtime extension code, live settings, or project instructions were changed. This folder is outside the explicit root Pi manifest and package file list.
