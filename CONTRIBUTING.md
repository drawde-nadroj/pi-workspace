# Contributing

Use this guide from the **suite repository root**. For user installation, follow [Install the local suite](docs/INSTALL.md); for design boundaries, read [architecture](docs/ARCHITECTURE.md).

## Test environment

Install a **Pi 1.3.0-or-newer host** (1.3.0 is the minimum supported; CI also runs the current 1.4.0 release), Node.js and npm before `npm ci`. Root tests normally discover `~/.pi/agent/install`. If the host lives elsewhere, set `PI_WORKSPACE_HOST_MODULES` and `PI_ASK_HOST_MODULES` (`PI_HOME_HOST_MODULES` remains a compatibility fallback) to that host's `node_modules` directory. Frame additionally honors `PI_FRAME_HOST_MODULES`, then Egregore/Ask overrides. These paths select test dependencies; they do not install Pi or copy credentials. Egregore/Vim integration tests use the checkout's pinned `pi-vim` development dependency, not your live Vim installation.

```sh
npm ci
npm test
npm run pack:check
```

The root suite covers one whole-repository typecheck, Frame, Ask, Egregore, Tasks, Quests, the copyable dock example, the host-shape canary, deterministic harness checks and isolated packed-suite loading. A separately developed Chronomancer plugin is not part of this repository. `pack:check` is a dry run, not publication. The [acceptance record](docs/ACCEPTANCE.md) supplies exact historical commands/results and remaining physical/provider checks; do not turn them into a whole-repository typing or human-usability guarantee.

## Windows CI and portability

`.github/workflows/test.yml` runs the complete pipeline on Windows, Linux and macOS with Node.js 22.23.2, npm 10.9.8 and the locked Pi 1.3.0 host, and adds one Linux job against the current Pi 1.4.0 release. No personal installation, credentials or administrator setup is needed. CI prepares Pi's `fd` file-completion binary in an isolated agent directory using Pi's own downloader; this explicit setup step requires network access. See the [Windows setup and smoke test](docs/INSTALL.md#native-windows-supported-setup-and-smoke-test) for Git Bash commands and the optional pi-vim undo alias.

Use `os.tmpdir()` and unique directories for filesystem fixtures; captures print their paths. Directory-link fixtures use Windows junctions and absolute targets. Keep parser coverage platform-independent; skip only a specifically unrepresentable filesystem case with a reason. Shutdown must await child-process closure before deleting fixtures; bounded cleanup retries cover remaining transient locks, not running work. Do not change assertions to accept lost Vim history.

## Develop safely

1. Clone outside `~/.pi`; do not copy the entire Pi agent directory into this repository.
2. Run `npm ci` and `npm test`. The tests use an installed Pi host and root workspace links. See [README.md](README.md) for host environment overrides.
3. Change one owner at a time. Frame presentation cannot edit domain state; question previews cannot answer for users; Tasks presentation cannot change task results or execution.
4. Add tests for the behavior and for its lifecycle or fallback. For terminal work, include narrow and wide cell widths, ANSI/CJK/emoji, themes, resize, cursor/IME, Vim, mouse/keyboard, regular/fullscreen modes, reload and disposal where relevant. Automated results do not replace a real terminal review.
5. If you change a public API, manifest, setting, or command, update the affected package README, this repository's architecture/migration docs, and a changelog entry before release. Write a short decision record in `docs/decisions/` for changes in ownership, compatibility or package boundaries.
6. Before committing, inspect `git status --short` and `git diff --cached --name-only`. Never commit credentials, tokens, client data, sessions, live preferences, generated modules, or terminal captures with private content. The `.gitignore` is a guard, not a security audit.

## Version control

Inspect the current branch, working-tree diff and staged diff before changing or committing work. Stage only the requested change and its dependencies; preserve unrelated work from other sessions. Before an authorized push, fetch and inspect divergence. If the remote has advanced while the checkout is dirty, use an isolated worktree or resolve the integration explicitly rather than force-pushing or resetting local work. Report the pushed commit and any remaining divergence. The source checkout’s `AGENTS.md`, under “Version control and collaboration,” contains the full working rules; it is contributor guidance rather than a bundled runtime document.

Test the state that will actually be committed. A passing dirty checkout can depend on files excluded from a partial commit; verify partial runtime commits in isolation. Documentation-only edits need source/claim, link and whitespace checks, not an unrelated model run. Commit and push only when requested; publication and local installation changes remain separate actions.

## Versioning and releases

Commit coherent changes with the tests they require; do not publish from an untested working tree. The private suite manifest already exists. Use tagged releases and a changelog if it is later released. Keep `pi-embeddable-frame` and `pi-ask` versioned as independently installable packages; keep their versions and bundled declarations consistent with the current suite manifest. Pin or review Pi host compatibility separately. A source-only repository commit is **not** a Pi package release.
