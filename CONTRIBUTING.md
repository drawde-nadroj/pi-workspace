# Contributing

## Develop safely

1. Clone outside `~/.pi`; do not copy the entire Pi agent directory into this repository.
2. Run `npm ci` and `npm test`. The tests use an installed Pi host and root workspace links. See [README.md](README.md) for host environment overrides.
3. Change one owner at a time. Frame presentation cannot edit domain state; question previews cannot answer for users; Tasks presentation cannot change task results or execution.
4. Add tests for the behavior and for its lifecycle or fallback. For terminal work, include narrow and wide cell widths, ANSI/CJK/emoji, themes, resize, cursor/IME, Vim, mouse/keyboard, regular/fullscreen modes, reload and disposal where relevant. Automated results do not replace a real terminal review.
5. If you change a public API, manifest, setting, or command, update the affected package README, this repository's architecture/migration docs, and a changelog entry before release. Write a short decision record in `docs/decisions/` for changes in ownership, compatibility or package boundaries.
6. Before committing, inspect `git status --short` and `git diff --cached --name-only`. Never commit credentials, tokens, client data, sessions, live preferences, generated modules, or terminal captures with private content. The `.gitignore` is a guard, not a security audit.

## Versioning and releases

Commit coherent changes with the tests they require; do not publish from an untested working tree. Use tagged releases and a changelog once there is a suite package. Keep `pi-embeddable-frame` and `pi-ask` versioned as independently installable packages; declare their compatible versions in any future suite manifest. Pin or review Pi host compatibility separately. A source-only repository commit is **not** a Pi package release.
