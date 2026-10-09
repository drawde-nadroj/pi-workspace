# Architecture and ownership

This document describes the **current source baseline**, not an implemented suite API.

```text
Tasks plan/history state ── versioned data-only dock events ──> Home UI host
Ask question/answer state ── owns temporary input surface
Home layout + appearance preferences ──> Frame rendering primitives/presentation
Tasks native fallback ──> shared task-frame adapter ──> Frame
Ask question surface ──> package-local Frame loader ──> Frame
```

- **Frame** (`packages/pi-frame`) owns `frameRows`, `frameRail`, `paintFramePerimeter`, `statusPreset`, presentation rules, and the optional motion controller. It does not infer task states, create timers by default, or replace Pi components globally. Public imports use `/primitives` and `/presentation`.
- **Home** (`extensions/pi-home`) owns its editor decoration, transcript adapters, `/footer` interaction, preview transaction, and UI lifecycle. `appearance.ts` validates versioned element settings; `appearance-render.ts` lays out the input/footer. `footer.ts` currently owns `pi-footer.json`, including the Tasks *presentation* subobject. `pi-home.json` is separate and owns Home look/enabled preferences.
- **Tasks** (`extensions/pi-tasks`) owns the `tasks` tool, `/tasks`, plan state/history and its independent no-Home widget. `pi-tasks.json` owns its enablement/fallback preferences. Session entries, not frame settings, store branch-sensitive task information.
- **Ask** (`packages/pi-ask`) owns the question tools, answer semantics, custom input and focus. It currently reads the question-label preference from `pi-footer.json` when opening a question; it must continue to work without Home.
- **Shared adapters** (`lib/`) hold the versioned Home/Tasks dock event protocol, shared task frame, and local Frame reload adapter. Ask has a package-local reload adapter so it can remain independently installed.

Pi's public extension/TUI APIs and host-provided packages are the foundation. Home's Pi 1.0 transcript adapters also use guarded native internals; recheck them after host upgrades. Keep the native editor, Vim instance, draft, IME cursor, mouse selection and tool execution independent of visual styling. Support non-TUI modes without starting visual timers.

## Intended customization boundary

Grow `/footer` into an opt-in **surface workspace** without making Frame a global layout manager. A surface adapter should define stable element IDs, supported slots, defaults, semantic state facts, collision priorities, preview samples and validated versioned preferences. A shared interaction layer can provide keyboard/mouse selection, live previews, Save/Undo/Discard and rollback. The surface still owns content, input, hit targets, lifecycle, and redraw. Preview facts must be explicitly labeled and never written to tasks, answers, drafts or timestamps.

Start by extracting only proven common mechanics. Composer has six rail positions *and* footer rows; a question has a replacement input surface; Tasks has a body and overview; transcript tool cards can be self-rendering. Do not pretend every surface has the same slots. Give each screen a keyboard path, responsive/narrow fallback, theme contrast and reduced-motion safety.

## Dependency and installation rules

A future suite manifest must explicitly list only its intended extension entry points. Pi host modules (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `typebox`) are peers, not bundled runtime dependencies. Frame and Ask can remain separate versioned packages in this monorepo; avoid duplicate copies or double-loading Ask through both the suite and personal package settings. Keep one authoritative source file for each module and test cold startup **and** reload after an upgrade. The current working installation has not been switched.
