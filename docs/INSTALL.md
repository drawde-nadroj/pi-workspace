# Install and maintain the local suite

Use this guide to install this checkout on a computer with a compatible **Pi 1.0 host**, Node.js, npm and Git. Repository access may require authentication. The root is an npm-private local Pi package, not a published npm release.

Extensions execute in Pi's process with its OS access. Review source before installing. This guide does not configure providers, copy credentials or reproduce an entire personal Pi environment.

## Install the checkout

1. Clone to a stable directory outside your Pi agent directory. Use your repository access method; this example uses the repository's HTTPS address:

   ```sh
   git clone https://github.com/drawde-nadroj/pi-workspace.git ~/code/pi-workspace
   cd ~/code/pi-workspace
   npm ci
   npm test
   ```

   `npm ci` installs the locked workspace dependencies and may use the network. Tests require the installed Pi host; see [test environment](../CONTRIBUTING.md#test-environment) if host discovery fails. If cloning fails, check repository access rather than substituting an unrelated package.

2. Register the **root directory** as one personal Pi package:

   ```sh
   pi install "$PWD"
   pi list
   ```

   These commands change the configured Pi agent directory's package declarations. The default is `~/.pi/agent`; `PI_CODING_AGENT_DIR` selects another directory. For a disposable check rather than a personal install, follow [isolated review](ACCEPTANCE.md#repeatable-isolated-review).

   Do not separately register `packages/pi-ask` or Frame alongside the suite. Do not load old personal Workspace/Tasks copies as well. Equivalent local declarations may be deduplicated by Pi, but separate component entries can still duplicate registration. Review any legacy resource exclusions before starting.

3. Start a fresh Pi process. Run `/workspace` and `/tasks` in Pi, not in the shell. `pi list` should identify the root checkout; each command should open its corresponding surface. The Ask agent tools are `ask_user_question`, `ask_questions` and `question_queue`; `/questions` is the user-facing inbox.

Pi loads a local package from its resolved checkout path. It does **not** copy its files or install its dependency tree. Keep the directory and installed dependencies in place. CLI input paths resolve from the command's working directory; relative paths already recorded in settings resolve from that settings file. Using `"$PWD"` avoids that distinction during registration.

## Update an existing checkout

Before updating, preserve your own changes with your normal Git workflow; do not discard them to follow this guide.

```sh
cd ~/code/pi-workspace
git status --short
git pull
npm ci
npm test
```

Stop if Git reports a conflict or tests fail. Start a fresh Pi process after a successful update. `/reload` can refresh ordinary extension code, but may retain imported modules or package export maps. Updating source does not authorize migrations of saved preferences or session data.

## Disable a component or remove the suite

- `/composer off` restores the native editor/header/theme without disabling Tasks or Ask; Workspace's configurable footer remains available.
- `/tasks off` disables Tasks behavior while preserving its plans. `/tasks hide` hides only the dock and leaves tracking/panel access available.
- To remove the whole local suite, use `pi remove` with the source shown by `pi list`, then start fresh. For a checkout registered as above:

  ```sh
  pi remove "$HOME/code/pi-workspace"
  ```

  Adjust the path if your checkout is elsewhere. Do not delete the directory while it is still registered. Removal of the package declaration is not deletion of preferences or session history, and does not undo commands or external effects performed earlier.

## Transfer personal configuration separately

A Git clone does not copy Pi itself, `settings.json`, `auth.json`, `mcp.json`, personal resources, preferences or sessions.

- Reauthenticate providers/MCP services privately. Never put credentials or whole agent directories in Git.
- If restoring package declarations, replace old absolute checkout paths and remove duplicate component entries. Do not both restore a declaration and install a second copy.
- Transfer wanted `pi-workspace.json`, `pi-composer.json` and `pi-tasks.json` individually. Existing `pi-home.json` is a read-only Composer fallback when `pi-composer.json` is absent. `pi-footer.json` is read-only legacy fallback when workspace settings are absent. Optional recap consent has its own `pi-recaps.json`; do not infer consent from unrelated appearance files.
- Session history contains conversations and branch-local plans/questions. Transfer it privately only if needed.

The maintainer's other packages are **optional**, not suite prerequisites: `npm:pi-observational-memory`, `npm:pi-web-access`, and a separate `drawde-nadroj/pi-vim` checkout on `feat/search-motions`. Install those only if you intend to reproduce that environment; they are not needed for `/workspace` or `/tasks`:

```sh
pi install npm:pi-observational-memory
pi install npm:pi-web-access
```

These optional commands may use the network and change personal package declarations. The matching Vim checkout procedure is:

```sh
git clone --branch feat/search-motions git@github.com:drawde-nadroj/pi-vim.git ~/.pi/workspaces/pi-vim
pi install "$HOME/.pi/workspaces/pi-vim"
```

This requires access to that repository and changes personal package declarations. Workspace can operate without Vim; root integration tests use the checkout's pinned development dependency instead. The optional commands above are source-documented transfer paths, not a fresh remote-install test.

For the current maintainer installation and historical backup limitations, see [migration](MIGRATION.md). Do not execute its historical rollback unchanged.
