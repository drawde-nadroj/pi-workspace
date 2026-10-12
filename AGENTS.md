# Developing pi-workspace-suite

This is a private, locally loaded Pi package. Before changing a surface, read `README.md`, `docs/ARCHITECTURE.md`, and its component README. Consult the installed Pi documentation and examples before changing Pi APIs or terminal UI behavior. This checkout is the suite source; the older Home and Tasks directories under `~/.pi/agent/extensions/` remain on disk but are excluded from loading. Do not edit them for suite changes.

## Ownership

- **Frame** (`packages/pi-frame`): reusable drawing primitives and opt-in presentation rules. It does not own application state, native input, layout, or tool execution.
- **Home** (`extensions/pi-home`): Composer, transcript adapters, workspace host, and the `/workspace` appearance editor. Preserve Pi's native editor and the installed pi-vim instance.
- **Tasks** (`extensions/pi-tasks`): plans, history, the `tasks` tool, and the independent no-Home fallback. Home displays sourced Tasks data; it does not create or complete plans.
- **Ask** (`packages/pi-ask`): question/answer behavior, focus, and temporary input. Home hosts its visual settings room, not its answer semantics.
- **Shared adapters** (`lib/`): the Home/Tasks dock protocol and Frame integration. Keep component-specific state and lifecycle with the component that owns them.

For a cross-component change, identify the **state owner, visual adapter, settings authority, and fallback** before editing. Change only the owners required by the request. Do not make Frame a global renderer or assume every surface shares the same slots or input contract.

## Appearance and `/workspace`

Read `docs/SURFACE-WORKSPACE.md` and `extensions/pi-home/FOOTER.md` before adding a visual setting or appearance editor. `/workspace` has Input & footer, Tasks, Ask, and Transcript rooms. Extend the appropriate room rather than creating a competing control. The detailed supported elements and constraints live in those documents; keep them authoritative rather than duplicating their inventory here. Keep selection-to-preview correspondence across rooms: derive target rectangles from actual rendered content, highlight only affected regions, preserve semantic foregrounds, and explain unavailable targets. Hover inspection is ephemeral and must not activate controls, steal keyboard focus, edit preferences or start timers. A shared appearance entry does not authorize taking over a self-rendering tool; extension surface registration remains a proposal until its owner, validation and native fallback are implemented and tested.

`pi-workspace.json` is the versioned visual-preference authority for those four rooms; `pi-footer.json` is a read-only legacy fallback until the first Save. They share one Save/Undo/Discard transaction for that file. `pi-home.json` owns Home enablement; `pi-tasks.json` owns Tasks enablement and standalone fallback preferences. Branch-sensitive task and run data stay in session entries. Do not introduce two live settings for the same field or claim an atomic Save across files without implementing and testing it. Validate versioned settings; do not silently overwrite malformed files or unknown newer versions.

Home's private room/control builders supply pure candidate patches; `footer-settings.ts` retains one accepted draft, transaction and interaction controller. Hover/keyboard audition uses cloned visuals or synthetic modes, never accepted preferences or Undo. Current-value restoration must not introduce default sections; Save must exclude an unaccepted candidate. Keep menu hit coordinates stable across preview-height changes and clear audition on blur, resize, invalidate, abort and disposal. Native message facts belong behind `native-message-adapter.ts` with guarded shapes and native fallback, not additional private-field casts. Review all six sections and companion entry points through `docs/SETTINGS-REVIEW.md`; do not promise a shared transaction/hover contract for native or third-party settings.

Previews are display-only and visibly labeled as such. Never alter the native draft, answers, plans, messages, tool results, recorded times, or run state to demonstrate a style. Preserve native cursor/IME, Vim undo and completion, keyboard and mouse mapping, narrow-width behavior, and native fallbacks for images and self-rendering tools. Motion follows real work, stops for blocking interactions, and cleans up on hide, reload, and disposal; do not add an idle animation loop just for decoration.

## Verification and installation boundaries

Run relevant component tests and `npm test` for suite changes; run `npm run pack:check` when packaging or dependency boundaries change. Test cold load and reload, standalone Ask, and Tasks without Home when affected. For terminal UI changes, check narrow/wide cell widths, Unicode/ANSI, light/dark themes, focus, Vim, mouse/keyboard, resize, and lifecycle as applicable. Distinguish automated tests, isolated terminal checks, and hands-on observations; do not claim unperformed checks.

The live Pi settings point at this checkout, but a running Pi process does not automatically adopt source edits. `/reload` may refresh extension code; use a fresh Pi process for package/export or dependency changes and whenever reload retains stale code. Do not change live `~/.pi/agent/settings.json`, copy personal preferences or sessions into Git, publish packages, or migrate installations unless explicitly requested. Before committing, inspect `git status --short` and `git diff --cached --name-only` for private data. Update the relevant component guide and architecture/migration documentation when a public contract changes.
