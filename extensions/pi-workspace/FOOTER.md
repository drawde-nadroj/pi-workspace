# Customize your input box and footer

Implemented against Pi 1.3.0. After the room/compatibility refactor, prefer a fresh Pi process, then `/workspace`. `/reload` remains supported, but a running process can retain imported modules. Preferences now save to `pi-workspace.json`. Existing `pi-footer.json` settings are loaded when the new file is absent and are not modified by migration.

Use this as the control/reference guide for **Input, Tasks, Ask, Transcript, More settings and General**. For a guided first exercise, [try a reversible preview](../../docs/TRY-PREVIEW.md). For the purpose and persistence scope of every setting, consult [the settings reference](../../docs/SETTINGS-REVIEW.md).

## Start here

1. **Choose an element** from the list, or click its label in the preview in fullscreen mode. The list and preview select the same element.
2. Change **Visible**, **Position**, **Text color**, or its label. Your changes are temporary.
3. Choose **Save** to keep the changes, or **Discard** to return to the configuration from before you opened the editor. Discard asks for confirmation when there are unsaved changes.

The **Input & footer room** shows the actual native input editor and footer at full terminal width, not a fabricated sample. It covers the transcript while open, keeps the controls next to the preview, and does not replace the native editor instance or modify its draft, undo, Vim mode, paste storage, or completion state. Close settings to resume typing your draft.

`/workspace` also works when Workspace is off. The input is temporarily dressed as Composer for this workspace; closing restores the native appearance. Saving appearance settings does **not** silently enable Workspace. Saved input-border layouts apply when Composer is on.

### Controls

| Control | Action |
| --- | --- |
| Up / Down | Select an element, property or choice |
| Enter / Space | Open properties or change a control |
| **Rooms…** / Ctrl+R | Open all six destinations without editing preferences; narrow layouts show the selector instead of silently omitting tabs |
| Tab / Shift+Tab | Next / previous top section: Input, Tasks, Ask, Transcript, More settings, General; wraps in both directions |
| Enter or Right in Input elements; Left in Input properties | Open or return from the selected element’s properties |
| Left / Right in Tasks, Ask or Transcript | Move between its element list and settings; Enter on an element opens its controls |
| `/` | Find an element by name, including hidden elements |
| **Advanced settings** (Input, Tasks, More settings) | Reveal specialist controls without removing or resetting them |
| **Undo** / Ctrl+Z | Undo the last settings change; never changes draft undo |
| **Save** / Ctrl+S | Save accepted edits, never an unaccepted hover candidate |
| **Discard** | Restore the configuration from before opening |
| Esc | Cancel a field/menu, go back to Elements, then offer to discard |

Text fields use the native single-line input. Enter keeps the field edit in the preview; Esc cancels that field edit. **Save is separate.** Ctrl+S also accepts a valid open text field before saving. Invalid custom colors stay editable rather than being silently accepted.

The normal view exposes common properties first, under aligned **Part / Setting / Value** headings. Empty prefixes show **None**. More settings has view-only **All settings / Footer / Context / Git / Activity & time** groups; switching groups never resets an edit. The [complete settings review](../../docs/SETTINGS-REVIEW.md) covers every existing suite entry point. **More settings** retains footer style, colors and icons; open **Advanced settings** there for context format, Git detail, timing and timestamp format. Tasks shows controls for the selected part of the overview; its Advanced settings reveal motion detail, per-state overrides and additional colors. These expanders do not change saved values. **Icons** applies to the Workspace footer, the Composer input rails and sourced Sent labels in the chat/grouped-tool frames. Nerd mode uses the installed Nerd Font glyphs; Plain keeps `Sent` text and the directory path without a font-dependent glyph. Question labels belong to Ask and message Sent visibility/tool label treatment belong to Transcript; the old `questionLabels`, `messageTime` and `toolLabels` preferences remain read-only fallbacks until their respective sections are saved. Visibility, position and group order for the native input belong to each element rather than duplicate global switches. Transcript settings affect eligible chat/tool frames, not the native input preview.

Mouse selection is available in Pi fullscreen mode. When the host/terminal supplies pointer-move events, hovering an element, property or preview region temporarily identifies its target with **Inspecting**. It does not activate a control, move keyboard focus, change the selected element, create an Undo entry or save a value. In supported choice menus, hover also auditions the mode, color, position or spacing without accepting it. Arrows provide the equivalent keyboard preview; `✓` keeps marking the configured value. Enter accepts the keyboard option; click accepts the pointed option. Moving away restores the keyboard preview; Escape restores the prior appearance. Menu and Save coordinates remain stable when a preview changes height. Audition never adds an Undo entry, changes the real run/draft/model or opens another dialog. Leaving an inspection target restores selection; keyboard input, focus loss, resize, invalidation and closing clear inspection. Hover is static and starts no animation timer. Regular/scrollback mode remains keyboard-accessible; Workspace does not turn on mouse reporting there.

## Selection and focus

Selection has a steady, theme-accent tint. **`›` marks keyboard focus**; **`•` marks the selected element** when focus moves into its properties. The matching preview target remains highlighted in **all four rooms**, without replacing its actual text color or configured weight. Labels use an underline; perimeter selection highlights the real border gaps and side rails without tinting unrelated labels. The inspector identifies the selected target and its location. A status-specific frame-color control says **Affects: Input box border** and identifies the perimeter while Assistant status remains selected in the list. Body settings identify the affected overview rows; assistant-identity and successful-status controls highlight only the labels they can change, not the fixed user identity or failed status. Choice menus use **`✓` for the current value**, distinct from the option you are browsing. Unsaved changes remain a separate text indicator.

**More settings → Selection shimmer** defaults to **on**. Changing selection produces one 480 ms sweep across the highlight background, then settles. Selecting another element coordinates the list and preview; moving among properties animates only the focused control. Turning it off keeps the same steady selection and focus cues. Save persists this preference; Undo and Discard work normally.

This effect belongs only to `/workspace`, independently of agent-work motion. It does not change native Pi menus or pi-ask. It stops during text entry, Discard confirmation, focus loss, resize/theme invalidation, and closing or session teardown. It never moves letters, changes field widths, or alters the draft. Background colors adapt to light/dark and 256-color/truecolor output; terminal-specific palette overrides can still affect their appearance.

## Elements and positions

Elements include assistant status, chat title, latest recorded send time, directory, native Vim mode, model, thinking level, context usage, Git status and the next-step hint. The input box border has its own color inspector.

- Choose any of the six input-border positions: top/bottom × left/center/right.
- Or use left/center/right in either of the two existing footer rows.
- Multiple elements in one position form an ordered group. **Move earlier/later** changes their order; the group separator is configurable.
- Off removes an element from the preview but keeps it in the list.
- Missing data is not invented: Vim mode requires a Vim editor, Git requires a repository, send time requires a recorded message, and the next-step hint requires a sourced active task. The inspector explains hidden, unavailable or clipped targets. Tasks examples explain absent active rows and overflow hints; Transcript explains hidden Sent labels. Save failures and other action messages take precedence over availability help.
- Native scroll indicators always take priority. Narrow panes shorten lower-priority fields first. Long model names yield before the level.

At wide widths, the list and properties are side by side. At narrower widths they share a page, switched with Enter / Right and Left; Tab switches top sections. Undo sits with Save and Discard rather than among the section tabs. A selected control's explanation wraps near the controls instead of running off the edge. When top buttons do not fit, the current section number and name remain in the keyboard hint. Very short terminals shorten the preview vertically with an explicit label; below 12 rows they ask you to enlarge the terminal. Terminal **width** remains 1:1. No transcript fragments are visible behind the workspace.

## Text, colors and assistant states

**Prefix** adds wording without replacing the current model, title, path or time. **Advanced settings → Text format** exposes a literal template: `{value}` inserts the real value; everything else is text. Templates never evaluate code or commands. Control characters are removed.

Colors can follow the theme, match the frame, use a quieter frame shade, or use a named color. Named colors adapt to light/dark themes. **More color options** accepts `#RRGGBB`; custom colors are not automatically contrast-corrected, so check them against both themes.

To customize the completion label:

1. Select **Assistant status**.
2. Open **Preview state** and hover **Finished**, or browse with the arrow keys. Enter pins the demonstration.
3. Edit **Status text**, **Text color**, and optionally **State border color**.
4. Save, or Discard the experiment.

The default completion text is exactly **`your turn`**, without a period. The model area shows the level by itself, for example **`Model · high`**, without a `thinking` prefix. The separate live activity label can still say `Thinking`.

States include thinking, writing, working, tools running, waiting for an answer, finished, failed, stopped, interrupted and compacting. State-specific colors and emphasis inherit the normal appearance unless overridden. **Previewing: … · appearance only** is shown outside the input frame. Selecting a demonstration does not start work, create a question/message, advance a timer, or change session state. The demonstration itself is never saved.

## Persistent Tasks presentation

Open the **Tasks room** in this same workspace. Its element list names the border/motion, title, progress count, more-work hint, task rows and active row. At wide widths the list and existing controls appear side by side; at narrow widths use Left/Right to switch between them. Select an element from the list or click a **fully rendered** label or row in the display-only preview to jump to its relevant control. When a narrow rail omits a label, the element remains available in the keyboard list; there is no invisible click target. Arrow keys navigate, Enter edits, and Tab / Shift+Tab move forward / backward through the top sections. Enter on an Input element opens its properties without changing sections. Existing controls, including per-state settings, remain available by scrolling.

The preview is labelled as an example that makes no real task changes, with idle, working, waiting, done, blocked and error states. **Replay progress sweep** simulates a revision change without changing a real plan.

Controls cover border and highlight colors, shimmer/pulse, speed, intensity, direction, progress sweeps, label/body/active colors, gentle text-color effects, bold, six title/count/more-work rail positions, visible-task count and per-state overrides. Fresh Tasks settings use **Motion: Changes** and a **1200 ms** cycle: the active row has a steady tint and briefly brightens on a real focus/completion/cancellation-count change. Notes and evidence edits do not replay progress. Mounting, switching plans and restoring history do not replay an old change. **Work** retains the opt-in border effect; **Off** retains only steady emphasis. Existing saved choices are preserved. Global motion-off, lost focus, dialogs and hidden/narrow panels stop live motion; ordinary Composer typing does not. Frame supplies the controller, while Workspace owns the row treatment and shared clock. The explicitly labeled demo uses its own disposable controller and respects motion-off.

The rooms share Save/Discard/Undo in this existing workspace and are saved only under their established sections of `pi-workspace.json` (Tasks under `tasks`, Ask under `ask`, chat/tools under `transcript`). All four rooms share the new `pi-workspace.json` file after Save. The native draft and task/run state are unchanged by preview. Current live Tasks appearance is used again on closing; saving adopts the selected settings, discarding restores the original settings.

The Workspace overview shows active work, blockers and pending work with sourced done/total counts in the rail. Completed items no longer occupy the default body. Narrow rails use `✓ done/total`, `!blocked`, and `–cancelled`. `/tasks` retains the full plan/history browser; its legacy focus-window paging and appearance settings still apply to the independent no-Workspace fallback, not this overview. Tool acknowledgements and other frames are not restyled or animated by these controls.

## Question appearance (Ask)

Open **Ask** in `/workspace`. The **General** room edits your sent-message display name and the one Compact/Spaced density setting. Its explicitly synthetic message examples show the actual draft name and demonstrate spacing on hover or arrow navigation. The control is displayed as **Spacing**. Compact removes extra edge rows in supported user/assistant message frames; Spaced places one blank row above and one below their content. Thinking-first replies follow the same rule, and internal paragraph/code spacing remains content. General and Transcript message examples follow the same density. It also controls optional input/tool whitespace and the Ask shell's minimum-height fill, without changing content or Tasks row counts. Native/self-rendering tool bodies retain their owner-specific layouts. Select the question frame, title, sourced progress, question text, or action hints from the keyboard list or the **synthetic, display-only** preview. The sample does not open an answer dialog or send an answer. The title can be renamed (30 safe characters) or moved between upper-left and upper-center; progress can occupy one of the three lower positions and use the matched Pi accent or a quieter hierarchy treatment. Question text emphasis and hint tone are visual only. Ask’s theme-accent identity, actions, actual question wording, cursor, choice state and focus remain Ask-owned.

Ask validates its own version-1 `pi-workspace.json` → `ask` visual section and reads it **once when a new question opens**, even without Workspace. The legacy `questionLabels` setting is only a fallback before the Ask section is saved. An unknown future Ask section is read-only and blocks Save rather than silently replacing it. All rooms share the same `pi-workspace.json` transaction; changes in other Pi processes become visible on reload/new question. At narrow widths the list remains keyboard accessible when a preview label cannot fit.

## Chat and tool appearance (Transcript)

Open **Transcript** in `/workspace`. Fixed frame colors are shown as information, not editable controls. Select the chat border, identity, sourced **Sent** time, tool border, identity, or status in the element list or click a visible label in the **synthetic, display-only** preview. The examples do not send a message, call a tool, or record a time. User chat stays red and assistant chat stays accent purple. You can quiet the assistant identity label, show/hide a reliably recorded creation time and place `Sent` at lower-left or lower-right. The user identity and time remain red; missing or unsourced times never appear. A creation timestamp is not a reply-completion time.

Eligible ordinary cards, grouped-tool frames, and allowlisted web-tool frames can match or quiet their identity label. Successful status labels on ordinary and web cards can use semantic or rail-matched treatment; grouped child-call statuses stay semantic. **Failed, cancelled and child-error status still uses its semantic marker/color.** Unknown, graphical, self-rendering or unsupported tool shapes keep their native UI; settings do not change their results, expansion or mouse mapping. The preview samples show only representative frames, not an execution.

Workspace validates the version-1 `pi-workspace.json` → `transcript` section and reads it for live frames. The old `messageTime` and `toolLabels` preferences are fallbacks until the section is saved; they are not duplicate controls. An unknown future section is read-only and blocks Save instead of replacing it. Composer, Tasks, Ask and Transcript share **one atomic Save/Discard transaction for `pi-workspace.json`**, not independent per-room saves. Narrow windows retain a keyboard path even when a sample label or the Transcript tab cannot fit on the screen.

The current Transcript controls are deliberately bounded. A centralized catalogue for codemode, edit/write diffs, search results and extension-submitted messages is **proposed, not implemented**; see the [Transcript adapter direction](../../docs/SURFACE-WORKSPACE.md#proposed-transcript-catalogue). Unsupported/self-rendering tools still retain their native UI.

For API examples and a feature-request template, see [`pi-frame/FEATURE-GUIDE.md`](../../packages/pi-frame/FEATURE-GUIDE.md).

## Saving and compatibility

Preferences are saved atomically to `~/.pi/agent/pi-workspace.json`, or the configured Pi agent directory. The editor refuses to overwrite settings changed since this session loaded or since the workspace opened; reload to review external changes. This is an optimistic change check, not a cross-process lock for exactly simultaneous writes. Unsupported Composer appearance versions block editing rather than being replaced. No preference file is written until Save. A failed save restores the pre-preview configuration and reports the failure. Discard and Undo do not delete saved appearance or messages.

Other running sessions adopt saved changes after their next `/reload`. Existing scalar preferences remain supported. Opening the workspace derives a versioned `appearance` layout from their visibility choices; only saving persists it. Unknown or invalid individual appearance values fall back safely. Malformed or unreadable settings are reported and block opening/editing so Save cannot overwrite them. Repair the saved file outside the drawer and reload to review it; do not reset it merely to bypass an unknown-version warning.

Defaults remain an accent-purple input frame, centered chat title, directory at bottom-left, native Vim mode at bottom-center, and model plus level at bottom-right. The chat title has a static, softly tinted badge in its configured position. Its background adapts to the chosen foreground for readability without rewriting saved colors. Input-rail elements now honor their individual Bold text setting rather than forcing all metadata bold; fresh status/title/Vim defaults retain emphasis. Active task rows and question emphasis retain their own independent rules. The default Composer model label matches its purple frame, and the default Tasks progress summary/hint match its purple title. Saved custom label colors remain user-controlled in `/workspace`. Customizing the input border does not recolor assistant/Tasks frames. Context stays off in Composer unless enabled. Its value is real context capacity used, not task progress; unknown usage is `—`, not zero. Optional styles apply to fields in footer rows, not the input border.

The top-right send time uses the latest **recorded user-message timestamp**, not an input event or a guessed reply time. Before the first recorded send, a task-derived next-step hint can appear. Neither performs model calls or inserts/submits text. Chat frames retain their own fixed **Sent** creation times; assistant creation is not completion time. Grouped native tool calls repeat the issuing assistant's creation time, not a separate tool-execution time. All three Workspace surfaces use `sent-metadata.ts` for sourced time formatting and the Sent icon/label, while their own state supplies the timestamp. They display local hours, minutes and **seconds**, not milliseconds; older dates still include the date. Nerd mode shows an outgoing-envelope icon followed by the time; Plain shows `Sent` followed by the time. The Composer directory shows a folder icon followed by the path in Nerd mode, and the path alone in Plain mode. Existing custom text templates remain intact; a saved stock `Sent {value}` template drops the redundant word only in Nerd mode. Composer's `sentTime` element controls its placement/text; transcript `chatSent` controls chat and grouped-call visibility/placement. These are separate preferences, not a global Sent switch. User frame, identity and timestamp share their red.

### Missing chat title after an update

The default title belongs at the top center of the input frame. If it is enabled but absent in an older running session, run `/reload` after updating the integration. Workspace imports frame APIs through the checkout's `lib/frame.ts`, which resolves the established package root and imports the implementation files directly. It avoids both cached renderer code that ignored center labels and cached export metadata that could reject newer subpaths. This applies to default and saved/custom layouts, including the centered Vim mode. Names, visibility, positions and draft content are not rewritten.

If Workspace, Tasks and questions disappeared together after the earlier update, the reload diagnostics can show `Package subpath './primitives' is not defined by "exports"`. The corrected bootstrap no longer requires that subpath lookup. It was verified through failed reload → recovery in real Pi processes while the old export table remained in place. Reload each affected process after applying the correction; do not toggle or reset your preferences to compensate.

A deliberately hidden title or a pane too narrow for the center slot remains hidden. Check **Chat title → Show this element / Position** in `/workspace` if needed.

## Git legend

- ` main`: branch. Detached HEAD uses `@` plus a short commit ID.
- `+2`: two files have staged changes.
- `~3`: three files have unstaged changes.
- `?1`: one untracked file.
- `!1`: one conflicted file; warnings remain prominent when compact.
- `↑2 ↓1`: commits ahead/behind the locally known upstream.
- `✓`: clean working tree, not necessarily pushed.

These are file counts, not line counts; staged/unstaged counts can overlap. Zero counts are hidden. The picker also offers descriptive labels.

Git is read asynchronously, at most one request at a time, normally every ten seconds and after relevant events. Requests have a three-second timeout and two-MiB output cap. No fetch or other network request occurs. Non-repositories show no Git field; failed/oversized checks show `—` rather than stale or false clean state.

## Activity strip

Outside Composer, a separate activity strip appears after the compact work summary in the above-editor area. Composer starts with the minimal strip; the Full option restores optional sent/reply and total-active information without duplicating its top-rail run state. It does not create tasks or store timing in task data. When Workspace is off, it uses its own native widget. Settings can put it below the footer instead, or hide it.

Fields can be toggled individually:

- Outgoing-envelope outline icon (plain: `sent`): latest submitted user message time.
- Incoming-envelope outline icon (plain: `reply`): completion time of the latest successful text-only assistant reply. Tool-call messages and failed/aborted output do not update this field. It is not a guarantee that all automatic follow-up work has settled.
- `working`: agent-active time in the current run, including tools, retries and network waits, but excluding actual blocking prompts. Passive Tasks/posted-question browsing keeps independent work timing active while motion is still; blocking immediate questions pause it and display `waiting for you`.
- `last run`: previous completed agent-active run duration; failed/stopped runs are labeled accordingly. Older stored wall-clock run durations cannot be corrected and are not displayed as active time after reload.
- `total active`: cumulative tracked agent-operation time, including tools/network waits but excluding blocking user waits and idle time. Passive browsing is not a blocking wait. This is **not model compute time** or a lifetime total for pre-existing sessions.
- Optional `open`: wall time since this session was opened/reloaded.
- Optional `session age`: wall time since the session header's creation timestamp.

In the default Composer layout, run state appears **on the editor's top-left rail**, beside a fixed-width living-ember marker; the separate activity strip does not repeat it. The marker animates only during real work, including ordinary follow-up typing. Labels remain stationary. Current tool names follow state/time and are clipped before the state when space is limited. Narrow slots omit the large marker. Waiting, finished, failed and stopped runs use static marks; stopped runs say `Run stopped`. Settings previews show a static state marker and never run the ember timer. The element inspector can move the status to another supported position. Auto active-time display hides the cumulative total during work and at idle when it adds no useful distinction from the last run. `≥` still marks incomplete totals.

Choose local 24-hour, 12-hour, or relative timestamps for footer activity. Chat creation times and the composer last-sent time always remain fixed absolute times (12-hour if selected, otherwise 24-hour). Older absolute timestamps include the date. Unknown times use `—` in activity and are omitted from message/composer frames.

Timing is stored in non-context custom session entries and follows the active branch. Wall-clock session age/open time remains distinct from agent-active run time. It begins with events after loading this feature. Old assistant message timestamps cannot reliably establish completion times, so they are not used to invent response times. Interrupted runs are not extrapolated across downtime; cumulative active time is marked `≥` when a gap exists. A crash may lose time since the last recorded checkpoint.

The strip uses up to two rows in narrow panes. Hide less useful fields when working in a very small terminal.

## Verification

```sh
# From the suite repository root, with dependencies and a compatible Pi host installed:
npm run test:workspace && npm run test:tasks
```

Tests use the installed Pi host packages, synthetic UI events, isolated preference directories, and real temporary Git repositories. They cover mouse/keyboard selection, transactional preview, save failure, restore, width limits, theme variants, timing gaps, status preservation, Workspace/Tasks startup order, and cleanup. They do not establish how every Nerd Font glyph will look in your terminal. Review spacing after `/reload`.
