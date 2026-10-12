# Pi workspace suite

Source for four related Pi components in **one Git repository**:

| Component | Source | Responsibility |
| --- | --- | --- |
| Frame | [`packages/pi-frame`](packages/pi-frame/README.md) | Reusable frame primitives and opt-in presentation rules; no global UI override |
| Ask | [`packages/pi-ask`](packages/pi-ask/README.md) | Question tools and their temporary input surface |
| Home | [`extensions/pi-home`](extensions/pi-home/README.md) | Editor, footer, transcript surfaces and workspace host |
| Tasks | [`extensions/pi-tasks`](extensions/pi-tasks/README.md) | Plans, task tool, history, and independent fallback |

**Status:** The npm-private root package `pi-workspace-suite` has an explicit Pi manifest for Home, Tasks and Ask. Frame is bundled as a library; Ask and Frame also retain their standalone package manifests. Home is Composer-only in this checkout, including on a fresh install; retired presets and the old design lab have been removed. A packed suite was installed and cold-loaded in an isolated Pi agent directory; a partial interactive terminal review and rollback-settings drill are recorded in [acceptance](docs/ACCEPTANCE.md). Physical IME and human visual checks remain open. After explicit approval, the live `~/.pi/agent/settings.json` now loads this checkout once and excludes the older Home/Tasks auto-discovery entries; the originals remain backed up and on disk. A fresh Pi process is required to use the suite in an existing session. The package is **not published**; do not also load the separate Frame/Ask package entries, as that would double-register resources.

## Install on another computer

This is a **public Git repository and local Pi package**, not an npm release. A Pi package is a directory with a `package.json` manifest telling Pi which extensions to load. The root package loads Home, Tasks and Ask; Frame is their runtime library. The optional Chronomancer prototype under `packages/chronomancer/` is **not** loaded by the root package.

1. Install [Pi](https://pi.dev/) (use a compatible Pi 1.0 host), Node.js, npm and Git. Clone the repository and install its locked dependencies:

   ```bash
   git clone https://github.com/drawde-nadroj/pi-workspace.git ~/code/pi-workspace
   cd ~/code/pi-workspace
   npm ci
   npm test
   ```

2. Register the **root directory** as one personal Pi package (not the separate Ask or Frame subdirectories):

   ```bash
   pi install "$PWD"
   pi list
   ```

   Pi loads a local package directly from its checkout; it does **not** copy its files or run `npm install` for it. Keep the checkout and its installed dependencies in place. Run `git pull` and `npm ci` in that directory when updating, then start a fresh Pi process. Check `/workspace` and `/tasks` in Pi. The Ask tools are `ask_user_question` and `ask_questions`.

3. Recreate anything you want from the *old machine's* `~/.pi/agent/` separately. In particular, this repository does not contain Pi itself, `settings.json`, `auth.json`, `mcp.json`, personal extensions/skills/prompts, saved preferences, or session history. The current machine also loads `npm:pi-observational-memory`, `npm:pi-web-access`, and a **separate** `pi-vim` checkout from `drawde-nadroj/pi-vim` on branch `feat/search-motions`. Use `pi install npm:pi-observational-memory` and `pi install npm:pi-web-access` if you want those packages. For the matching Vim checkout:

   ```bash
   git clone --branch feat/search-motions git@github.com:drawde-nadroj/pi-vim.git ~/.pi/workspaces/pi-vim
   pi install "$HOME/.pi/workspaces/pi-vim"
   ```

   If you restore an old `settings.json`, **edit its absolute suite path** to the new checkout, remove obsolete or duplicate package entries, and do not also install the suite with `pi install` a second time. Review exclusions for any old personal Home/Tasks extensions. To preserve visual settings, transfer `pi-workspace.json`, `pi-home.json`, and `pi-tasks.json` individually if they exist; `pi-footer.json` is a legacy read fallback. Sessions (including branch-local plans) are separate and may contain sensitive conversations. Transfer them privately only if wanted. Reauthenticate Pi providers and MCP services on the new machine; never put credentials or sessions in Git.

**Sanity check:** `pi list` should show one suite entry at the new path; in a fresh Pi process, `/workspace` and `/tasks` should open. On this machine the suite is loaded from an absolute local path and the old personal Tasks extension is excluded in settings; neither choice is automatically reproduced by a Git clone. See your installed Pi documentation (`docs/configuration.md`) for the agent directory layout.

## Develop

Requires Node.js and npm. Tests use the currently installed Pi host (`~/.pi/agent/install`) unless `PI_HOME_HOST_MODULES` / `PI_ASK_HOST_MODULES` are set to a compatible host's `node_modules` directory. Home's Vim integration tests use `pi-vim` from this checkout's dev dependencies.

```bash
npm ci
npm test
npm run pack:check
```

`npm test` includes a package smoke test that packs the root, installs it into a temporary npm prefix without network access, then asks a separate `PI_CODING_AGENT_DIR` to load it. The test cleans up its temporary directory. For a local source installation in another isolated agent directory, run `npm ci` first: Pi does not install dependencies for local packages. For a packed installation, Frame is already bundled; Pi host modules remain peers and are not packaged. The root is intentionally private and cannot be published by accident.

The [opt-in harness comparison kit](eval/harness/README.md) provides six synthetic scenarios, external artifact checks, and paired review reports. `npm run test:harness` runs deterministic offline tests (also included in `npm test`); `npm run eval:harness -- list` shows the operator scripts. It never starts a model or reads personal sessions. Behavioral runs require separate authorization and budget. This development kit is not loaded by Pi or included in the runtime package.

The root manifest is marked `private: true` for npm and uses npm workspaces for the existing Frame and Ask packages. Tests for Home and Tasks remain in their source directories and preserve their relative imports from `lib/`. This repository intentionally contains **no** authentication, sessions, personal preferences or machine configuration. Before committing, check `git status --short` and `git diff --cached --name-only`.

See [architecture](docs/ARCHITECTURE.md), the [surface workspace specification](docs/SURFACE-WORKSPACE.md), [isolated acceptance and remaining human checks](docs/ACCEPTANCE.md), [project language for sharing and teaching](docs/POSITIONING.md), [migration plan](docs/MIGRATION.md), and [contributing](CONTRIBUTING.md). End-user usage remains documented in each component's README, with [footer customization](extensions/pi-home/FOOTER.md) and [Frame feature guide](packages/pi-frame/FEATURE-GUIDE.md) as the current visual-design references.
