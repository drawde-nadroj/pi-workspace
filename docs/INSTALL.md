# Install and maintain the local suite

Use this guide to install this checkout on a computer with a **Pi 1.3.0-or-newer host** (1.3.0 is the minimum supported; CI also runs the current 1.4.0 release), Node.js, npm and Git. Repository access may require authentication. The root is an npm-private local Pi package, not a published npm release.

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

## Native Windows: supported setup and smoke test

The supported baseline is **Pi 1.3.0 as the minimum host, Node.js 22.23.2 and npm 10.9.8**, with Git for Windows and a writable checkout on local NTFS. CI additionally runs the current Pi 1.4.0 release on Linux; runtime host peers stay `*` per Pi's package contract. Pi requires Node.js 22.19.0 or newer; the suite's Windows CI pins 22.23.2 rather than claiming every newer major version is tested. WSL is a separate Linux environment: do not mix Windows Node with WSL dependencies.

Use a normal, non-elevated Git Bash session. The suite does not require Administrator, Developer Mode or privileged symbolic links. Loader fixtures use directory junctions on Windows. Avoid protected installation directories and network shares; keep the checkout outside OneDrive or similar sync folders if they hold transient file locks.

1. Install Pi 1.3.0 using your Pi installation method, and verify `pi --version`, `node --version`, `npm --version` and `git --version`. Install Git for Windows if Pi cannot find Bash.
2. Clone and install as above. In Git Bash, select your actual Pi host directory using a Windows-compatible absolute path:

   ```sh
   export PI_WORKSPACE_HOST_MODULES="C:/Users/<user>/.pi/agent/install/releases/1.3.0/node_modules"
   export PI_ASK_HOST_MODULES="$PI_WORKSPACE_HOST_MODULES"
   export PI_FRAME_HOST_MODULES="$PI_WORKSPACE_HOST_MODULES"
   npm ci
   npm test
   npm run typecheck --workspace=pi-ask
   npm run pack:check
   ```

   Replace `<user>` and the installation path; npm-installed Pi may live elsewhere. For a reproducible test host without a separate managed installation, after `npm ci` all three variables may instead point to the checkout's `node_modules` (its lockfile contains Pi 1.3.0). These overrides select test dependencies, not your interactive Pi executable. Ask's file-completion integration tests also require `fd` on PATH or in `<agent-dir>/bin`; a normally initialized Pi installs it. For a fresh npm-only test host, explicitly prepare that binary using Pi's downloader (network access required):

   ```sh
   node --input-type=module -e 'import { ensureTool } from "./node_modules/@earendil-works/pi-coding-agent/dist/utils/tools-manager.js"; if (!await ensureTool("fd", s => console.log(s.message))) process.exit(1);'
   ```

   Run this preparation before `npm test` on that fresh host. It downloads a tool into the configured agent directory, not into Git, and needs no administrator access.

   All six stages must complete: Frame, Ask, Workspace, Tasks, harness and suite. Exactly one filesystem test is explicitly skipped on native Windows because Windows forbids newline filenames; portable Git integration and synthetic NUL-delimited newline parsing still run. Capture tests print unique output paths beneath the OS temporary directory. The packed-suite test invokes npm and the selected Pi JavaScript entry points directly, avoiding Windows `.cmd` execution assumptions.

3. Only after tests pass, register the suite in your personal Pi configuration:

   ```sh
   pi install "$(pwd -W)"
   pi list
   ```

   `pwd -W` is Git Bash's Windows-form absolute checkout path. Register only the root, not Ask and Frame separately. This registration is an intentional personal configuration change; the tests use isolated temporary configuration instead.

4. Start a fresh `pi` in Windows Terminal with Git Bash. For the first pass, use the native editor without optional Vim. Test regular mode and then fullscreen mode through Pi's own settings:
   - Open `/workspace`; Tab through Input, Tasks, Ask and Transcript. Change one appearance value, use Undo, then Discard. Resize narrow/wide and check that keyboard navigation and the input cursor remain usable.
   - Open `/tasks`; verify the empty state or existing plan, browse with the keyboard and close without editing it.
   - Open `/questions`; verify the empty inbox or existing questions and close without submitting an answer.
   - Type an unsent draft containing `hello 界面`. Use the app's keyboard paths to open and close a panel while preserving that draft; verify typing, cursor movement and native undo afterward. Do not send the draft merely to test styling.
   - Run `/reload`, reopen all three commands, and check for duplicate UI or errors. Restart Pi once more to check cold loading.

Opening an empty inbox tests registration/navigation, not question answering. For a fuller Ask smoke test, explicitly ask the agent to post a harmless test question; open it in `/questions`, type a note, return without submitting, reopen and check draft recovery. Submit only when you intend to add that test response to the session.

### Optional pi-vim 0.14.2 on Windows

Vim is **not required** for Workspace. Version 0.14.2 internally sends `Ctrl+-` for normal-mode `u`, while Pi 1.3.0 defaults to `Ctrl+Z` on Windows (`Alt+Z` on WSL). Without a matching alias, undo is a no-op even without Workspace; the history has not been erased.

If using this Vim version, merge the following action into your existing `<agent-dir>/keybindings.json`, preserving other actions and any additional undo keys you need:

```json
{
  "tui.editor.undo": ["ctrl+z", "ctrl+-"]
}
```

On WSL retain `alt+z` instead of `ctrl+z`, which is reserved for suspend there. If another action uses `ctrl+-`, resolve that conflict before enabling this compatibility alias. Restart Pi or `/reload`. Workspace does not rewrite your keybindings, patch pi-vim internals or replace its editor. This is a supported configuration workaround for the upstream Vim limitation, not an upstream code fix.

The integration tests use the same alias while retaining the five original undo-preservation assertions. A separate test reproduces the Windows default-key failure without Workspace and then verifies the alias restores undo from the existing history.

With Vim enabled, type `one two 界面`, press Escape, `0`, `x`, then `u`; the entire original text must return. Repeat across opening/closing `/workspace` and after `/reload`. If it fails, check `/hotkeys` and the undo action before attributing the failure to decoration.

CI checks automated behavior, not Windows Terminal rendering, IME positioning or actual human interaction. Keep the interactive smoke-test result separate from a green CI run.

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
