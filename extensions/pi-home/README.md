# pi-home

Home is a **Composer-only** appearance extension for Pi 1.0.0. It frames Pi's native editor and transcript, hosts the optional Tasks dock, and owns the `/workspace` appearance editor. It does not replace the text engine, make model calls, or own Tasks plans or Ask answers. The retired Home looks and `/home lab` gallery are not part of this checkout; their history remains in Git.

**Installation status:** After explicit approval, the live Pi settings load this checkout's private suite, which explicitly loads Home, Tasks and Ask and bundles `pi-embeddable-frame`. The older Home/Tasks folders remain on disk but are excluded from auto-discovery; separate Frame/Ask package declarations were replaced. An already-running Pi session needs a fresh start to use the suite. See [acceptance](../../docs/ACCEPTANCE.md) and the [switch/rollback record](../../docs/MIGRATION.md).

## Composer

Composer is the fresh-install default. `/home composer` re-enables it; `/home off` restores the preceding native editor/header and theme while leaving the independent configurable footer and Tasks fallback available. An old `pi-home.json` with a retired `look`, `scene`, `gaze` or `motion: "ambient"` is **read without rewriting it**: the visual look becomes Composer, obsolete fields are ignored, and the next user-initiated Home preference save writes only supported fields. No plan, session or draft data is migrated or deleted.

- The real editor instance keeps its draft, paste, cursor, undo, completion and selection. With pi-vim installed, Home decorates its existing editor rather than replacing it. Native scroll hints take priority; tiny or graphical surfaces fall back safely.
- The top input rail shows real run state at left, the session title in the center and the **last recorded user-send time** at right. Before a send, an optional display-only hint may occupy that slot. It never guesses a timestamp from another branch or calls a model for it. The bottom rail shows directory, native Vim mode if present, and model plus selected thinking level. Context usage can be enabled in `/workspace` but is hidden by default.
- Only real work drives the purple perimeter light; typing quiets it, dialogs stop it and `/home motion off` disables Home's decorative motion. There is no idle decoration loop or predicted progress. Task statuses and question semantics remain separate.
- Native user and assistant messages receive guarded transparent frames with sourced **Sent** creation times. Unsupported content, graphics and narrow views retain Pi's native renderer. Grouped ordinary text calls keep each native child and its expansion/mouse handling; the separate web adapter applies only to its allowlisted tools. Tool errors and cancellations keep semantic markers. See [ACTIVITY-BLOCKS.md](ACTIVITY-BLOCKS.md).
- The optional Composer theme is a reversible runtime lease; `/home theme off` restores preceding interface colors without changing Pi's saved theme setting. Home off also releases the lease. Terminal/font legibility still needs visual review.

The optional Tasks extension publishes a data-only plan snapshot to Home. A compact sourced checklist can appear above the input; `/home details on|off` controls the work summary and `/tasks` opens the full plan/history panel. Home never starts or completes a task, and Tasks retains its standalone fallback. See [DOCK.md](DOCK.md) and the [Tasks README](../pi-tasks/README.md).

## Customize with `/workspace`

`/workspace` opens one transactional workspace with focused **Input & footer**, **Tasks**, **Ask** and **Transcript** rooms. Select a semantic element using keyboard navigation or a clickable preview label in fullscreen mode; edit safe text, placement, color and state treatment where exposed. Composer previews the real full-width native editor without changing its unsent draft. The other rooms use explicitly display-only synthetic samples. **Ctrl+S** saves, **Ctrl+Z** undoes and **Discard** restores the saved state. Unknown future Ask or Transcript versions block Save instead of being overwritten.

Global presentation preferences are saved atomically to versioned `pi-workspace.json`; an existing `pi-footer.json` is read when the new file is absent and never rewritten by migration. The Workspace room edits your sent-message display name and a single Compact/Spaced density setting;  Home look/enablement remains in `pi-home.json`, while Tasks plan data remains in `pi-tasks.json`. Ask reads its saved visuals when a question opens but keeps ownership of answer and focus behavior. `/workspace` can temporarily dress the input when Home is off and restores its prior appearance on closing. See [FOOTER.md](FOOTER.md) for the controls and limits, and [the surface contract](../../docs/SURFACE-WORKSPACE.md).

`/composer-preview` is a separate **synthetic** native overlay for comparing Composer states and a local sample input; it sends and saves nothing. It is not the retired design gallery. See [COMPOSER-PREVIEW.md](COMPOSER-PREVIEW.md).

## Commands and preferences

| Command | Effect |
| --- | --- |
| `/home` | Open Composer's appearance picker |
| `/home composer`, `/home on`, `/home off` | Enable Composer or restore the native shell |
| `/home motion work`, `/home motion off` | Animate only for real work, or disable Home's motion |
| `/home theme on`, `/home theme off` | Apply or release the matching runtime palette |
| `/home icons nerd`, `/home icons plain` | Choose Nerd Font or text glyphs |
| `/home details on`, `/home details off` | Expand or compact the work summary |
| `/home output raw`, `/home output readable` | Change expanded tool-card output for this session |
| `/workspace` | Customize frame, footer, Tasks, Ask and Transcript visuals |
| `/composer-preview` | Inspect a display-only Composer demonstration |

Supported Home preferences are `enabled`, `look: "composer"`, `motion: "work" | "off"`, `icons`, `details` and `theme`. They are persisted in the configured Pi agent directory, not in the repository. `pi-workspace.json` is the visual settings authority (with read-only legacy fallback). Disabling Home does not turn off Tasks or change saved preferences. Manual edits to Pi resources require `/reload` or a cold start.

## Lifecycle and limits

Home uses one scheduler for real run transitions and its recorded response/idle clock. Waiting for a question pauses active-run timing; failed and stopped runs remain labeled, and unfinished saved runs get no fabricated completion. Time metadata follows the active session branch. The footer owns bounded local Git checks. Noninteractive Pi modes do not mount the terminal UI or start its render timers.

The transcript adapters and paint guard use guarded Pi 1.0 component internals; review compatibility after a host upgrade. Home must not silently replace another custom editor/footer owner. Pi still owns streaming Markdown, retry and compaction content, selection, mouse dispatch and terminal painting. Physical IME candidate windows, font/color legibility, motion perception and authenticated tool flows cannot be proven by unit tests or tmux captures; see [ACCEPTANCE.md](../../docs/ACCEPTANCE.md).

Key source boundaries: `index.ts` owns lifecycle; `state.ts` owns the response clock and validated Home preferences; `ui.ts`, `composer-style.ts`, `composer-theme.ts`, `composer-palette.ts` and `composer-editor.ts` adapt the native Composer; `workspace.ts` hosts sourced dock rows; `footer.ts`, `footer-state.ts`, `footer-settings.ts` and `appearance*.ts` own the transactional workspace; `../../lib/home-dock.ts` defines the optional data protocol. `pi-embeddable-frame` remains a passive library, not a global UI override.

For this checkout, run `npm test`, `npm run typecheck --workspace=pi-ask` and `npm run pack:check` from the repository root. The root suite smoke test packs the private package, loads it with a real Pi host in an isolated agent directory and checks for duplicate registrations. Historical preset and gallery tests were removed with their source; the retained Home/Tasks/Ask/Frame suites cover the supported surfaces.
