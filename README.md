# Pi workspace suite

A local Pi package for Composer appearance, work plans and interactive questions. Pi remains the agent host: it owns sessions, model/tool execution and the native editor. This repository supplies four components with separate responsibilities.

| Component | Responsibility | Guide |
| --- | --- | --- |
| Workspace | Native Composer decoration, footer, eligible transcript adapters and `/workspace` | [Workspace](extensions/pi-workspace/README.md) |
| Tasks | Named plans, request coverage, history and independent fallback | [Tasks](extensions/pi-tasks/README.md) |
| Ask | Immediate and posted questions, answers and temporary input | [Ask](packages/pi-ask/README.md) |
| Frame | Passive frame primitives and opt-in presentation rules | [Frame](packages/pi-frame/README.md) |

The npm-private root package loads **Workspace, Tasks and Ask once** and bundles Frame as a library. It is not a published npm release. Do not also load the separate Ask or Frame package entries alongside the suite. Optional Chronomancer is not loaded by the root manifest and is outside these guides.

## Choose a starting point

| I want to… | Start here |
| --- | --- |
| Install, update or transfer the checkout | [Install on another computer](docs/INSTALL.md) |
| Learn preview, accepted edits and Undo without saving | [Try a reversible appearance preview](docs/TRY-PREVIEW.md) |
| Change an appearance setting | [Workspace controls and saving](extensions/pi-workspace/FOOTER.md) |
| Inspect work, requests or questions | [Tasks commands and panel controls](extensions/pi-tasks/README.md#commands) |
| Answer or revise questions | [Ask usage](packages/pi-ask/README.md#best-usage-ask-when-inquiry-is-worth-the-interruption) |
| Find a setting's purpose and persistence scope | [Settings reference](docs/SETTINGS-REVIEW.md) |
| Develop or integrate a component | [Contributing](CONTRIBUTING.md) and [architecture](docs/ARCHITECTURE.md) |

The [documentation index](docs/README.md) connects practical guides, reference, design explanation and verification records. You can enter at the task you need; no mandatory reading sequence applies.

## Install on another computer

Use a compatible **Pi 1.3.0 host**, Node.js, npm and Git. Install the checkout's locked dependencies before registering its root as one local Pi package. The [installation guide](docs/INSTALL.md) provides the commands, duplicate-loading cautions and update/removal paths.

Pi loads local source directly; it does not install dependencies or copy the checkout. Keep the directory in place. **Start a fresh Pi process** after package/export or imported-module changes; `/reload` can retain dependencies.

## Develop

From the repository root:

```sh
npm ci
npm test
npm run pack:check
```

Tests need a compatible installed Pi host. See [contributor setup](CONTRIBUTING.md#test-environment) for explicit host overrides and standalone component checks. The root uses npm workspaces for Frame and Ask; Workspace/Tasks keep their source imports from `lib/`. The [opt-in harness](eval/harness/README.md) is development-only: only its README ships in the runtime package, not executable fixtures or review records. Behavioral/model runs require separate authorization and budget.

## Status and boundaries

- Composer is the sole Workspace look in this checkout. Old looks and the fixed-cell `/composer-preview` demo are retired; current appearance work uses `/workspace`.
- Visual settings share `pi-workspace.json`. Workspace/Tasks operational preferences and optional recap consent save separately. Recaps default off when configuration is absent or invalid; see [processing scope](extensions/pi-workspace/README.md#optional-activity-recaps).
- Automated, isolated-terminal and provider/human evidence are distinct. [Acceptance](docs/ACCEPTANCE.md) records current checks and unresolved physical, accessibility and authenticated gates; it is not full release certification.
- The local installation history and backup limitations are in [migration](docs/MIGRATION.md). Do not treat that machine-specific record as a fresh-install or live-rollback recipe.
- This repository contains no personal credentials, sessions, preferences or machine configuration. Before committing, inspect `git status --short` and `git diff --cached --name-only`.

For design boundaries, read [surface workspace specification](docs/SURFACE-WORKSPACE.md), [architecture](docs/ARCHITECTURE.md), and [project terminology](docs/POSITIONING.md). Proposed surface registration is not a shipped API.
