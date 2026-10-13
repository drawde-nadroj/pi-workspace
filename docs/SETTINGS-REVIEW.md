# Settings review: intent, demonstration and scope

Reference for the **current suite-owned settings**, their preview behavior and persistence scope. Use it to look up a control; for steps, read [workspace controls](../extensions/pi-workspace/FOOTER.md), and for an exercise, [try a reversible preview](TRY-PREVIEW.md). It does not replace Pi's native settings, third-party editors or tool-owned self-renderers.

## Preference authorities

Files live in the configured Pi agent directory (default `~/.pi/agent`), not in the source checkout.

| Authority | Owns | When it changes |
| --- | --- | --- |
| `pi-workspace.json` | Input/footer, Tasks overview, Ask shell, eligible Transcript visuals, General name/density | One workspace Save; Undo/Discard/audition do not write it |
| `pi-footer.json` | Legacy visual fallback only when workspace settings are absent | Read-only fallback; first workspace Save writes the new file |
| `pi-composer.json` | Composer enablement, work motion, header icons, runtime palette and work-summary preferences; read-only `pi-home.json` fallback if absent | `/composer` controls save immediately, separately |
| `pi-tasks.json` | Tasks enablement/hidden state and independent fallback appearance | Tasks companion controls save separately |
| `pi-recaps.json` | Explicit recap enablement | `/recaps` or Workspace's owner-native recap picker saves immediately; not workspace Save |
| Active session branch entries | Plans, accepted requests, posted questions/responses and recorded run facts | Owner-controlled domain mutations; appearance previews do not write these facts |

An atomic workspace Save is not an atomic transaction across these authorities. Unreadable/unsupported visual settings fail closed; see [saving and compatibility](../extensions/pi-workspace/FOOTER.md#saving-and-compatibility).

## Decisions

- Show **Part / Setting / Value**, with aligned value columns, one-cell interior breathing room, a bounded reading measure and explicit `None` for empty prefixes. Short display names do not change persisted values or internal control identities.
- Keep common controls first. Input/Tasks retain Advanced settings; More settings adds view-only **Footer / Context / Git / Activity & time / All settings** groups. Filtering never edits a preference or loses a control.
- Hovering a part or control identifies its affected region and explanation. Where a menu offers safe appearance candidates, hover and keyboard navigation **audition** a cloned visual configuration, not an accepted edit. Moving away returns to the keyboard preview; the current-value option restores the configured appearance exactly. Escape restores the prior configuration/demonstration.
- `✓` remains the configured value; `›` remains keyboard focus. Hover does not move either. Click accepts the pointed option; Enter accepts the keyboard option. Only accepted preference edits create Undo entries; Save never commits an unaccepted hovered candidate.
- Keep menu coordinates stable when a candidate changes preview height. Shorten and label the example rather than moving Save or another option under the pointer. Resize deliberately recomputes geometry and clears audition.
- State demonstrations are synthetic, static while the menu is open, and never start a run, question or clock. Hover starts no selection-animation timer. Blur, resize, invalidation, cancellation and disposal restore audition.
- General shows representative **sample messages** for the actual name and spacing preferences. In supported user/assistant frames, Compact has no extra edge rows and Spaced has one row above and below content; General and Transcript samples use that same rule. Input retains the real native draft preview. Ask and Transcript retain owner-specific samples. No sample is submitted or persisted.

## Input: every part

| Part | Intent and demonstration | Boundary |
| --- | --- | --- |
| Assistant status | Real state; hover Preview state options to see each state's label/style | Appearance only; real phase/duration stay unchanged |
| Chat title | Current chat name in its actual slot | Not a chat rename control |
| Sent time | Latest recorded user send, with real date/time format | Missing times stay hidden; not a live clock |
| Directory | Full path/folder name from the real directory | Does not change working directory |
| Vim mode | Actual installed editor mode | No mode is fabricated without Vim |
| Model name | Real model's display label | Does not select a model |
| Thinking level | Real selected level | Does not change model reasoning |
| Context usage | Real capacity used; enable/format via its controls | Unknown is —, not invented usage |
| Git status | Real local state and counts | No network fetch; hidden outside repositories |
| Next-step hint | Sourced active-task hint | No task creation, command insertion or execution |
| Input box border | Real input perimeter | Native scroll hints and input behavior retain priority |

## Input: every control

| Control (display wording where shortened) | Demonstration / reason for the control |
| --- | --- |
| Visible | Hide/show the part; its other settings remain available |
| Position | Hover rail/footer candidates at the real terminal width |
| Preview state | Hover all available assistant modes; Enter pins a demonstration, not a preference |
| Text color | Hover theme/named colors; preserve the real value and source |
| Prefix | Show `None` when empty; literal text before the real value |
| Status text | Wording for the pinned state only |
| State border color | Identify and audition the perimeter, not the status label |
| Frame color | Base border or pinned-state override; Use default inherits |
| Advanced settings | View-only disclosure, not a saved appearance value |
| Bold text | Static emphasis; no color or wording change |
| Earlier in group | Move within the existing slot, not to another slot |
| Later in group | Same-slot ordering; endpoint explains why it cannot move |
| Narrow-screen priority | Determines which part yields first; only visible when space is constrained |
| Text format | `{value}` inserts sourced data; all other text is literal |
| Group separator | One shared separator for parts in the same position |
| Custom color | Explicit entry only; hover never opens the input or applies invalid hex |

## Tasks: every control

These controls style Workspace's overview, not the stored plan or standalone fallback. Advanced controls remain filtered to the selected part.

| Control | Intention / safe demonstration |
| --- | --- |
| Preview state | Synthetic idle/working/waiting/done/blocked/error example; hover stays static |
| Replay progress sweep | Explicit one-shot sample revision; respects motion-off |
| Motion | Work, progress changes or off; menu pauses the effect |
| Border effect | Travelling shimmer versus in-place pulse; text stays still |
| Cycle time | Seconds per circuit/pulse, not raw milliseconds in the value display |
| Highlight strength | Blend amount, displayed as a percentage where applicable |
| Direction | Shimmer direction; pulse does not travel |
| Progress sweep | New recorded changes only, not restored history |
| Border color | Frame perimeter candidate |
| Highlight color | Moving highlight's paint; no idle hover loop |
| Title color | Overview title, not a task title |
| Count color | Recorded progress labels, not completion semantics |
| Body text color | Overview rows; authored task data unchanged |
| Active task color | Tasks-sourced active row, not inferred activity |
| Text effect | Optional label/active color motion; safety gates still win |
| Bold title | Static label emphasis |
| Bold active task | Static emphasis of the sourced active row |
| Title position | Any supported rail; hover identifies actual placement |
| Count position | Supported rails; exact counts stay sourced |
| Overflow hint position | Route/count for work that does not fit |
| Panel title | Overview display label; no plan rename |
| Visible tasks | 1–5 rows; stored plan order does not change |
| Motion when [state] | State override or default; global off still wins |
| Border when [state] | State-specific perimeter color |
| Text when [state] | State-specific body color |
| Active text when [state] | State-specific active-row color |
| Title when [state] | State-specific title color |
| Counts when [state] | State-specific count color |
| Highlight when [state] | State-specific highlight color |
| Reset [state] overrides | Explicit reset with Undo; blocked/error defaults retain warnings/errors |
| Advanced settings | Disclosure only; hiding keeps accepted changes |

## Ask and Transcript: every control

| Room / control | Intention and demonstration | Safety boundary |
| --- | --- | --- |
| Ask: Frame color (fixed) | Information and hover help, not an inert setting | Pi accent stays authoritative |
| Ask: Title text | Bounded shell label | Question wording unchanged |
| Ask: Title position | Hover upper-rail positions | Ask collision rules |
| Ask: Progress position | Hover lower-rail positions | Batch position remains sourced |
| Ask: Progress color | Match title or quiet hierarchy | No changed answer semantics |
| Ask: Text weight | Bold/normal sample | No wording rewrite |
| Ask: Hint tone | Dim/muted sample keys | Actions and keybindings unchanged |
| Transcript: Frame colors (fixed) | Explain role/status identity | User red, assistant purple; tool outcomes distinct |
| Transcript: Assistant name color | Match/quiet assistant label | User identity stays red |
| Transcript: Show Sent time | Show reliably sourced creation times | Missing times never appear |
| Transcript: Sent position | Hover supported lower-rail positions | Creation is not completion |
| Transcript: Tool identity | Match/quiet eligible name labels | Self-renderers remain native |
| Transcript: Success label color | Semantic/matched successful label sample | Failure/cancellation/child-error foreground and words remain fixed |

## More settings: every retained scalar

| Group / control | Intention and demonstration |
| --- | --- |
| Footer: Selection shimmer | Brief keyboard selection cue; hover remains static |
| Footer: Style preset | Footer-row treatment, not the input border; empty rows explain the limit |
| Footer: Accent color | Footer palette; semantic warnings remain distinct |
| Footer: Icons | Nerd Font/plain metadata and Sent labels; does not require special fonts in Plain |
| Footer: Directory | Full path/folder/hidden from real cwd |
| Footer: Footer motion | Real-work effects or off; settings suspend motion |
| Context: Context usage | Actual capacity, counts/percent/automatic/off; thresholds 75%/90% |
| Context: Context bar | Blocks/dots/thin for Classic; other treatments own their rails |
| Context: Context shape | Pill/background versus open rail |
| Context: Animated treatment | Existing treatment choices; no fabricated usage or idle loop |
| Git: Git detail | Detailed/count/simple/off, local facts only |
| Git: Git notation | Compact symbols or explicit file-count words |
| Activity: Timing placement | Strip/footer/hidden; no task data changes |
| Activity: Last message sent | Actual submission time, not commands |
| Activity: Last text reply | Successful text-only completion; failures/tool-only replies excluded |
| Activity: Working / last run | Active time including tools/network waits, excluding answer dialogs |
| Activity: Active time | Tracked cumulative active time; Auto avoids repetition; ≥ means missing history |
| Activity: Elapsed time | Open/reload age or session-header age; not work time |
| Activity: Timestamp format | Local 24h/12h/relative activity; message/input creation times remain absolute |
| Activity: Composer activity strip | Minimal/full disclosure of existing optional fields |
| Settings group | Navigation-only filter across the complete inventory |
| Advanced settings | Navigation-only disclosure; no reset |

Removed duplicate controls remain compatible read fallbacks: density maps to General; session/model/thinking and rail visibility map to Input parts; row-order/layout choices map to explicit placement/order; old questionLabels/messageTime/toolLabels map to Ask/Transcript. There is no second live switch for the same field.

## General and companion entry points

| Entry / setting | Decision |
| --- | --- |
| General: Your name | Sample user frame shows the edited name, without changing an account or sending a message |
| General: Spacing | Hover representative compact/spaced sample messages; affects supported integrated whitespace, not Task row counts |
| `/composer`: Work motion | Native selector retained; wording distinguishes animation from live timing |
| `/composer`: Header icons | Explicitly distinguishes Workspace's header/fallback icons from workspace metadata icons |
| `/composer`: Matching palette | Reversible runtime lease; off restores preceding colors |
| `/composer`: Work summary | Compact/expanded sourced overview; not task execution |
| `/composer`: Activity recaps / `/recaps` | Off by default; explicit enable/disclosure of additional bounded OAuth inference. Immediate separate `pi-recaps.json` authority, cancellation on off, not workspace Save |
| `/composer`: On/off | Explicit shell enablement; other suite owners remain independent |
| `/composer output raw/readable` | Session-only expanded output, not persisted appearance |
| `/tasks view focus/compact` | Completion discovery + explicit notification: standalone fallback, saved immediately, plan unchanged |
| `/tasks hide/unhide` | Dock visibility only, persisted separately |
| `/tasks on/off` | Tracking enablement, not cancelling agent work or deleting plans |
| Ask `/questions` / F2 | Answer/navigation actions, not an appearance editor; semantics retained |
| Pi native / third-party settings | Retain owner-native controls; no interception or claim of a shared Save/hover contract |

`/workspace` shares one Save/Undo/Discard transaction for `pi-workspace.json`; companion Workspace and Tasks preferences save separately and immediately. This is not an atomic Save across files. Unknown Tasks section/presentation versions now fail before normalization, avoiding a silent downgrade; unknown Ask/Transcript values retain their existing read-only/Save-blocking behavior. The broad Transcript catalogue remains proposed.

## Narrow navigation and collaboration contracts

All six rooms remain accessible through **Rooms…** / **Ctrl+R** when the full strip does not fit. Tab/Shift+Tab still cycles rooms; navigating or hovering does not enter Undo or change accepted preferences. Session question scope, linked-work context, response-kind labels and correction guidance belong to Tasks/Ask, not appearance controls. Passive browsing keeps independent work timing active while motion remains still.

## Verification scope

See [ACCEPTANCE.md](ACCEPTANCE.md) for fresh test/type/isolated-terminal evidence. Automated and injected-pointer checks do not certify physical mouse behavior, font/IME, visual motion perception, accessibility or timed novice/expert usability. Host fullscreen hover reporting is required; some multiplexers disable free pointer motion. Keyboard audition is complete without mouse reporting.
