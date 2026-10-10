# Architecture and ownership

This document describes the current ownership boundaries. The repository root is now a **private installable Pi package**, but a shared visual-customization API has not yet been implemented.

```text
Tasks plan/history state ── versioned data-only dock events ──> Home UI host
Ask question/answer state ── owns temporary input surface
Home layout + appearance preferences ──> Frame rendering primitives/presentation
Tasks native fallback ──> shared task-frame adapter ──> Frame
Ask question surface ──> package-local Frame loader ──> Frame
```

- **Frame** (`packages/pi-frame`) owns `frameRows`, `frameRail`, `paintFramePerimeter`, `statusPreset`, presentation rules, and the optional motion controller. Its optional `presentationRows` styles title/summary/hint rail labels bold while leaving ordinary body rows alone; consuming surfaces choose their own label colors. It does not infer task states, create timers by default, or replace Pi components globally. Public imports use `/primitives` and `/presentation`.
- **Home** (`extensions/pi-home`) owns its editor decoration, transcript adapters, `/footer` interaction, preview transaction, and UI lifecycle. `appearance.ts` validates versioned input settings; `appearance-render.ts` lays out the input/footer. `footer.ts` writes `pi-footer.json`, including Tasks *presentation*, Ask visuals and Home's versioned `transcript` chat/tool section, while Ask itself validates/reads its own section. `pi-home.json` separately owns Home look/enabled preferences. This suite's Home entry includes Ask's source for the integrated editor.
- **Tasks** (`extensions/pi-tasks`) owns the `tasks` tool, `/tasks`, plan state/history and its independent no-Home widget. `pi-tasks.json` owns its enablement/fallback preferences. Session entries, not frame settings, store branch-sensitive task information.
- **Ask** (`packages/pi-ask`) owns the question tools, answer semantics, custom input, focus, versioned visual parser and synthetic shell preview. It reads the `ask` visual section of `pi-footer.json` once on opening a question, using the old `questionLabels` value only when no section is saved; it works without Home.
- **Shared adapters** (`lib/`) hold the versioned Home/Tasks dock event protocol, shared task frame, and local Frame reload adapter. Ask has a package-local reload adapter so it can remain independently installed.

Pi's public extension/TUI APIs and host-provided packages are the foundation. Home's Pi 1.0 transcript adapters also use guarded native internals; recheck them after host upgrades. Keep the native editor, Vim instance, draft, IME cursor, mouse selection and tool execution independent of visual styling. Support non-TUI modes without starting visual timers.

## Intended customization boundary

Grow `/footer` into an opt-in **surface workspace** without making Frame a global layout manager. A surface adapter should define stable element IDs, supported slots, defaults, semantic state facts, collision priorities, preview samples and validated versioned preferences. A shared interaction layer can provide keyboard/mouse selection, live previews, Save/Undo/Discard and rollback. The surface still owns content, input, hit targets, lifecycle, and redraw. Preview facts must be explicitly labeled and never written to tasks, answers, drafts or timestamps.

Start by extracting only proven common mechanics. Composer has six rail positions *and* footer rows; a question has a replacement input surface; Tasks has a body and overview; transcript tool cards can be self-rendering. Do not pretend every surface has the same slots. Give each screen a keyboard path, responsive/narrow fallback, theme contrast and reduced-motion safety.

## Dependency and installation rules

The private root `pi-workspace-suite` manifest explicitly lists `extensions/pi-home/index.ts`, `extensions/pi-tasks/index.ts` and `packages/pi-ask/extensions/questions.ts`, once each. The packed root bundles only `pi-embeddable-frame` under its own `node_modules`; Frame registers no extension. The host packages actually imported by suite sources (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, `typebox`) are peers, not bundled runtime dependencies. Frame and Ask retain their separate versioned package manifests, but must not be loaded a second time alongside the suite. Keep one authoritative source file for each module. Packed install, a real Pi RPC cold-start, repeat loader tests and an interactive `/reload` now pass. After explicit user approval, live settings load this checkout once, with exact exclusions for the older Home/Tasks entries; the previous source and settings are backed up. Physical IME, human visual/motion review, real drag selection and authenticated turns remain unverified. See [migration](MIGRATION.md) and [acceptance](ACCEPTANCE.md).
