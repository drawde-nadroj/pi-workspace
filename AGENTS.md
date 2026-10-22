# Developing pi-workspace-suite

This is a private, locally loaded Pi package. Before changing a surface, read `README.md`, `docs/ARCHITECTURE.md`, and its component README. Consult the installed Pi documentation and examples before changing Pi APIs or terminal UI behavior. This checkout is the suite source; the older personal Home directory was removed, while the older Tasks directory under `~/.pi/agent/extensions/` remains excluded from loading. See `docs/MIGRATION.md` for the current inventory and historical switch. Do not edit them for suite changes.

## Ownership

- **Frame** (`packages/pi-frame`): reusable drawing primitives and opt-in presentation rules. It does not own application state, native input, layout, or tool execution.
- **Workspace** (`extensions/pi-workspace`): Composer, transcript adapters, workspace host, and the `/workspace` appearance editor. Preserve Pi's native editor and the installed pi-vim instance.
- **Tasks** (`extensions/pi-tasks`): plans, history, the `tasks` tool, and the independent no-Workspace fallback. Workspace displays sourced Tasks data; it does not create or complete plans.
- **Ask** (`packages/pi-ask`): question/answer behavior, focus, and temporary input. Workspace hosts its visual settings room, not its answer semantics.
- **Shared adapters** (`lib/`): the Workspace/Tasks dock protocol and Frame integration. Keep component-specific state and lifecycle with the component that owns them.

For a cross-component change, identify the **state owner, visual adapter, settings authority, and fallback** before editing. Change only the owners required by the request. Do not make Frame a global renderer or assume every surface shares the same slots or input contract.

## Appearance and `/workspace`

Read `docs/SURFACE-WORKSPACE.md` and `extensions/pi-workspace/FOOTER.md` before adding a visual setting or appearance editor. `/workspace` has Input & footer, Tasks, Ask, and Transcript rooms. Extend the appropriate room rather than creating a competing control. The detailed supported elements and constraints live in those documents; keep them authoritative rather than duplicating their inventory here. Keep selection-to-preview correspondence across rooms: derive target rectangles from actual rendered content, highlight only affected regions, preserve semantic foregrounds, and explain unavailable targets. Hover inspection is ephemeral and must not activate controls, steal keyboard focus, edit preferences or start timers. A shared appearance entry does not authorize taking over a self-rendering tool; extension surface registration remains a proposal until its owner, validation and native fallback are implemented and tested.

`pi-workspace.json` is the versioned visual-preference authority for those four rooms; `pi-footer.json` is a read-only legacy fallback until the first Save. They share one Save/Undo/Discard transaction for that file. `pi-composer.json` owns Composer enablement (with a read-only `pi-home.json` fallback); `pi-tasks.json` owns Tasks enablement and standalone fallback preferences. Branch-sensitive task and run data stay in session entries. Do not introduce two live settings for the same field or claim an atomic Save across files without implementing and testing it. Validate versioned settings; do not silently overwrite malformed files or unknown newer versions.

Workspace's private room/control builders supply pure candidate patches; `footer-settings.ts` retains one accepted draft, transaction and interaction controller. Hover/keyboard audition uses cloned visuals or synthetic modes, never accepted preferences or Undo. Current-value restoration must not introduce default sections; Save must exclude an unaccepted candidate. Keep menu hit coordinates stable across preview-height changes and clear audition on blur, resize, invalidate, abort and disposal. Native message facts belong behind `native-message-adapter.ts` with guarded shapes and native fallback, not additional private-field casts. Review all six sections and companion entry points through `docs/SETTINGS-REVIEW.md`; do not promise a shared transaction/hover contract for native or third-party settings.

Previews are display-only and visibly labeled as such. Never alter the native draft, answers, plans, messages, tool results, recorded times, or run state to demonstrate a style. Preserve native cursor/IME, Vim undo and completion, keyboard and mouse mapping, narrow-width behavior, and native fallbacks for images and self-rendering tools. Motion follows real work, stops for blocking interactions, and cleans up on hide, reload, and disposal; do not add an idle animation loop just for decoration.

## Verification and installation boundaries

Run relevant component tests and `npm test` for suite changes; run `npm run pack:check` when packaging or dependency boundaries change. Test cold load and reload, standalone Ask, and Tasks without Workspace when affected. For terminal UI changes, check narrow/wide cell widths, Unicode/ANSI, light/dark themes, focus, Vim, mouse/keyboard, resize, and lifecycle as applicable. Distinguish automated tests, isolated terminal checks, and hands-on observations; do not claim unperformed checks.

### Portable tests: `npm test` runs on Windows, Ubuntu and macOS

`.github/workflows/test.yml` runs the whole `npm test` chain on a three-OS matrix for every push, so **one host passing is not evidence**. A test must pass on all three or declare its platform condition explicitly; never assert platform-dependent behaviour conditionally. Keep these rules when adding or changing tests:

- **Never hardcode a path that must exist.** `/bin/sh`, `/usr/bin/…`, `/tmp/…` and `/opt/…` are POSIX-only, so a fixture that resolves them fails on Windows with `undefined`. Use `process.execPath` for "an existing absolute path", `join(tmpdir(), …)` for scratch locations, and `mkdtemp` for writable directories.
- **Never hardcode a separator.** `node:path` resolves per host, so `join`/`dirname`/`resolve` must build both the value under test and its expectation; compare against the same `join` the production code calls. A literal like `"/tmp/xdg/pi-dictation"` silently encodes the author's host and reads as green locally while failing on Windows, where the same call returns `\tmp\xdg\pi-dictation`.
- **Native `import()` needs a URL.** Use `import(pathToFileURL(join(source, "file.mjs")).href)`; a bare Windows path throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`. Only `jiti.import(...)` accepts a raw path. Import host helpers once at the top of a test file instead of re-importing them inside a test.
- **Don't hide one platform bug behind another.** Assertions after the first failure in the same `test()` never run, so a POSIX fixture early in a test can mask further Windows bugs and make the reported failure count look smaller than it is. Keep independent platform-sensitive assertions in separate `test()` calls, or fix the whole group before trusting a "N failures" report.
- Genuinely POSIX-only behaviour (spawn errno codes, `/bin/sh` scripts, `chmod` semantics, newline filenames) stays tested behind an explicit `t.skip("reason")` for that platform; the skip is part of the documented baseline, not a workaround.
- Anything that touches the filesystem gets a unique `mkdtemp` path under `tmpdir()` with bounded async cleanup, and never assumes `.cmd`/`.bat` shims or a login shell.

When a Windows failure is reported, reproduce the expectation with `path.win32.join` (or `node:path/win32`) instead of guessing, then fix the fixture rather than the assertion's platform condition.

The live Pi settings point at this checkout, but a running Pi process does not automatically adopt source edits. `/reload` may refresh extension code; use a fresh Pi process for package/export or dependency changes and whenever reload retains stale code. Host upgrades go through the project-local `/update` command in `.pi/prompts/update.md`; do not patch for a new Pi version by improvising a narrower check. Do not change live `~/.pi/agent/settings.json`, copy personal preferences or sessions into Git, publish packages, or migrate installations unless explicitly requested. Before committing, inspect `git status --short` and `git diff --cached --name-only` for private data. Update the relevant component guide and architecture/migration documentation when a public contract changes.
