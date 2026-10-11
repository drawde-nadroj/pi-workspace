# Chronomancer (local prototype)

Quiet capture and deliberate rewind in Pi. A **standalone dated Markdown journal** is the source of truth; Neovim is optional. The package is not installed in live Pi settings by this checkout. It does not switch Pi conversation sessions, alter `/tree` or `/fork`, or submit thoughts to a model.

## Start and reconnect

Launch Pi from the directory you want to journal with `pi --extension /Users/jordan/code/pi-workspace/packages/chronomancer` (adjust for your checkout). Type **`/chronomancer`**. There is no setup picker or path to enter: it recognizes the journal in the current directory (or its `chronomancer/` subdirectory), or creates `chronomancer/` if none exists. It always opens **today**; the dated file is created only when you send your first thought. Each working directory can have its own journal. An existing directory without a valid journal marker is *not* silently converted or overwritten.

`/chronomancer create` is an idempotent alias for the same local discovery. To deliberately open a journal outside this directory, use `/chronomancer connect /absolute/path/to/chronomancer`. That reconnects Markdown, **not** a different Pi conversation. `/chronomancer off` restores ordinary Pi input; `/chronomancer on` re-enters the last connected journal (or opens this directory's journal) on today. Existing Pi session titles remain unchanged. When Home is loaded, Chronomancer mode suppresses the Composer's run-state / `your turn` label without modifying `/footer` preferences.

## Capture and revisit

- In mode, Enter in Pi's native bottom composer saves a red H1 thought to `YYYY-MM-DD.md` **without a model call**. It appears in Pi's transcript with the same native user-message body, speaker, Sent label, and frame as a normal sent message; it is a durable display entry, not an agent prompt. The selected journal date stays visible above the editor. The Markdown journal can be opened or reviewed by any editor or agent.
- `/chronomancer day YYYY-MM-DD` selects an old day for new thoughts and child additions. `/chronomancer today` returns to today. The selected old day stays selected until explicitly changed. When following today, the date rolls over at the next capture after local midnight.
- `/chronomancer rewind` selects the latest red root in that day's file; `/chronomancer next` walks toward older roots. The bottom composer still saves **new red roots** to the selected day.
- `/chronomancer add` opens a temporary editor for a child of the selected thought. Saving deepens it through orange, yellow, green, and blue; cancel does not write. `/chronomancer deeper` revisits a saved child.
- At blue, `/chronomancer ask` **explicitly** invokes the selected Pi model for one purple question. The question is in Pi's session, **not** a journal submission. No model is called automatically when you reach blue.

Each entry has its own ID, explicit parent, selected journal day, and an ISO `created-at` timestamp for when it was *actually written*. An addition to an older day is filed there but retains today's real creation date. A new red entry matches Home's default sent-user frame; child frames keep that shape and change border/identity/Sent color by stage. The displayed `Sent YYYY-MM-DD …` label at bottom-right uses the real creation date for an older selected day. When Home is loaded and an actual Pi message has a sourced Sent time, its frame shows the **real YYYY-MM-DD** during past-day mode; normal-mode formatting returns on exit. Older/unsourced messages do not acquire invented timestamps.

## Boundaries

This is a local prototype, not yet a simultaneous inline rewind composer: the child editor temporarily takes focus, while the native bottom draft remains intact. Connecting to a journal *outside* the current working directory requires its absolute path; there is not yet a browsable history like `pi -r`. One Pi conversation can visit many dated files, and a later agent review must read those files deliberately; the whole journal is not automatically inserted into model context. Purple-question model usage is not yet counted as a Pi session usage entry.

No new setup screen is needed: the child editor is Pi's native editor, the selected-day hint is a small native widget, and transcript entries reuse the installed `pi-embeddable-frame` package shared with Home. Keep that package resolvable when installing Chronomancer elsewhere. Writes use IDs, heading-depth validation, an exclusive lock for cooperating Chronomancer processes, a fresh disk read and atomic replacement. Unknown or malformed day files, structural headings in drafts, symlink day files and missing parents are rejected. A simultaneous non-Chronomancer editor write in the narrow interval between the final disk check and rename cannot be excluded; coordinate edits when both apps write the same day. If a Pi input write fails, the submitted text is restored to the editor if it is still empty.

## Verify

From this directory: `npm test`. From the suite checkout: `./node_modules/.bin/tsc --noEmit --skipLibCheck --allowImportingTsExtensions --module nodenext --moduleResolution nodenext --target es2023 packages/chronomancer/extensions/index.ts`. Human TUI checks (Home/pi-vim focus, resize, theme, date rollover and a real model call) remain necessary.
