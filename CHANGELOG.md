# Changelog

This file records source-workspace changes. It does not announce an installable suite release.

## Unreleased

- Imported the existing Frame, Ask, Home and Tasks sources into one private Git workspace without switching the live Pi installation.
- Added root development scripts, a reproducible npm lockfile, source-boundary documentation and a migration plan.
- Made Home's Vim integration tests resolve the checkout's pinned `pi-vim` development dependency instead of the live agent's separate npm directory.
- Added a private root Pi suite manifest that loads Home, Tasks and Ask once, bundles Frame for packed installs, and keeps Pi host packages as peers.
- Added an isolated offline pack/install/cold-load test and a proposed live switch/rollback procedure; no live installation was changed.
- Documented the current and proposed surface-workspace boundaries, navigation alternatives, and accurate project terminology for sharing and teaching.
- Made Input & footer and Tasks the first focused rooms of the existing `/footer` workspace; Tasks now synchronizes its element list with hit-tested, display-only preview labels and rows while retaining the existing settings, Save/Undo/Discard, and native editor. Ask and transcript/tool appearance rooms remain planned.
