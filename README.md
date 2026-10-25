# Pi Egregore

**A thinking environment shaped by what you pursue.**

Develop ideas, make decisions, and carry understanding forward with an agent.

Bring a question, transcript, research topic or project into conversation. The suite helps give that conversation continuity: Quests remembers developing pursuits, Tasks organizes concrete work, Ask brings you into consequential decisions, and Egregore makes the work and its changes visible around Pi’s native editor. Frame supplies the shared terminal presentation primitives.

Use it for learning, writing, research, software development or growing a body of thought. Pi remains the agent host—it owns sessions, model/tool execution and the native editor. The suite adds tools, persistent records and a configurable interface around that host.

## The philosophy

An *egregore* is a thought-form associated with shared attention and intention. Here it is a metaphor for the character that develops through sustained human–agent collaboration: the questions you return to, the vocabulary you refine, the pursuits you choose and the understanding you build together.

**Attention gives a thought a place. Intention gives it direction. Experience gives it substance.** A passing idea can become a conversation, a pursuit, an experiment and a discovery that informs something else. Egregore provides structures for carrying that development forward while leaving room to change direction.

The person supplies purpose and judgment; the agent helps explore, organize, connect and act. The name describes an evolving practice, not a claim of consciousness or an independently acting collective mind. Memory earns its place by helping you resume, deepen, connect or reconsider something that matters.

## From conversation to continuity

1. **Explore a possibility.** Develop an idea in conversation. A worthwhile direction can become a Quest with its purpose, source and first move. Keep it for later or pursue it; a quest can exist without a task plan.
2. **Choose concrete work.** For substantial authorized work, Tasks records a named plan, accepted requests, observable outcomes and progress. Link the plan to a quest when it serves a larger pursuit.
3. **Think and decide together.** Ask handles a question when your answer matters. Immediate questions pause for input; posted questions can wait while independent work continues. Linked questions appear alongside Tasks, with answers, delivery and application kept distinct.
4. **See what is happening.** Egregore presents the Composer, supported chat/tool frames, the Tasks dock and session activity. `/activity` lets you inspect recorded changes; `/egregore` lets you adjust the presentation with preview, Save, Discard and Undo.
5. **Carry understanding forward.** Record meaningful developments, evidence and open questions in the quest. Completion needs a goal and fresh evidence; a useful next direction can deepen the same idea or connect it elsewhere.

This is a flexible flow, not a required pipeline. Ordinary conversation needs no plan, suggestions remain possibilities, and the agent records meaningful progress during conversation rather than continuously monitoring work in the background. The [Quests design explanation](extensions/pi-quests/README.md#directed-memory-continuity-of-a-developing-intention) describes this as **directed memory: continuity of a developing intention**.

## Components and ownership

| Component | Responsibility | Guide |
| --- | --- | --- |
| Egregore | Composer, footer, supported transcript presentation, session activity and `/egregore` | [Egregore](extensions/pi-egregore/README.md) |
| Tasks | Named plans, request coverage, history and independent fallback | [Tasks](extensions/pi-tasks/README.md) |
| Quests | Cross-session pursuits, goals, progress, evidence, connections and exploratory questions | [Quests](extensions/pi-quests/README.md) |
| Ask | Immediate and posted questions, answers and temporary input | [Ask](packages/pi-ask/README.md) |
| Frame | Passive frame primitives and opt-in presentation rules | [Frame](packages/pi-frame/README.md) |
| Contracts | Versioned, data-only dock and posted-question protocols | [Contracts](packages/pi-agent-contracts/README.md) |

The npm-private root package loads **Egregore, Tasks, Ask and Quests once** and bundles Frame and the contracts package as libraries. It is not a published npm release. Do not also load the separate Ask or Frame package entries alongside the suite. A separately developed Chronomancer plugin is not part of this repository.

## Choose a starting point

| I want to… | Start here |
| --- | --- |
| Install, update or transfer the checkout | [Install on another computer](docs/INSTALL.md) |
| Learn preview, accepted edits and Undo without saving | [Try a reversible appearance preview](docs/TRY-PREVIEW.md) |
| Change an appearance setting | [Egregore controls and saving](extensions/pi-egregore/FOOTER.md) |
| Inspect work, requests or questions | [Tasks commands and panel controls](extensions/pi-tasks/README.md#commands) |
| Answer or revise questions | [Ask usage](packages/pi-ask/README.md#best-usage-ask-when-inquiry-is-worth-the-interruption) |
| Resume a pursuit or keep a possibility for later | [Quests journal](extensions/pi-quests/README.md#begin-using-it) |
| Inspect recent quest and task changes | [Session activity](extensions/pi-egregore/README.md#session-activity) |
| Find a setting's purpose and persistence scope | [Settings reference](docs/SETTINGS-REVIEW.md) |
| Develop or integrate a component | [Contributing](CONTRIBUTING.md) and [architecture](docs/ARCHITECTURE.md) |
| Build a Tasks or Ask plugin | [Primitive contracts](docs/PRIMITIVES.md) |

The [documentation index](docs/README.md) connects practical guides, reference, design explanation and verification records. You can enter at the task you need; no mandatory reading sequence applies.

## What persists

- **Quests:** a local SQLite journal in the Pi agent directory, shared across sessions. Egregore visibility uses the resolved working-directory path; all-workspaces visibility retains the original source and home workspace.
- **Tasks, posted Ask questions and session activity:** session-branch records. A quest can retain a dated Tasks snapshot from another session; that snapshot is not live cross-session status.
- **Appearance:** versioned preferences owned by Egregore, with separate operational preferences where documented. Frame stores no plans, answers or pursuits.

These records provide continuity when the agent uses them. Reloading does not automatically backfill past conversations. There is no automatic vault ingestion, Obsidian synchronization or external memory-service integration in the current Quests component.

## Renamed from Pi Workspace

The product and root package are now **Pi Egregore** (`pi-egregore`); the UI extension lives in `extensions/pi-egregore`. `/egregore` opens its settings, with `/workspace` retained as a compatibility alias. Appearance saves to `pi-egregore.json`; existing `pi-workspace.json`, then `pi-footer.json`, are read-only fallbacks until Save. Unsupported primary settings never silently fall back to an older file.

Historical session/event identifiers and existing `PI_WORKSPACE_HOST_MODULES` test overrides remain compatible. The Git remote is still `drawde-nadroj/pi-workspace`; a local rename does not rename the hosted repository. Historical records retain the names used at the time.

## Install on another computer

Use a **Pi 1.3.0-or-newer host** (1.3.0 is the minimum supported; CI also runs the current 1.4.0 release), Node.js **22.23.2 or newer**, npm and Git. Install the checkout's locked dependencies before registering its root as one local Pi package. The [installation guide](docs/INSTALL.md) provides the commands, duplicate-loading cautions and update/removal paths.

Pi loads local source directly; it does not install dependencies or copy the checkout. Keep the directory in place. **Start a fresh Pi process** after package/export or imported-module changes; `/reload` can retain dependencies.

## Develop

From the repository root:

```sh
npm ci
npm test
npm run pack:check
```

Tests need a compatible installed Pi host. See [contributor setup](CONTRIBUTING.md#test-environment) for explicit host overrides and standalone component checks. The root uses npm workspaces for Frame, Ask and the shared contracts; Egregore and Tasks import the versioned contracts package instead of reaching into each other's source. The [opt-in harness](eval/harness/README.md) is development-only: only its README ships in the runtime package, not executable fixtures or review records. Behavioral/model runs require separate authorization and budget.

## Status and boundaries

- Composer is the sole Egregore look in this checkout. Old looks and the fixed-cell `/composer-preview` demo are retired; current appearance work uses `/egregore`.
- Visual settings share `pi-egregore.json`. Egregore/Tasks operational preferences and optional recap consent save separately. Recaps default off when configuration is absent or invalid; see [processing scope](extensions/pi-egregore/README.md#optional-activity-recaps).
- Automated, isolated-terminal and provider/human evidence are distinct. [Acceptance](docs/ACCEPTANCE.md) records current checks and unresolved physical, accessibility and authenticated gates; it is not full release certification.
- The local installation history and backup limitations are in [migration](docs/MIGRATION.md). Do not treat that machine-specific record as a fresh-install or live-rollback recipe.
- This repository contains no personal credentials, sessions, preferences or machine configuration. Before committing, inspect `git status --short` and `git diff --cached --name-only`.

For design boundaries, read [surface workspace specification](docs/SURFACE-WORKSPACE.md), [architecture](docs/ARCHITECTURE.md), and [project terminology](docs/POSITIONING.md). Proposed surface registration is not a shipped API.
