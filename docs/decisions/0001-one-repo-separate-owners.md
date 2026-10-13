# 0001: One source repository, separate runtime owners

**Status:** Accepted. The context/decision/consequences below record the initial source-import increment, not current installation state. Private suite packaging was implemented; a separately authorized live switch and later cleanup followed. See [later migration](../MIGRATION.md). The initial no-live-change boundary is preserved below as history.

## Context

Frame and Ask were local Pi packages, Workspace and Tasks auto-discovered extensions, and shared adapters lived in `~/.pi/agent/lib/`. None was under local version control. They share a terminal visual language but own different data and input behavior.

## Decision

Import the existing source into one private npm-workspace Git repository outside `~/.pi`, retaining the agent-like `packages/`, `extensions/`, and `lib/` paths so current relative imports and tests remain meaningful. Keep Frame and Ask separately packaged. Do not change the live installation. The root has an explicit private Pi suite manifest listing Workspace, Tasks and Ask; Frame is a bundled runtime library with no extension entry. Work toward per-surface customization adapters instead of a universal renderer or merged domain state.

## Consequences

Development gets one history, lockfile, common tests and docs without a disruptive runtime migration. The user continues to run the original extension copies until a separately verified installation switch. Layout settings may be unified in the UI without forcing Tasks plans, Ask answers, editor state, or Frame primitives into one persistence file. The private suite packs its Frame dependency and tests duplicate registrations and isolated cold loads. An eventual live switch still needs interactive compatibility, old export-cache/reload acceptance, visual review, double-loading prevention and rollback.
