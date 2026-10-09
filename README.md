# Pi workspace source

Source for four related Pi components in **one Git repository**:

| Component | Source | Responsibility |
| --- | --- | --- |
| Frame | [`packages/pi-frame`](packages/pi-frame/README.md) | Reusable frame primitives and opt-in presentation rules; no global UI override |
| Ask | [`packages/pi-ask`](packages/pi-ask/README.md) | Question tools and their temporary input surface |
| Home | [`extensions/pi-home`](extensions/pi-home/README.md) | Editor, footer, transcript surfaces and workspace host |
| Tasks | [`extensions/pi-tasks`](extensions/pi-tasks/README.md) | Plans, task tool, history, and independent fallback |

**Status:** This is a source and test baseline, **not yet a single installable suite**. The running Pi installation still loads the original copies in `~/.pi/agent`; editing this checkout does not change it. Frame and Ask retain their existing package manifests. Do not install this root directory as a Pi package until an explicit suite manifest and migration tests exist.

## Develop

Requires Node.js and npm. Tests use the currently installed Pi host (`~/.pi/agent/install`) unless `PI_HOME_HOST_MODULES` / `PI_ASK_HOST_MODULES` are set to a compatible host's `node_modules` directory. Home's Vim integration tests use `pi-vim` from this checkout's dev dependencies.

```bash
npm ci
npm test
npm run pack:check
```

The root is private and uses npm workspaces for the existing Frame and Ask packages. Tests for Home and Tasks remain in their source directories and preserve their relative imports from `lib/`. This repository intentionally contains **no** authentication, sessions, personal preferences or machine configuration. Before any first commit, check `git status --short` and `git diff --cached --name-only`.

See [architecture](docs/ARCHITECTURE.md), [migration plan](docs/MIGRATION.md), and [contributing](CONTRIBUTING.md). End-user usage remains documented in each component's README, with [footer customization](extensions/pi-home/FOOTER.md) and [Frame feature guide](packages/pi-frame/FEATURE-GUIDE.md) as the current visual-design references.
