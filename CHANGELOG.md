# Changelog

This file records source-workspace changes. It does not announce an installable suite release.

## Unreleased

- Imported the existing Frame, Ask, Home and Tasks sources into one private Git workspace without switching the live Pi installation.
- Added root development scripts, a reproducible npm lockfile, source-boundary documentation and a migration plan.
- Made Home's Vim integration tests resolve the checkout's pinned `pi-vim` development dependency instead of the live agent's separate npm directory.
- Added a private root Pi suite manifest that loads Home, Tasks and Ask once, bundles Frame for packed installs, and keeps Pi host packages as peers.
- Added an isolated offline pack/install/cold-load test and a proposed live switch/rollback procedure; no live installation was changed.
- Documented the current and proposed surface-workspace boundaries, navigation alternatives, and accurate project terminology for sharing and teaching.
- Made Input & footer and Tasks the first focused rooms of the existing `/footer` workspace; Tasks now synchronizes its element list with hit-tested, display-only preview labels and rows while retaining the existing settings, Save/Undo/Discard, and native editor.
- Added an Ask room backed by Ask's versioned visual contract and synthetic shell preview; standalone Ask reads saved appearance at question opening and retains answer/input ownership.
- Added a Transcript room with versioned chat/tool rail preferences, clickable synthetic chat and tool samples, sourced Sent placement, and guarded native fallback for unsupported tool renderers.
- Recorded isolated Pi 1.0 terminal acceptance and a settings rollback drill, clarified unverified human checks and reversible live migration, and added a Frame adapter example for third-party tool surfaces. Live Pi remains unchanged.
- Retired the old Home presets and `/home lab` gallery in the checkout: Composer is the sole fresh-install look, old Home preferences are interpreted without rewriting them until an explicit save, and independent Tasks/Ask/Frame behavior remains intact. The live installation was not switched in this increment.
- With explicit user approval, switched live Pi settings to the private local suite. Backed up original settings, Home/Tasks source and appearance preferences; exact exclusions prevent duplicate Home/Tasks loading while preserving the files for rollback. A separate offline Pi cold start, `/footer`, `/tasks` and `/reload` passed. Physical/subjective and authenticated checks remain open; the existing running Pi session still needs a cold restart.
