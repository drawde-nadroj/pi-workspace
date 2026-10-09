# Pi workspace suite (private)

Source for four related Pi components in **one Git repository**:

| Component | Source | Responsibility |
| --- | --- | --- |
| Frame | [`packages/pi-frame`](packages/pi-frame/README.md) | Reusable frame primitives and opt-in presentation rules; no global UI override |
| Ask | [`packages/pi-ask`](packages/pi-ask/README.md) | Question tools and their temporary input surface |
| Home | [`extensions/pi-home`](extensions/pi-home/README.md) | Editor, footer, transcript surfaces and workspace host |
| Tasks | [`extensions/pi-tasks`](extensions/pi-tasks/README.md) | Plans, task tool, history, and independent fallback |

**Status:** The private root package `pi-workspace-suite` now has an explicit Pi manifest for Home, Tasks and Ask. Frame is bundled as a library; Ask and Frame also retain their standalone package manifests. A packed suite was installed and cold-loaded in an isolated Pi agent directory; a partial interactive terminal review and rollback-settings drill are recorded in [acceptance](docs/ACCEPTANCE.md). Physical IME and human visual checks remain open. This is **not published or enabled in your live Pi installation**: it still loads the original copies in `~/.pi/agent`. Do not install the suite there alongside them, as that would double-register resources.

## Develop

Requires Node.js and npm. Tests use the currently installed Pi host (`~/.pi/agent/install`) unless `PI_HOME_HOST_MODULES` / `PI_ASK_HOST_MODULES` are set to a compatible host's `node_modules` directory. Home's Vim integration tests use `pi-vim` from this checkout's dev dependencies.

```bash
npm ci
npm test
npm run pack:check
```

`npm test` includes a package smoke test that packs the root, installs it into a temporary npm prefix without network access, then asks a separate `PI_CODING_AGENT_DIR` to load it. The test cleans up its temporary directory. For a local source installation in another isolated agent directory, run `npm ci` first: Pi does not install dependencies for local packages. For a packed installation, Frame is already bundled; Pi host modules remain peers and are not packaged. The root is intentionally private and cannot be published by accident.

The root is private and uses npm workspaces for the existing Frame and Ask packages. Tests for Home and Tasks remain in their source directories and preserve their relative imports from `lib/`. This repository intentionally contains **no** authentication, sessions, personal preferences or machine configuration. Before committing, check `git status --short` and `git diff --cached --name-only`.

See [architecture](docs/ARCHITECTURE.md), the [surface workspace specification](docs/SURFACE-WORKSPACE.md), [isolated acceptance and remaining human checks](docs/ACCEPTANCE.md), [project language for sharing and teaching](docs/POSITIONING.md), [migration plan](docs/MIGRATION.md), and [contributing](CONTRIBUTING.md). End-user usage remains documented in each component's README, with [footer customization](extensions/pi-home/FOOTER.md) and [Frame feature guide](packages/pi-frame/FEATURE-GUIDE.md) as the current visual-design references.
