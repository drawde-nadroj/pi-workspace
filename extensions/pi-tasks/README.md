# pi-tasks

An **independent, optional named-plan library** for Pi 1.0.0. Keep separate plans for different requests within one session, browse earlier work, and let finished checklists leave the workspace. Home/Composer is an optional visual host, not the owner of state. Tasks may request one coverage/reconciliation continuation for an agent-edited plan; there is no unbounded execution loop, network request, database, or new runtime package.

## Start

Run `/reload`. Existing single-plan task history is **preserved and migrated in memory** into **Earlier session plan**. Migration does not write merely from opening a session; the next successful mutation saves the new library format. New sessions start with no plans or sample tasks.

The agent is instructed and equipped to create a concise named plan for a **new substantial request**, and update the existing plan for a follow-up. Atomic outcome composition is model guidance backed by validated requirement records, not a semantic proof of completeness. Eligible edited plans receive at most one additional coverage/reconciliation request. Trivial requests need no plan. Older plans—including unfinished ones—are retained, not overwritten.

## Commands

| Command | Behavior |
| --- | --- |
| `/tasks` or `/tasks show` | Open the current plan in a distinct, raised panel |
| `/tasks history` | Browse all saved plans, including completed and archived ones |
| `/tasks prev` / `/tasks next` | Move the three-task window one task; freeze the view without changing agent work |
| `/tasks follow` | Follow the active task again |
| `/tasks view focus` | Save the three-task appearance (default) |
| `/tasks view compact` | Save the earlier compact checklist appearance |
| `/tasks new Fix the search page` | Create/select a named plan without replacing older plans |
| `/tasks new` | Ask for a plan name |
| `/tasks use p2` | Make an existing non-archived plan current; does not run it |
| `/tasks archive` or `/tasks archive p2` | Remove a plan from the dock/current selection, preserving its contents; unfinished plans require confirmation |
| `/tasks restore p2` | Unarchive a plan and make it current; does not restart tasks |
| `/tasks rename A better name` | Rename the current plan |
| `/tasks add Some work to do` | Add a task yourself; create a fresh plan if none is current |
| `/tasks clear` | Confirm clearing the current plan's tasks; block agent regeneration until an explicit New/Add |
| `/tasks hide` | Hide only the dock; keep tracking and `/tasks` panel access active; save this preference |
| `/tasks unhide` | Restore dock visibility without enabling Tasks if it is off |
| `/tasks off` | Disable the tool, fresh context reminders and task UI; preserve **all plans** |
| `/tasks on` | Re-enable Tasks with its library and current selection intact |

Plan IDs (`p1`, `p2`, …) appear in history. Task IDs (`t1`, `t2`, …) are local to each plan. You do not need IDs for ordinary panel navigation.

**To hide visuals without changing work, use `/tasks hide`.** This removes the Tasks dock from Home and the native fallback. It does not hide transcript tool cards, disable tracking, change plans, or prevent `/tasks` from opening the panel. The preference survives reload and off/on; `/tasks unhide` restores normal dock behavior.

**Archive is the normal way to dismiss work**, not Clear. Archive is reversible and retains the readable checklist, notes and evidence. Clear empties a plan after confirmation; older raw session entries remain, but its previous task contents are not a separate item in the plan library. No automatic deletion or pruning is performed.

## Completed plans get out of the way

The visible Tasks dock now uses the same active Pi accent (purple in the Composer palette) and border-matched title as assistant messages, both above Home's composer and in its independent native fallback. The `tasks` tool's call and result each have a matching purple frame; task bodies retain readable text and separate warning/error colors. Tiny terminals use unframed rows. Framing does not make the dock permanent after closure: when every task is done or cancelled **and** every recorded requirement is either linked entirely to done tasks or explicitly superseded, it shows a brief **Plan closed · … · saved in /tasks** acknowledgment; after approximately **four seconds**, the entire plan dock disappears and the editor reclaims its space. The plan and its outcomes remain available through `/tasks` and `/tasks history`.

- Counts distinguish completed tasks from cancellations; an all-cancelled plan is not reported as successfully completed.
- Resume/reload does not replay an old completion acknowledgment. A recent one uses its original expiry rather than restarting four seconds.
- The expiry changes only the display. It writes no new history, makes no model call, and never continues the agent.
- Inspecting or selecting a finished plan does not recreate the dock. Adding work or explicitly reopening a task makes the plan open again.
- Closing/archiving a plan does not silently select or start another unfinished plan.
- There is at most one current plan. Others are paused records; task status is not proof that work is executing.

## Panel controls

The modal has an **opaque raised surface, accent perimeter and contrasting selection fill**, including when Home is absent. Its height adapts to the list rather than reserving a full screen for two tasks. Unicode titles, narrow panes and long details are clipped/wrapped within the available area.

### Plan view

- **Up/Down:** choose a task
- **D:** full scrollable task details; Up/Down scrolls
- **Q:** read-only requirement coverage: original request source, acceptance condition, linked task IDs, and disposition; Up/Down scrolls, Q/Escape returns
- **Enter:** edit a task in the current plan: status, title, phase, completion criterion, dependencies or outcome/evidence
- **A:** add a task to the current plan
- **H / Tab:** open the plan library
- **N:** create a named plan
- **T:** rename the viewed plan
- **X:** archive the viewed plan (confirm if unfinished)
- **S:** make a historical non-archived plan current
- **R:** restore an archived plan and make it current
- **C:** clear the current plan's tasks, with confirmation
- **O:** turn Tasks off
- **Escape:** return from details/history, or close the panel
- **Ctrl+C:** close the panel directly

### Plan library

Up/Down selects a plan; Enter **opens it for inspection**. Browsing history does **not** change the current plan, task statuses or execution. The detail view labels it **History** or **Archived** and offers explicit **S make current** / **R restore** actions. N creates a new plan.

The default **Focus** dock is a three-task window in authored order, with stable positional numbers and a `Tasks 3–5 of 8` heading. It follows the active task until you browse with `/tasks prev` or `/tasks next`; `/tasks follow` resumes following. Manual browsing changes neither task state nor the library revision. The heading distinguishes **Following**, **Now working: N**, **Paused: N**, **Last worked on: N**, and **Not started**. Last worked on is view-local history, not a completion claim. Selecting another plan or restoring a session/branch resets the view; compaction preserves it.

Focus titles wrap within a fixed physical-line budget at each terminal height. Active text gets spare lines first; an ellipsis marks clipped text. Unused rows are not padded: short titles use only the lines they need. The full panel wraps task titles; **D** opens the complete scrollable task details when a title exceeds the panel viewport. Transcript task cards also wrap. Terminal resize can change the height budget; completion/off/archive retain their existing hide behavior.

**Compact** keeps the earlier appearance: short checklists retain authored order and completed steps; long lists prioritize focus/blockers with an exact `+ N more · /tasks` row. `/tasks` always retains the full list and plan name. Active tasks are labeled **paused** when their plan is not current or the agent is not running. Appearance is saved separately from task history; `prev`, `next`, and `follow` switch to Focus for the current runtime without saving a preference.

Transcript tool cards show the operation and committed task titles with explicit statuses, rather than raw implementation details. Single-task updates show only the changed task, and additions show the added tasks. Full titles wrap without an ellipsis or task-count cutoff. Plan creation includes the new name; history listings and plan switches have concise renderers.

## Independent controls

**`/tasks off` does not change Home, its forest, gaze, editor, identity or timing.** The enabled setting and appearance preference persist in `~/.pi/agent/pi-tasks.json` (or the configured agent directory), separately from Home. Atomic preference saves use mode 0600. Corrupt preferences fail closed instead of silently re-enabling Tasks.

Home off/removal does not disable Tasks. Tasks uses its own compact native widget and theme-aware raised panel. Turning Tasks off is not the same as cancelling the agent's ordinary work: it blocks task mutations immediately, but cannot erase information already sent in an in-flight request or historical transcript messages.

To uninstall, move `pi-tasks` outside `~/.pi/agent/extensions/`, then `/reload`. Leave `~/.pi/agent/lib/home-dock.ts` if either extension still needs it. Saved task entries are inert metadata when the extension is absent.

## State, scope and honesty

- **Bounded coverage and reconciliation:** on successful settlement, if this run edited the selected plan's tasks or requirements, Tasks may use `agent_before_settle` for **one** hidden reminder and additional model request—even when all recorded tasks are closed. The reminder asks the agent to compare accepted requests and follow-ups in the conversation against both requirement records and tasks, not merely check its own completion count. The agent should reconcile changed steps and truthfully account for remaining work; it may continue only work already authorized by the user's request, otherwise explain or ask. This is not a mandate to complete every task or a guarantee of follow-through. All-blocked plans without structural coverage gaps, user-cleared plans, carried-over untouched plans, unselected plans, aborted/error runs, queued-message boundaries and disabled Tasks do not trigger it. Pi evaluates continuation eligibility after appending the reminder; pre-append `canContinue=false` alone is not a veto. No `turn_end` loop or background critic. Selecting/restoring a plan never starts the agent. The extra request has token/cost impact and could produce another assistant message; it cannot infer task outcomes without the agent's judgment.
- **Per-session, branch-aware library:** reload/resume/compaction restore the library. Forks inherit the branch-point plans and evolve independently. This is not a shared project backlog.
- **Pending / active / blocked / done / cancelled:** at most one active focus task per plan. Switching does not automatically activate a task or mark the old one done.
- **Dependencies:** blocked needs a reason; starting/completing requires completed dependencies; cycles and unknown IDs are rejected. Dependencies are within a plan, not across plans.
- **Completion:** done requires a truthful outcome note. Evidence references are not independent verification. The panel preserves note attribution separately from the latest editor.
- **User precedence:** the agent cannot reopen user-closed tasks, restore an archive, or regenerate a cleared plan by creating another one. A user New/Add unlocks the cleared-plan guard. Agent archival is limited to already-closed plans; unfinished archival is a confirmed user action.
- **Optimistic concurrency:** every write requires the current **library revision**, including creates and switches. A stale tool call/dialog cannot write to a newly selected plan. Historical task writes require selecting the plan first.
- **Durability:** sequential tools persist canonical metadata before publishing success. Failed storage/validation leaves the visible library unchanged.
- **Bounds:** at most 100 saved plans, 100 tasks and 100 requirement records per plan, 20 task links per requirement, 400 KB per task snapshot and 2 MB per library snapshot. A limit produces an explicit error; older plans are never silently evicted. Full snapshots mean the session log can grow over long sessions.
- **Bounded context:** selected-plan hydration includes at most 16 open tasks and 12 requirement records (gaps first), plus metadata for up to five other unfinished plans. Full history is accessible through paginated tools. Task titles are data, not instructions or permission to expand scope.

Canonical custom entries retain the **`pi-tasks:plans-v2`** entry key but now store **payload version 3**. Keeping the key makes older v2 readers encounter an unsupported payload and fail closed instead of skipping new records and restoring stale plans. Version-2 libraries and legacy **`pi-tasks:plan-v1`** snapshots are validated and migrated in memory, including notes, evidence, dependencies, monotonic task IDs and user locks; older plans receive an empty requirement ledger, never invented provenance. The next mutation writes version 3. Unknown payload versions and malformed requirement records block writes. Downgrading the extension cannot edit version-3 sessions safely. Restoration reads only `sessionManager.getBranch()`. Corrupt snapshots are not silently replaced; writes are blocked until an explicit user reset.

The feature uses context tokens while enabled, and eligible edited runs may incur one extra continuation. Normal tool execution and model follow-up requests inside that continuation still have token/cost impact; the one-shot guard bounds Tasks' continuation requests, not the entire agent loop. A hidden, branch-local reconciliation message remains in model context during that run's reconciliation work; older such messages are filtered from later model calls. No real-model benchmark of improved follow-through is claimed.

## Agent tool

The model-facing `tasks` tool supports:

- **`plans`** — paginated saved-plan metadata and current selection
- **`create`** — `revision`, concise `title`, optional pending `items` and accepted `requirements`; select the new plan without losing old ones
- **`select`** — `revision`, `planId`; select an existing non-archived plan
- **`rename`** — `revision`, `planId`, `title`
- **`archive`** — `revision`, `planId`; agent may archive closed plans only
- **`list`** — tasks/revision, optional `planId`, `offset`, `limit`; reading history does not select it
- **`add`** — `revision`, `planId`, `items`; add to the current plan
- **`update`** — `revision`, `planId`, task `id`, `changes`
- **`requirements`** — without `requirements`, read a page with optional `planId`, `offset`, `limit`; with `requirements`, require `revision` and append or amend records in the current plan. Other operations reject this field rather than silently ignore it.

### Evidence-based stopping and reconciliation

Use existing `doneWhen` and requirement `acceptance` fields to define observable outcomes and sufficient verification before checks expand. Additional checks should address a distinct risk, changed state, inconclusive result, or known instability—not repeat successful checks for reassurance. Unfinished or unverified work stays explicitly unresolved; do not weaken acceptance conditions to stop sooner.

The existing one-shot checkpoint still compares original requests and follow-ups against both records and actual work, even for apparently closed plans. It now distinguishes missing requested work, record-only updates supported by existing evidence, unresolved evidence/blockers, and optional improvements outside authorization. Record-only reconciliation should not trigger repeated checks or a second completion announcement without material new information. Guards, state transitions, and schemas are unchanged: this is model guidance, not an independent completion verifier.

The offline comparison workflow is in `eval/harness/README.md` at the suite root. No model-performance improvement is claimed by the deterministic tests.

### Atomic outcomes and request coverage

Capture each independently verifiable user-visible outcome, even a small wording change. Do not create a task for every tool call. Use `doneWhen` for task-level checks and a requirement's `acceptance` for the requested outcome. A follow-up appends requirements to the same plan; an unrelated request gets another plan. Exploratory suggestions are not accepted work unless authorized.

A new requirement supplies `title` (200 characters), `source` (800: an exact quote or accurate request reference), `acceptance` (400), and optional `taskIds` (existing IDs in the same plan). IDs `r1`, `r2`, … are assigned and never reused. Create can link to its newly assigned `t1`, `t2`, …; read `addedIds` before linking later additions.

```json
{
  "op": "requirements",
  "revision": "<current revision>",
  "requirements": [{
    "title": "Clarify added-task wording",
    "source": "User: it still says added task: pending",
    "acceptance": "The result card says not started; stored status is unchanged",
    "taskIds": ["t2"]
  }]
}
```

To remap, send `{ "id": "r1", "taskIds": ["t2"] }`. Original title/source/acceptance are immutable. A changed request requires an explicit `{ "id": "r1", "disposition": "superseded", "reason": "..." }` and a new record if replacement work is authorized. Superseded records are read-only. The agent cannot overwrite user-authored requirement edits. Explicit user Clear retires accepted requirements and removes task links without letting the agent recreate them; prior snapshots remain in session history.

Coverage reports **uncovered**, **open**, **needs disposition** (a linked task was cancelled), **reported done**, or **superseded**. Cancelled tasks do not satisfy accepted requirements. A structural gap prevents the plan's closure acknowledgment/auto-hide and agent archival; `/tasks` offers Q coverage. An empty ledger says coverage is not established but retains legacy task closure behavior. Read pages contain at most 20 records; the panel can scroll the full ledger.

These checks validate structure, not meaning: source references and outcomes are agent reports, and a link does not prove a task satisfies the request. The final checkpoint instructs the model to compare against available conversation context, recover source context when needed, and disclose uncertainty rather than invent missing context. No mechanism guarantees that every natural-language requirement was recognized. No paid-model success rate is claimed.

List/history pages default to 20 and are capped at 20. Mutation responses include assigned IDs and the new library revision. The visible Add/Create result uses one `+ Added N tasks · not started` acknowledgment followed by `○`-prefixed titles; `pending` remains the stored status, not an approval request. This does not change the `/tasks` status controls or turn a successful add into a completion claim. `planId` defaults to current where meaningful; an initial legacy-style Add can create the first unnamed session plan for compatibility, but cannot overwrite or silently recreate a plan from history. Long tool-result notes are explicitly shortened; the panel retains full text.

Only the user controls enable/disable, restores archived plans and clears lists. Archive is not deletion. Creating/selecting a plan never authorizes additional work beyond the user's request.

## Persistent overview in Home

The Home host now consumes a separate, data-only overview: sourced done/total/blocker/cancelled counts, active identity, and open tasks ordered active → blocked → pending. This does not reorder the stored plan or change any task status. Completed work stays in the counts and full `/tasks` browser rather than occupying the persistent overview.

Customize this surface through **`/footer` → Tasks**. Home uses the reusable `pi-embeddable-frame` presentation rules and its existing clock. Default motion is a soft travelling highlight during actual active work, with a bounded sweep on progress changes; waiting, typing, dialogs, hidden/narrow frames and motion-off stay still. Demo states in settings never create tasks or start a run.

The legacy `/tasks prev`, `next`, `follow`, and `view focus|compact` controls remain available for the independent native fallback. They do not page the new Home overview away from active work. `/tasks hide`, `off`, closure expiry and history remain unchanged. The shared `tasks` tool-call/result frame styling is unchanged; result wording and requirement coverage are described above.

## Optional Home integration

`~/.pi/agent/lib/home-dock.ts` defines the small, versioned event protocol. `~/.pi/agent/lib/task-frame.ts` defines the shared visual frame using the active theme's Pi accent. Home and Tasks do not import each other's implementations.

- Home advertises availability and optional semantic colors.
- Tasks publishes only the current plan's bounded display snapshot—or an empty snapshot once hidden/archived/off.
- Home acknowledges mounting; otherwise Tasks keeps a native fallback, without duplicate widgets.
- Timers and subscriptions are session-scoped. Expiry is cancelled on shutdown/off, and is absent in non-TUI modes.
- Only Home owns the editor/header/footer. Tasks never replaces them.

This is an interoperability convention among trusted extensions, not a security boundary. See `../pi-home/DOCK.md` for the production protocol. Earlier design research remains in Git history, not in the current interface.

## Validation

```sh
cd /Users/jordan/code/pi-workspace && npm run test:tasks && npm run test:home
```

Tests use installed pi packages rather than duplicate dependencies. Coverage includes v1 migration, plan isolation, archive protections, library-wide revisions, history pagination, bounded settle reconciliation and no-loop/abort/off/selection guards, completion expiry, failed storage, branch/compaction restoration, user precedence, off/on and headless behavior, browse-only navigation, stale dialogs, explicit modal backgrounds, Unicode/narrow layouts and Home integration. Strict TypeScript checks cover both extensions and the bridge.

Offline fullscreen/regular PTY tests execute actual plan-creation/task tool calls, verify dock auto-hide and retained history, exercise New/Add dialogs, browse/select/archive/restore, independent toggles, reload, no-Home rendering, panel contrast, details, resize and saved settings. Real terminal captures were reviewed at 110×40 and 64×24. Fixtures are under `/tmp/pi-home-research/`, not installed in normal sessions. No paid model evaluation was run.
