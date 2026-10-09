# pi-home

A personal appearance extension for pi **1.0.0**, built around the native editor rather than a replacement text engine. Composer uses the locally installed `pi-embeddable-frame` package; it adds no network calls or model changes. Biolume now includes a reversible **runtime interface palette**; it does not overwrite pi's saved theme setting.

## Unified layout and footer settings (Pi 1.0.0)

Run `/reload`, then **`/footer`** to **Customize your workspace**. Select an element from the list or its label in the full-width native preview; edit visibility, position, text, colors and state-specific appearance. **Save** keeps the configuration; **Discard** restores it; **Undo** reverses the last settings change. The input and footer appear in one connected workspace even when Home is off (a temporary Composer view, not a saved look change). The native editor instance and unsent draft stay intact. Disabled fields stay absent, and state demonstrations are explicitly labeled outside the frame. **Other options** retains footer/timing, message-time, tool-label and question-label controls; pi-ask reads its saved preference on the next question. These global preferences use `pi-footer.json`, separate from Home look preferences. See **[FOOTER.md](FOOTER.md)** for the beginner guide, keyboard controls, compatibility and limits.

The footer stays enabled with `/home off`. Composer puts the session title in its top rail, directory and model in its bottom rail, and does not duplicate those fields in the footer when the rail options are on. Other Home looks retain their existing layouts.

## Approved live composer

**`/home composer`** selects the approved native design; the user default is saved in `pi-home.json`. Run **`/reload`** to load the implementation into an existing session.

- Rounded, consistently joined native multiline editor frame on the terminal’s own background, with real undo, paste, cursor/IME placement, completion and mouse behavior. With pi-vim installed, Composer decorates its existing editor instance rather than competing for the editor factory; either load order works. Vim modes, registers and undo remain owned by pi-vim.
- **Atomic repaints:** new transcript components are decorated before native traversal. Cursor hide, frame updates, and final native cursor positioning share one synchronized terminal update, including in regular/scrollback mode. Ordinary frames use one write; large paints remain bounded and preserve Unicode. The guard restores terminal methods on errors, emits nothing for stopped/no-output paints, and is removed on Home uninstall/shutdown. Tests cover real Vim caret coordinates during animation, resize, question replacement/restoration, and both native renderers. Physical flicker still requires checking in your terminal; synchronized-output support varies.
- Working, thinking, writing, waiting, error/stopped, and persistent **your turn** appear on the composer's top-left rail, below Tasks. Pi’s default working display is hidden while Home is enabled. The session title stays centered at practical widths (shortening first at mid-width); only very narrow panes or essential native scroll hints can suppress it to preserve status and the editor.
- Real tool/message/dialog events drive status. Individual tool results stay in the transcript, not a persistent composer warning. Overall failed/stopped runs retain explicit status; a finished run does not complete Tasks.
- The session name occupies the top-center rail. A **recorded last user-send time** appears in user-message red at top-right, replacing the optional next-step hint once a user message exists; native scroll hints take priority. It is a fixed local time, not a ticking age or guessed reply time. The bottom rail holds the directory at left, native Vim mode (when present) in the center, and **model · level** at right (for example, `Model · high`, without a `thinking` prefix). Long model names yield before the thinking level. Context usage is off by default in Composer but can be shown through `/footer`; other looks retain their existing context controls.
- Compact work summary above the input; `/home details on` expands it, `/home details off` collapses it, and `/tasks` opens task controls. Blocked/error work stays prominent.
- Adjacent native text calls (`read`, `write`, `grep`, `find`, `ls`) from one assistant message share one Composer transcript frame when its call IDs and creation timestamp are available. **Sent** denotes that assistant message's creation time, not tool completion or separate call times. Each eligible call shows one status-marked tool/target line instead of a duplicate status and call line; ordinary returns omit the word “returned,” while running, failed and cancelled remain labeled. Each original component still receives its own results and expansion; narrow views, graphical results, self-renderers, shell closures, tasks, and questions stay native. The group follows the message-time display preference.
- The default Composer activity strip omits sent/reply and last-run clutter; `/footer` can restore the full strip. Framed user and assistant messages show **Sent** plus the message's fixed, recorded **creation time** at bottom-right. User frame, identity label and timestamp share the same red. Synthetic or unsourced user messages show no invented time; an assistant creation time is not a reply-completion time. Relative activity times do not turn a message timestamp into an updating clock.
- Motion follows work, not ownership of a particular editor. Composer motion becomes quieter while typing and stops for dialogs; `/home motion off` disables it. The status label remains stable as light travels around the frame; no idle spinner or predicted progress is added. Footer motion controls footer effects only.
- The matching runtime palette is reversible with `/home off` or `/home theme off`. Older Home looks remain selectable. The forest is not rendered in Composer.

The installed **pi-ask** package presents questions in an orange **Questions** panel on the terminal background that temporarily **replaces the input area**, not an overlay. There is no second draft box behind it. Closing restores the existing draft. Composer treats the native unchanged-draft restoration as a no-op so Vim undo, repeat state and cursor are not reset. It uses the same public theme roles, but remains independent of Home. Existing selection, notes, custom answers, multiline input, `@` completion, skip, clarification and final review semantics are preserved. There is no idle question animation loop.

### Spacing and light

- **Breathing room:** one blank row inside each edge of the input, plus separation from activity and footer. This padding applies at 44+ columns and 34+ terminal rows; smaller panes stay compact.
- **Consistent message frame:** rounded corners with matching thin horizontal/vertical strokes. Strong color and moving light provide emphasis rather than mismatched heavy segments. Final rasterization still depends on the terminal/font; these are cell graphics, not a pixel overlay.
- **No panel fills:** input, composer, questions, user messages and tool panels use the real terminal background. Native cursor, selection and search highlighting remain functional.
- **Pi accent frame by default:** Composer, assistant transcript frames and Tasks share the active Pi accent purple (light and dark variants). `/footer` can customize the input frame and its per-state colors without changing other frames. Pi's selected thinking level is spelled out beside the model, not encoded as a border hue. Failure remains explicit in the status label without replacing the purple frame. Theme-level accent changes are honored.
- **Traveling light:** a brighter lavender head and fading trail travel clockwise around the complete input frame—top, sides and bottom—during real work, blending from the Pi accent. Typing reduces intensity; dialogs and motion-off stop it. It never fills a progress track or predicts completion.
- **Your sent messages:** static pastel-red rounded outlines labeled jordan distinguish native user messages in the transcript. Their interiors retain the terminal background. A reversible instance adapter uses the exported UserMessageComponent and public component tree; it does not edit messages, duplicate them, change Pi core, or patch global prototypes. Tiny widths and embedded terminal graphics fall back to native rendering. Turning Home off, switching looks, or shutdown removes the adapter.
- **Agent output:** native assistant messages use the same Pi accent purple rounded outline as Composer and Tasks, titled with the currently selected model name (not historical model attribution). During actual streamed thinking, that frame can carry a moving perimeter light; settled messages are still. Streaming text, Markdown, errors and native thinking toggles remain intact. Empty/tool-call-only messages get no box. The outline shares the user-message adapter’s transparent background, narrow-width/graphics fallback and reversible cleanup.
- **Tool-first cards:** compact cards show the tool, target, lifecycle and at most two ordinary summary rows. Read/Write use line counts, Edit uses supplied diff counts, shells use short log tails, and Codemode uses child/output counts with explicit problems. Expansion shows readable code, diffs, JSON/JSONL trees and multiline text—not escaped payloads. Successful borders and child text stay neutral; state symbols retain color. A separate **Raw payload** link and `/home output raw|readable` command preserve inspection access. Click a compact card to expand and its heading to collapse; Ctrl+O retains native expansion. Errors, truncation and search limits remain visible. Native custom interfaces/images have guarded fallbacks. No classifier, network call or CLI runs during rendering. See [ACTIVITY-BLOCKS.md](ACTIVITY-BLOCKS.md) for the tool matrix, controls, limits and verification.
- **Coordinated transitions:** the perimeter light follows the real run clock. A normally settled run fades from lighter lavender to the resting accent over 800 ms; an overall failed run retains an explicit error label without changing the purple border. A recoverable individual tool error does not freeze the border or latch a warning. Brief transitions render at up to 25 fps; ongoing work at about 10 fps. These effects follow run state, not task progress or correctness. Questions remain still and immediately interactive.

**Shared frame dependency:** `~/.pi/agent/packages/pi-frame` exports optional left/center/right labels on both rails, colors, a pure customizable `statusPreset()` marker/color/label mapping and opt-in motion; it does not install a global UI override. Pi-specific tool state classification remains in Home. Home uses the package for Composer, native message frames and tool-card rails. `pi-ask` uses it for the question shell, clarification input and the embedded **Something else…** editor. The separate Home adapter for the default `pi-web-access` tools `web_search`, `fetch_content` and `get_search_content` frames their existing renderer components without modifying the npm package. Self-rendering tools, images, unknown component shapes, narrow terminals and renamed web tools fall back to native presentation. This adapter uses guarded Pi 1.0 component internals and should be rechecked after Pi upgrades.

The base is still Pi’s transcript and native input system, not a separate messaging client. No second terminal renderer or background model calls were added.

## Whole-composer prototype

Run **`/composer-preview`** after `/reload` to compare simulated typing, working, tools, waiting, finished, and error states in a native overlay. It includes a local test input, three motion treatments, and a narrow-pane comparison. Nothing is sent or saved; the real draft and settings stay unchanged. See **[COMPOSER-PREVIEW.md](COMPOSER-PREVIEW.md)** for controls and limits.

## Start

This directory is auto-discovered at `~/.pi/agent/extensions/pi-home/`.

Run `/reload` in an existing session, or start pi normally. The default is **Biolume**, **work-only motion**, and **Nerd Font icons**. Existing saved preferences are respected; `/home biolume` selects the forest shell.

Run `/home` to open the appearance picker. Presets reuse the same editor instance, preserving cursor position, undo, completion state, and stored pastes while you compare them.

| Command | Effect |
| --- | --- |
| `/home lab` | Open the live design lab; starts in Glasshouse, then remembers your shortlist until reload |
| `/home lab glasshouse` | Preview the botanical/Prism hybrid with three lighting moods |
| `/home lab glasshouse sunlit` | Start with a particular lighting mood (`biolume`, `kaleido`, or `sunlit`) |
| `/home lab prism` | Open an original prototype (`terrarium` and `arcade` also work) |
| `/home biolume` | Evergreen forest, pastel fireflies and cat, sage/lavender editor frame, optional plugin dock |
| `/home scene off` | Collapse the forest artwork without hiding session identity or tasks (`scene on` restores it) |
| `/home theme off` | Restore preceding interface colors while keeping the forest workspace (`theme on` reapplies the matching palette) |
| `/home gaze both` | Cat follows the most recently used mouse pointer or typing cursor (default) |
| `/home gaze mouse` | Follow only free mouse movement in fullscreen mode |
| `/home gaze typing` | Follow only the native text caret, including arrow-key navigation |
| `/home gaze off` | Disable cursor tracking without hiding the cat or changing forest motion |
| `/home hearth` | Warm amber accents, rounded box, roomier input, breathing activity dot |
| `/home studio` | Compact square box, current theme's accent, braille activity spinner |
| `/home orbit` | Cool lavender accents, rounded box, star glyph and a short travelling border highlight |
| `/home motion work` | Decorative animation only during work and a brief settling transition |
| `/home motion ambient` | Also animates the forest/fireflies or small preset indicator while idle |
| `/home motion off` | No pi-home decorative animation; timing readouts still update |
| `/home icons nerd` | Nerd Font home, folder, branch, and clock glyphs |
| `/home icons plain` | Ordinary Unicode/text alternatives; no Nerd Font required |
| `/home off` | Restore preceding interface colors, pi's default header, and the preceding editor factory; keep the independent configurable footer/activity strip |
| `/home on` | Re-enable your last chosen appearance |

Look, scene visibility, matching interface theme, gaze, motion, icons, and enabled state are independent and saved atomically in **`~/.pi/agent/pi-home.json`** (or the configured pi agent directory). That file is created when you change a preference. The main `settings.json` is untouched.

## Everyday Biolume and optional Tasks

`/home biolume` now applies the approved evergreen direction to the actual workspace. Its scene follows real thinking/tool/input/idle/error states, never the lab timeline. The session name and activity share the top edge of **one continuous workspace**. The forest, checklist, native input and footer share aligned insets and pine surfaces. The approved cat is reused intact, including its face, body and paws—not replaced with a reduced sprite. The artwork has six rows and yields entirely below 48 columns or 34 terminal rows instead of cropping the cat. `/home scene off` explicitly collapses it. Response/idle timing remains in the footer.

The visible Tasks dock uses a purple frame matching the assistant message frame (and the `tasks` tool's call/result frames), while preserving semantic row colors and its existing hide/closed-plan lifecycle. Short open checklists retain all their items, including completed steps. Up to five items fit in the normal dock; longer plans show an exact `+ N more · /tasks` row. Smaller panes reduce the limit, but a three-task plan stays fully visible. The heading uses the **current plan's name**, without zero-progress/command clutter. Once every task is done or cancelled, a four-second acknowledgment replaces the checklist, then the entire dock disappears. The plan remains in `/tasks history`; nothing is deleted. Tool results show committed state, and individual updates do not reprint the entire plan.

Biolume's matching interface palette covers native message/tool cards, markdown, diffs, syntax, menus and status colors. `/home theme off`, another Home preset, or `/home off` restores the preceding colors. A later manual theme choice is respected. Pi 0.99.1 resets themes after `/reload`'s session-start event; Home repairs that **one startup reset**, not later user choices.

**API limits:** pi has no public root/assistant-transcript background role. Unfilled transcript space retains the terminal's background; Home does not change the terminal profile or send terminal-palette escape commands. The public theme-instance API restores colors, but not an earlier adaptive/system-theme controller's automatic following. After disabling Home's palette, reselect that adaptive theme in `/settings` or `/reload` to restore automatic following.

Tasks is a **separate extension**, installed at `~/.pi/agent/extensions/pi-tasks/`. It publishes the current plan to Home's optional dock. `/tasks` opens a raised, opaque panel with a distinct border and selection fill. `/tasks history` browses earlier plans without changing the current one; `/tasks new <name>` starts a separate plan without replacing earlier work. Archive/Restore are reversible, explicit actions. `/tasks off` removes the task tool, fresh reminders and task UI **without changing Home**; `/tasks on` retains the whole saved library. Conversely, `/home off` leaves Tasks operational through its native-text fallback.

Task plans are per-session/branch, with lightweight context reminders and **no automatic continuation**. Home does not create or control them. The forest remains useful with no Tasks extension installed. See [the Tasks README](../pi-tasks/README.md), [DOCK.md](DOCK.md), and [TODO-RESEARCH.md](TODO-RESEARCH.md).

## Cat gaze

Biolume's original cat watches the most recently used input. Move the mouse and it looks toward the pointer; type or move the text caret and it watches that instead. Only the two eyes move, by at most one art pixel per axis. They now ease between positions through subtly shaded intermediate pixels, rather than snapping between nine poses. A critically damped transition preserves position and velocity when the target changes, with no deliberate input dwell. Small dead zones stabilize the destination without delaying movement. Settled eyes return to the original crisp pixels; the silhouette, mouth, ears, paws, blinking behavior, and layout remain unchanged.

Tracking eases back to the normal expression after roughly five seconds without input, or when the draft is submitted/cleared. It pauses for blocking dialogs and focus loss. Gaze is **reactive**, so it works while idle in `motion work`; `/home motion off` disables it as well as decorative motion. `/home gaze off` disables gaze alone.

- **Fullscreen:** free mouse movement follows terminal-cell coordinates. It does not capture drags, clicks, wheel events, or selection.
- **Regular/scrollback mode:** `both` falls back to the typing cursor. Home does not enable application mouse reporting in regular mode.
- **Multiplexers/terminal support:** pi deliberately disables free-hover reports under tmux, screen and Zellij. Caret tracking still works; Home does not override terminal/multiplexer mouse settings.
- **Privacy/lifecycle:** the fullscreen pointer observer is passive, bounded and session-scoped. It discards ordinary key input, paste content and protocol strings; it retains only ephemeral cursor coordinates and timestamps. It does not log input, query the desktop pointer, or request OS accessibility access. It detaches when gaze, motion, the scene or Home is disabled and on reload/shutdown.

## Live design lab

Run `/home lab` after `/reload`. This is a **preview**, not a replacement for your current appearance. It simulates thinking → tools → waiting for you → responding → completion → idle, with example task/activity panels and a sample composer. It does not call a model, create tasks, submit prompts, modify your draft, or save a theme preference.

- **Prism:** charcoal surfaces, a custom orbital pi sigil, a gradient scanner, and an illuminated input rail.
- **Terrarium:** a pixel cat, a plant, a night-desk surface, blinking/sleeping/waiting states, and a short completion flourish.
- **Arcade Studio:** a moving block HOME wordmark, segmented activity, mission-board cards, and a command deck.
- **Glasshouse:** animated pastel light and a pixel cat in a living scene. Bioluminescent uses wandering fireflies in a miniature evergreen forest; the other two moods retain the original leafy garden and orbital animation. The cat looks toward the light, raises a paw at a passing sparkle, waits for you, and sleeps when the demo settles. Foliage sways slowly; the palettes also cover panels, task rows, and the composer.

### Glasshouse lighting

One workspace composition, three moods. Press **G** to cycle:

1. **Bioluminescent** — an evergreen forest: layered conifers, ferny understory, moss, and tiny pastel mushroom caps. Deep pine-green surfaces, sage foliage, lavender/blush/mint/butter/apricot light, and a warm pastel cat. Around π, a few independent fireflies follow smooth, uneven paths, hover, and softly brighten/fade. There are no orbital rings, diamonds, trails, or completion starbursts in this mood. Trees, cat, palette, layout, and logo position are unchanged.
2. **Kaleidoscopic** — plum surfaces, a broader spectrum, and an extra, petal-shaped orbital pattern.
3. **Sunlit** — cream, soft greens, coral, lavender, and yellow-green leaves.

These are contained preview palettes: Sunlit does not change pi's global theme. Lighting changes preserve the timeline, pause state, and task progress. **Space → G → G** compares the same moment across all three moods. Enter shortlists the direction **and** its lighting in memory only.

Controls:

| Key | Action |
| --- | --- |
| `1` / `2` / `3` / `4`, Left / Right, or Tab | Change direction; timeline is preserved for comparison |
| `G` | Cycle Glasshouse lighting; from another design, jump into Glasshouse |
| `R` | Replay from the beginning |
| `S` | Jump to the next demo state |
| Space | Freeze/resume the entire preview; useful for comparing layouts |
| `M` | Toggle decorative motion (the demo clock continues) |
| `E` | Toggle a sample error state |
| Enter | Shortlist this direction and close; **does not apply it** |
| Escape / Ctrl+C | Close without selecting |

The tabs also support clicks in fullscreen mode. Approximately **90 columns × 38 rows** gives a good view of the full garden; smaller panes simplify the layout. The originals remain capped at 32 preview rows, Glasshouse at 36. The lab uses Unicode/half-block drawing through pi's renderer, so no image protocol or extra dependency is needed. Its explicit preview motion is separate from your saved shell motion setting.

Its sample clock is deliberately labeled **demo**. Your real response clock is unchanged. Your actual session name and working directory appear in the preview.

See [DESIGN.md](DESIGN.md) for the direction of the shared design system. The primitives in `lab/design.ts` remain internal drawing utilities, not a finalized general component API. The real task plugin uses the separate, versioned [dock protocol](DOCK.md).

### Evergreen preview

Run `/home lab glasshouse biolume` to jump straight to the refined forest. This is still an isolated preview, distinct from `/home biolume`, which applies the production shell. No fourth lighting mood or extra dependency was added.

Key colors: background `#101c17`, panels `#192e23`, input `#223b2c`, lavender `#c7bde7`, blush `#e4bdd1`, sage `#bdd7b4`, mint `#b6dcd0`, apricot `#ead0b8`. Text remains warm off-white, not low-contrast pastel-on-pastel. Tests verify primary text/status contrast across these surfaces and the low-chroma pastel gradient.

## Layout

- A small, preset-specific welcome header.
- A persistent **session identity**, integrated into Biolume's top frame and updated on rename. Use pi's `/name Your name` command; unnamed sessions show `Untitled session`.
- A framed native editor; Biolume places activity beside the session name, with no repeated input label. Other presets show activity in the editor's top rail. The bottom rail shows model, thinking level, and context percentage.
- The input's normal scroll indicators replace rail details when needed.
- Autocomplete remains at its native **below-editor** coordinates; Biolume continues the shared frame around it.
- A quiet footer shows directory, Git branch, and timing.
- Status messages contributed by other extensions remain visible below it.
- Narrow panes drop extra padding and prioritize timing over the path. Extremely narrow panes use an unframed fallback.
- Other presets adapt to pi's light/dark appearance. Biolume has a consistent night-forest palette, including transcript/tool colors when its matching theme is enabled.
- Native ANSI cursor resets inherit the input surface, preventing a black strip through the composer. Nested label resets also retain muted border colors.

## Response and idle timing

While a request is in progress:

```text
working 12s
```

Once it has fully finished:

```text
took 38s · idle 2m 14s
```

- **Working/took** measures agent-active time from `agent_start` until `agent_settled`. It includes model reasoning, generation, tools, network waits, retries and automatic continuations, but pauses while a question waits for your answer. The label reads `waiting for you` during that pause. It is not a token-generation-only benchmark. Older saved wall-clock runs are labeled `elapsed`, not misrepresented as active time.
- **Idle** measures time since that final settlement, not since your last keystroke. Typing or opening a menu does not reset it. Starting the next request replaces the previous timing.
- Aborted and failed responses read `stopped after …` and `failed after …` instead of claiming success.
- Start/end timestamps are stored as non-context custom session entries. Reload and resume recover them from the active branch, and idle age includes time while pi was closed.
- An unfinished saved run has no fabricated completion time. It reads `previous run unfinished` until another request starts.
- Existing responses from before installation cannot be timed retroactively. The clock begins with your **next request** after loading the extension.

## Motion and compatibility

- One scheduler requests decorative updates at 10 Hz and short gaze transitions at approximately 30 Hz, then returns to the normal cadence as soon as the eyes settle. The clock updates once a second while visible. Pi coalesces render requests, so terminal performance can affect the achieved frame rate. Pi also renders normally as text streams.
- Other looks pause decorative motion while typing or unfocused. Composer instead lowers intensity while typing and does not require editor focus; blocking extension dialogs (including pi-ask) stop its motion.
- Work mode stops decorative motion when the request settles. Ambient mode is opt-in.
- No direct terminal writes, screen clears, renderer replacement, or per-token session-history scans. The configurable footer runs bounded asynchronous local Git checks; see [FOOTER.md](FOOTER.md).
- Native cursor markers and fullscreen mouse coordinates are preserved, including the extra padding and completion rows.
- Retry/compaction rows and transcript tool rendering remain pi's responsibility. `motion off` controls this extension's decorations, not every animation pi or another extension may render.
- Print, JSON, and RPC modes do not install terminal UI, start timers, or append appearance timing entries.
- Timers and footer subscriptions are released on shutdown/reload/session replacement.

Only one extension can own pi's editor/header/footer at a time. This extension preserves **footer status messages**, not another extension's custom footer component. Avoid combining it with another full appearance replacement. Switching presets does not rebuild the editor; turning the extension off/on does use pi's normal editor replacement mechanism.

## Files

- `footer.ts`: configurable footer lifecycle, Git checks, timing events, and global preference persistence
- `footer-state.ts`: validated preferences, Git parsing, and activity clock
- `footer-view.ts`: adaptive two-row rendering and timing strip
- `footer-settings.ts`: beginner-facing native preview workspace, synced selection, text/color menus, Save/Discard and Undo
- `footer-selection.ts`: footer-only selection/focus styling and one-pass highlight shimmer; opt out through Other options → Selection shimmer
- `appearance.ts`: versioned element/state settings, legacy migration and validation
- `appearance-render.ts`: shared live/preview layout, theme-aware styling and exact label hit targets
- `footer-option-info.ts`: labels and help for the remaining footer controls
- `index.ts`: lifecycle, commands, preferences, and scheduling
- `state.ts`: response clock and motion policy
- `ui.ts`: native-editor subclass, rails, palette, footer, and header
- `workspace.ts`: unified identity/scene/checklist layout and bounded plugin dock
- `canopy.ts`: real-state forest artwork using the original shared cat
- `gaze.ts`: bounded pointer observation, mouse/caret arbitration, coordinate tracking and eye offsets
- `biolume.ts`: full interface palette, reversible theme lease, and reset-safe surfaces/rails
- `../../lib/home-dock.ts`: optional data-only protocol shared with independent plugins
- `lab/design.ts`: semantic palettes, cell composition, shared visual primitives, and demo timeline
- `lab/scenes.ts`: signature visuals and sample plugin/composer treatments
- `lab/screen.ts`: preview overlay, keyboard/mouse controls, and animation lifecycle
- `lab/garden.ts`: procedural scene composition, half-cell art, and prismatic orbits
- `lab/forest.ts`: layered conifers, moss, ferny understory, and pastel mushroom caps
- `lab/fireflies.ts`: deterministic, independent wandering paths and gentle light pulses
- `lab/lighting.ts`: three contained Glasshouse lighting palettes
- `lab/sprites.ts`: shared original cat sprite and expressions
- `tests/*.test.mjs`: host-loader, rendering, editor, identity, preview, timing, and lifecycle checks

## Verify

For this managed pi installation:

```sh
node --test ~/.pi/agent/extensions/pi-home/tests/*.test.mjs
```

The runner resolves the active managed pi version's packages rather than installing duplicate pi dependencies. For a different installation, set `PI_HOME_HOST_MODULES` to its `node_modules` directory.

Tested against pi 0.99.1:

- strict TypeScript check
- automated tests across Home and Tasks, including widths from 1–140 columns, Unicode, both icon sets, light/dark theme invalidation, native mouse/cursor behavior, completion, paste preservation, timings, parallel tools, dialog state, session naming, all three garden moods, frozen-time comparison, motion-off behavior, evergreen contrast/pastel checks, sprite transparency, firefly continuity/bounds/occlusion, preview state/control behavior, and cleanup
- actual regular/fullscreen pi sessions in a pseudo-terminal with a local streaming provider fixture: three presets, reasoning/text transitions, cancellation, idle time, resize, menus, reload, and exit
- actual regular/fullscreen Biolume/Tasks sessions: real tool add/start/done calls, three-task visibility, immediate independent task disable, actual tool declaration removal/re-addition, native fallback, durable session history, overlay navigation, scene toggle, reload, draft preservation, and resize
- explicit runtime theme assertions through theme off/on, preset switching, Home off/on and reload; saved `settings.json` theme remains unchanged
- rendered terminal captures reviewed at 110 and 64 columns for original-cat proportions, aligned insets, section spacing, input seams, and border colors
- gaze tests compare actual eye-pixel positions in fullscreen/regular PTY output, including pointer/caret handoff, Unicode multiline input, selection, focus loss, overlays, resize, motion/gaze switches, reload and listener cleanup; complete synchronized-frame captures verify several intermediate shaded poses, prompt first movement and crisp settlement; unit tests verify frame-rate-independent easing, continuous retargeting, bounded coverage and unchanged non-eye pixels
- actual regular/fullscreen design-lab overlays: four directions, all three lighting moods, replay/step/freeze/error/motion controls, shortlist, session rename, resize, reload, and exit; appearance preferences verified unchanged

The PTY fixture and research artifacts are outside the installed extension, under `/tmp/pi-home-research/`. They are not loaded in normal sessions. Real font shapes and subjective spacing should still be reviewed in your terminal.

## Design references

The implementation is original; these projects informed the interaction design:

- [Hermes chrome](https://github.com/NousResearch/hermes-agent/blob/ddd0cc6944908d2655db2095786ac089a7c3ba0c/ui-tui/src/components/appChrome.tsx): fixed-width activity slots, personality near the prompt, progressive removal of low-priority status details.
- [oh-my-pi status component](https://github.com/can1357/oh-my-pi/blob/2b023d1b80133c523d66412602d99b5427408395/packages/tui/src/status-line/component.ts): editor-integrated status and short work/idle accent transitions.
- [Claude Code status line](https://code.claude.com/docs/en/statusline) and [accessibility](https://code.claude.com/docs/en/accessibility): clear status hierarchy and an explicit reduced-motion choice. Claude Code's private source was not used.
- [OpenCode composer](https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/component/prompt/index.tsx) and [todo plugin](https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/feature-plugins/sidebar/todo.tsx): filled surfaces, accent rails, gradient activity, and a slot-based plugin architecture.
- [Hermes pets](https://hermes-agent.nousresearch.com/docs/user-guide/features/pets): event-reactive companions. The lab's cat is an original half-block sprite, not a downloaded pet asset.
- Installed pi docs and the `custom-footer`, `modal-editor`, `border-status-editor`, `working-indicator`, and overlay examples provided the extension API contracts.

## Remove

For a reversible appearance disable, use `/home off`. Tasks remains enabled independently; use `/tasks off` to disable that feature too.

To uninstall, move this `pi-home` directory **outside** `~/.pi/agent/extensions/`, then `/reload`. Renaming it within `extensions/` will not stop auto-discovery while it still contains `index.ts`. You may also delete `~/.pi/agent/pi-home.json`. Keep `~/.pi/agent/lib/home-dock.ts` if Tasks is still installed. Session timing entries are inert metadata and can remain.
