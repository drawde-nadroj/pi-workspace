# Biolume task system: research and proposed design

Status: research informed the implemented v1; the later user-requested v2 adds **named plans within each session**, **browse-only history with explicit selection**, **reversible archives**, a **raised task panel**, and **automatic dock dismissal of closed plans without deleting history**. The user chose **lightweight tracking without automatic continuation**, **per-session/branch plans**, and an **independent Tasks on/off switch**. Biolume is now a real Home preset, and `pi-tasks` is a separate extension with an optional Home dock/native fallback. See [Home README](README.md), [Tasks README](../pi-tasks/README.md), and [dock v1](DOCK.md) for actual behavior and limits. The recommendation sections below record the design rationale, not a claim that the plugin has been behaviorally benchmarked.

The selected visual direction is Glasshouse / Bioluminescent: evergreen trees, pastel light, wandering fireflies, the cat, and anchored session identity and timing. This document covers the behavioral system that should live inside that design.

This is a targeted engineering review, not a systematic literature review. It combines pinned open-source implementations, live official Claude documentation, and relevant primary-paper abstracts/sections. Benchmark results below motivate design hypotheses; none establishes that this particular pi plugin improves coding performance.

Raw retrievals and source manifest: `/tmp/pi-todo-research/`. Search results were used for discovery, then important claims were checked against primary sources. Official documentation is mutable; the retrieved Claude SDK page describes model-availability defaults starting in Claude Code v2.1.268 / TypeScript SDK v0.3.268. Repository snapshots are pinned below.

## Recommendation in one sentence

Build a **small shared work plan for the user and agent**: stable task IDs, phases, explicit blockers, recorded completion evidence, and durable branch-aware state, presented in a compact Biolume dock with an expandable task view. Do not build a compulsory planning ritual or an unbounded autonomous execution loop.

## 1. What the other harnesses do

### oh-my-pi: a phased execution plan with behavioral follow-through

Inspected snapshot: `can1357/oh-my-pi@2b023d1b80133c523d66412602d99b5427408395`.

- One `todo` tool with `init`, `start`, `done`, `drop`, `block`, `unblock`, `rm`, `append`, and `view` operations.
- Named phases containing tasks. States are `pending`, `in_progress`, `completed`, `abandoned`, and `blocked`; a blocked item can retain a reason.
- Tasks are addressed by their **verbatim content**, not generated IDs. The tool validates uniqueness. Human `/todo` commands additionally support fuzzy matching.
- After a successful mutation, the implementation keeps one active task and automatically starts the first pending task if none is active. Blocked tasks do not auto-start. `view` is read-only.
- Failed mutations are discarded rather than partially committed. State can be reconstructed from committed tool-result details and manual-edit session entries.
- The user can view, edit in an external editor, import/export Markdown, append, change status, and expand/collapse the HUD. Manual deletions explicitly tell the agent not to recreate removed work without permission.
- Completion reminders are enabled by default with a limit of **three**. They can restart the agent when actionable tasks remain, but skip plan mode, recognized requests for user input, pending async wakes, and all-blocked lists. A second guard prevents repeated reminders without intervening action.
- Mid-run reconciliation triggers after twelve successful calls from a named set of potentially mutating tools, at most twice per prompt cycle. This is a heuristic counter, not semantic proof that twelve real edits happened.
- Eager list creation defaults to model discretion; optional preferred/always modes are stronger. The standard tool prompt already encourages comprehensive lists for multi-step requests.

**Borrow:** phases, explicit blocking, bounded reconciliation, user control, atomic mutations, and compact/expanded views.

**Change for us:** stable IDs rather than exact task strings; no automatic claim that the next task is already being worked on; no automatic end-of-run continuation unless the user selects it. Keep cancelled work distinguishable from successful work.

**Source caveat:** `docs/tools/todo.md` says resume strips completed/abandoned tasks. The inspected `TodoTracker.syncFromBranch()` instead restores `getLatestTodoPhasesFromEntries(...)` directly, and the current session callback delegates to that method. Do not treat that older documentation statement as established current runtime behavior. The documented closed-task display timeout is also not equivalent to deleting canonical history.

Sources:
- [Tool and state operations](https://github.com/can1357/oh-my-pi/blob/2b023d1b80133c523d66412602d99b5427408395/packages/coding-agent/src/tools/todo.ts)
- [Tracker, reminder budgets, and stopping guards](https://github.com/can1357/oh-my-pi/blob/2b023d1b80133c523d66412602d99b5427408395/packages/coding-agent/src/session/todo-tracker.ts)
- [Defaults](https://github.com/can1357/oh-my-pi/blob/2b023d1b80133c523d66412602d99b5427408395/packages/coding-agent/src/tools/settings.ts)
- [User commands and manual-edit instructions](https://github.com/can1357/oh-my-pi/blob/2b023d1b80133c523d66412602d99b5427408395/packages/coding-agent/src/modes/controllers/todo-command-controller.ts)
- [Model-facing tool guidance](https://github.com/can1357/oh-my-pi/blob/2b023d1b80133c523d66412602d99b5427408395/packages/coding-agent/src/prompts/tools/todo.md)

### Claude Code: persistent, ID-based tasks, with selective availability

This section describes **officially documented behavior**, not a claim to have inspected proprietary implementation code.

- Where task tracking is available, the modern interface is `TaskCreate`, `TaskUpdate`, `TaskGet`, and `TaskList`; legacy `TodoWrite` rewrites a whole checklist instead.
- Tasks use IDs and incremental updates. Creation IDs come back in tool results, not the proposed tool-call input. A UI should render committed results, not optimistically treat model intent as successful state.
- The task lifecycle uses pending, in-progress, and completed states; updates can delete tasks. The tools support dependencies and ownership.
- `Ctrl+T` toggles up to five visible checklist items. `/tasks` is a different view for running shells/subagents, not the todo checklist.
- Tasks survive context compaction. `CLAUDE_CODE_TASK_LIST_ID` opts sessions into a named list under `~/.claude/tasks/`.
- In agent teams, unresolved dependencies prevent claims; tasks can be assigned or self-claimed; claims use file locking. `TaskCompleted` hooks can reject completion and provide feedback.
- **Important current caveat:** task tools are not universal defaults. The retrieved official docs list Claude 3.x, Opus 4–4.7, Sonnet 4–4.6, and Haiku 4.5 as default-enabled; other/newer or unrecognized model IDs require opt-in. The docs explicitly cite context overhead from tool definitions and reminders and newer models' ability to track work without a written checklist.

**Borrow:** stable IDs, incremental updates, durable state, a compact default view, optional dependencies, and the separation between a work plan and running background jobs.

**Do not assume:** every Claude version/model always uses todos; a successful `TaskUpdate` proves the underlying work was verified; our pi plugin needs four separate tools or a multi-agent team scheduler.

Sources:
- [Tools and availability](https://code.claude.com/docs/en/tools#task-tool-availability)
- [Interactive task list](https://code.claude.com/docs/en/interactive-mode#task-list)
- [SDK task tracking and committed-result monitoring](https://code.claude.com/docs/en/agent-sdk/todo-tracking)
- [Team task coordination and quality hooks](https://code.claude.com/docs/en/agent-teams#assign-and-claim-tasks)

### OpenCode: lightweight session list and a UI slot

Inspected snapshot: `anomalyco/opencode@2fa3363c924c5c3e367b84a87ae478296a0ed59b`.

The inspected `todowrite` tool replaces the session list and returns the updated state. Its prompt asks for meaningful multi-step tracking, immediate updates, and verification before completion; it explicitly skips simple/informational requests. States include cancelled, but there is no distinct blocked state in this interface: its prompt keeps blocked work in progress with a follow-up task.

The TUI todo view is registered as a sidebar-content plugin at order 400, rather than owning the whole shell. It collapses lists longer than two items and hides when every item is completed. Precisely, the predicate is `some(status !== "completed")`, so cancelled items can still keep it visible.

**Borrow:** a task plugin that occupies a shared UI slot, and no checklist for trivial work. **Improve:** explicit blockers, rather than making waiting look like ongoing activity.

Sources: [tool](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/opencode/src/tool/todo.ts), [behavioral prompt](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/opencode/src/tool/todowrite.txt), [sidebar plugin](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/tui/src/feature-plugins/sidebar/todo.tsx).

### Hermes: revisioned state and compact restoration

Inspected snapshot: `NousResearch/hermes-agent@f42f579cf8bac4918ac9599bece71618afadd846`.

Its session-owned store supports IDs, replace/merge writes, optional parent IDs, and snapshot revisions that change when state changes. It bounds item count/content, sanitizes missing/cyclic parents, and restores active tasks after compression while retaining parents needed to explain active children. UI clients can reject stale revisions. These are useful implementation details even without copying the whole hierarchy feature.

**Borrow:** revisioned snapshots, bounded model context, and separate full history versus compact active-state restoration. The comment that finished tasks can provoke repeated work after compression is an implementation rationale, not a controlled empirical result.

Source: [TodoStore and tool](https://github.com/NousResearch/hermes-agent/blob/f42f579cf8bac4918ac9599bece71618afadd846/tools/todo_tool.py).

### Pi itself: use the host's state model

The installed pi 0.99.1 ships `examples/extensions/todo.ts`: a small ID-based list reconstructed from tool-result details on the **active session branch**, including on tree navigation. It is an excellent integration reference, but only demonstrates add/toggle/list/clear—not the richer state machine proposed here.

The installed extension docs also document session custom entries, shared extension events, sequential tools for shared mutable state, and the bounded actionable `agent_before_settle` lifecycle boundary. The TUI docs support persistent widgets near the editor and temporary overlays; we should not assume OpenCode's reserved transcript sidebar exists in pi.

## 2. The useful part of “agent psychology”

The relevant fields are **cognitive architectures, state tracking, planning, external memory, and verification**. Cognitive science can suggest useful decompositions. It does not establish that an LLM needs human-style encouragement, guilt, dopamine rewards, or an unfinished-task compulsion.

| Primary source | What it supports | Applicability limit | Design implication |
| --- | --- | --- | --- |
| [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629), Yao et al., ICLR 2023 | Interleaving reasoning/actions/environment feedback helps maintain and adjust plans in studied QA and interactive tasks. | Not a todo-widget experiment; older models and specific environments. | Let plans change after observations. Do not freeze a speculative initial plan into an immutable script. |
| [Cognitive Architectures for Language Agents (CoALA)](https://arxiv.org/abs/2309.02427), TMLR camera-ready 2024 | A framework distinguishing modular memory, internal/external actions, and decision processes. | Primarily a conceptual organizing framework, not causal evidence for our task UI. | Separate durable task state, short active context, and actions that change the world. |
| [StateAct](https://arxiv.org/html/2410.02810), Rozanov and Rei, 2024 preprint with later revisions | Explicit goals and state tracking improved performance against ReAct in many ALFWorld, WebShop, and Textcraft comparisons. | Not uniformly better in every model/task; no direct test of this coding plugin. | Restore a concise goal/current-state/next-step view instead of relying only on long conversation history. |
| [Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798), Huang et al., ICLR 2024 | Tested models often failed to improve, or got worse, when asked to self-correct reasoning without external feedback. | About intrinsic correction in the tested models/tasks; not a timeless claim that newer models cannot self-correct. | Attach observable checks, artifacts, or user review to completion, rather than treating confidence or a checkmark as proof. |
| [A brain-inspired agentic architecture to improve planning with LLMs](https://www.nature.com/articles/s41467-025-63804-5), Nature Communications, 2025 | Separating decomposition, monitoring, prediction, evaluation, and coordination helped on structured planning/reasoning tasks. | Fully observable/deterministic settings; substantial compute overhead; some limited-run comparisons. | Distinguish “do the work” from “check whether it succeeded,” without reproducing six LLM modules in a small extension. |
| [More Is Not Always Better: Cross-Component Interference in LLM Agent Scaffolding](https://arxiv.org/html/2605.05716), 2026 preprint | Tested combinations of planning, tools, memory, structured reasoning, and reflection can interfere; the best subset depends on task/model. | Short HotpotQA/GSM8K experiments, not long coding runs; strongest multi-seed evidence in the smaller-model setting, effects near noise for the tested Haiku setup. | Make behavioral nudges configurable and measure overhead. More prompts are not automatically better. |

Further reading: [TodoEvolve](https://arxiv.org/html/2602.07839), a 2026 preprint about learned, task-adaptive planning architectures. It argues against a universal fixed planner and evaluates a trained meta-planner on agentic benchmarks. Interesting for future adaptive planning, **not a reason to install another model or planner service for this plugin**.

### Practical engineering evidence, separate from papers

Anthropic's [2025 long-running-agent harness article](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) describes progress files, feature checklists, incremental work, and testing before marking features passing. Its [2026 follow-up](https://www.anthropic.com/engineering/harness-design-long-running-apps) removes parts of the earlier structure as model capability improves, including sprint-by-sprint orchestration, while retaining useful planning and evaluation. These are vendor engineering case studies, not universal controlled findings.

The combined takeaway is **externalize important state, verify outcomes, and use only the scaffolding that earns its cost**.

## 3. Proposed v1 behavior

### The list is a work plan, not a generic personal productivity app

- Automatically useful for substantial multi-step work and explicit user lists; unnecessary for greetings, explanations, or a one-line change.
- Stable IDs; concise human-readable titles; optional phases, dependency IDs, and a short “done when” criterion.
- States: **pending, active, blocked, done, cancelled**. Blocking requires a reason. Cancellation is not success.
- One main focus task by default, but distinguish that UI focus from future parallel delegated work. Do not automatically label the next pending item active before work actually begins.
- Explicit set-status operations, not replay-sensitive toggles. Incremental updates should not silently discard other items.
- User edits, cancellations, and cleared plans take precedence. Do not immediately regenerate something the user intentionally removed.
- A list alone never authorizes more work, broader scope, shell commands, or bypassing an approval.

### Honest completion

Record a short completion note and relevant evidence references: a tool result, test run, artifact, or user acceptance. Keep **agent-reported completion**, **a recorded check**, and **user acceptance** distinguishable. A string saying “tests passed” is not independently verified merely because it is stored in JSON. No extra critic-agent calls by default.

Counts say “3 of 7 tasks done,” not “43% of the effort finished.” Show cancellations separately. Keep blockers visible even when other tasks are complete. A paused or aborted run must not look like a still-working agent just because its last task was active.

### State and model context

Recommended initial scope: **per session/branch**, surviving reload, resume, compaction, and tree navigation. A fork inherits the state at its branch point and then evolves independently. Project-wide sharing should be an explicit separate choice, not an accidental global list under a common working directory.

Use one canonical, versioned state representation and revisioned updates. Derive UI and model summaries from that same state. Persist human changes too; keep closed history accessible while only injecting bounded active context. A new context should see goal, current task, blockers, next steps, and a compact reference to prior outcomes—not the entire task audit log.

Treat task text as data, escape terminal controls, validate references/cycles, and reject stale updates rather than overwriting a newer user edit. Do not parse arbitrary assistant prose to manufacture task completion.

### Reminder policy is a user decision

Recommended default: **agent-managed tracking with lightweight reconciliation, but no automatic restart after a settled response**. Surface open work honestly and let ordinary authorized agent execution continue normally.

An optional bounded continuation mode could use pi's actionable settle hook with a strict per-request budget. It must stop for user cancellation, blockers, questions/approval, no progress, or exhausted budget. This mode incurs additional model calls and needs an explicit choice. Do not implement an unconditional keep-going loop.

## 4. How it fits Biolume

- Promote the selected visual language into the real shell without turning the whole transcript into a dashboard.
- Keep the session name, response duration, and idle clock prominent.
- A compact, collapsible forest scene and responsive task dock near the editor; the transcript retains the main reading area.
- Default task view: phase/goal, the active item, the next useful item or blocker, and a truthful count. Expand to the full editable list and history.
- Use the exact evergreen/pastel roles and spacing from the approved preview. Forest/cat/firefly reactions follow real activity, not simulated progress.
- Keep literal task labels and familiar status symbols. The woodland personality belongs in the surroundings; do not replace “blocked” with an obscure botanical metaphor.
- Completed rows can fold away; they must not disappear from durable history. Decorative motion never makes the user's text shift around.
- Preserve work/ambient/off motion choices, keyboard operation, narrow layouts, native editing/autocomplete, and `/home off` restoration.

### Shared extension boundary

Home owns the editor/header/footer and the dock composition. A separate todo extension owns task state and operations and publishes a versioned, session-scoped snapshot to the Home slot. It should also have a usable native-text fallback without Home. Future plugins reuse semantic colors, spacing, task/status primitives, and lifecycle rules instead of replacing the shell again.

No additional graphics framework, database server, model service, or multi-agent planner is justified for v1.

## 5. Validation before claiming it helps

Engineering tests: invalid transitions, duplicate IDs, stale writes, missing/cyclic dependencies, cancelled-versus-completed counts, durable manual edits, branching, reload, compaction, abort, shutdown, no-Home/headless behavior, overlay focus, narrow Unicode rendering, and timer cleanup.

Behavioral evaluation should compare representative real tasks with tracking off, lightweight tracking, and any stronger reminder policy. Measure missed requirements, premature completion, unneeded continuations, stale statuses, task-tool/token overhead, and successful recovery after interruption. Offline fixtures prove integration correctness, not improved agent reasoning. Run paid model comparisons only with the user's agreement.

## 6. Build sequence

Steps 1–4 are implemented. Step 5's engineering/terminal validation is implemented; real-model behavioral comparisons remain future work and require user agreement.

1. Confirm state scope and continuation policy.
2. Promote Biolume into the real Home shell and establish a small shared dock contract.
3. Add the standalone todo engine, commands, durable state, and bounded context integration.
4. Render real tasks through the Biolume slot and native fallback.
5. Test lifecycle/terminal behavior, then evaluate the behavioral policy on actual work.
