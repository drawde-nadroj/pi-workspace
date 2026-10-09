# 0001: One source repository, separate runtime owners

**Status:** Accepted for the source baseline; suite packaging remains proposed.

## Context

Frame and Ask were local Pi packages, Home and Tasks auto-discovered extensions, and shared adapters lived in `~/.pi/agent/lib/`. None was under local version control. They share a terminal visual language but own different data and input behavior.

## Decision

Import the existing source into one private npm-workspace Git repository outside `~/.pi`, retaining the agent-like `packages/`, `extensions/`, and `lib/` paths so current relative imports and tests remain meaningful. Keep Frame and Ask separately packaged. Do not change the live installation or claim the root is an installable Pi package at this stage. Work toward an explicit suite manifest and per-surface customization adapters instead of a universal renderer or merged domain state.

## Consequences

Development gets one history, lockfile, common tests and docs without a disruptive runtime migration. The user continues to run the original extension copies until a separately verified installation switch. Layout settings may be unified in the UI without forcing Tasks plans, Ask answers, editor state, or Frame primitives into one persistence file. An eventual suite must handle dependency/resource packaging, compatibility, old export caches, double-loading and rollback explicitly.
