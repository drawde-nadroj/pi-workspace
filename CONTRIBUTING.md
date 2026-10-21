# Contributing

Use this guide from the **suite repository root**. For user installation, follow [Install the local suite](docs/INSTALL.md); for design boundaries, read [architecture](docs/ARCHITECTURE.md).

## Test environment

Install a compatible Pi 1.3.0 host, Node.js and npm before `npm ci`. Root tests normally discover `~/.pi/agent/install`. If the host lives elsewhere, set `PI_WORKSPACE_HOST_MODULES` and `PI_ASK_HOST_MODULES` (`PI_HOME_HOST_MODULES` remains a compatibility fallback) to that host's `node_modules` directory. Frame additionally honors `PI_FRAME_HOST_MODULES`, then Workspace/Ask overrides. These paths select test dependencies; they do not install Pi or copy credentials. Workspace/Vim integration tests use the checkout's pinned `pi-vim` development dependency, not your live Vim installation.

```sh
npm ci
npm test
npm run typecheck --workspace=pi-ask
npm run pack:check
```

The root suite covers Frame, Ask, Workspace, Tasks, deterministic harness checks and isolated packed-suite loading. It excludes optional Chronomancer. `pack:check` is a dry run, not publication. The [acceptance record](docs/ACCEPTANCE.md) supplies exact historical commands/results and remaining physical/provider checks; do not turn them into a whole-repository typing or human-usability guarantee.

## Develop safely

1. Clone outside `~/.pi`; do not copy the entire Pi agent directory into this repository.
2. Run `npm ci` and `npm test`. The tests use an installed Pi host and root workspace links. See [README.md](README.md) for host environment overrides.
3. Change one owner at a time. Frame presentation cannot edit domain state; question previews cannot answer for users; Tasks presentation cannot change task results or execution.
4. Add tests for the behavior and for its lifecycle or fallback. For terminal work, include narrow and wide cell widths, ANSI/CJK/emoji, themes, resize, cursor/IME, Vim, mouse/keyboard, regular/fullscreen modes, reload and disposal where relevant. Automated results do not replace a real terminal review.
5. If you change a public API, manifest, setting, or command, update the affected package README, this repository's architecture/migration docs, and a changelog entry before release. Write a short decision record in `docs/decisions/` for changes in ownership, compatibility or package boundaries.
6. Before committing, inspect `git status --short` and `git diff --cached --name-only`. Never commit credentials, tokens, client data, sessions, live preferences, generated modules, or terminal captures with private content. The `.gitignore` is a guard, not a security audit.

## Versioning and releases

Commit coherent changes with the tests they require; do not publish from an untested working tree. The private suite manifest already exists. Use tagged releases and a changelog if it is later released. Keep `pi-embeddable-frame` and `pi-ask` versioned as independently installable packages; keep their versions and bundled declarations consistent with the current suite manifest. Pin or review Pi host compatibility separately. A source-only repository commit is **not** a Pi package release.
