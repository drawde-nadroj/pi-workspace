# Primitive contracts

How to build a Tasks or Ask plugin against this suite without copying it. These
are the interfaces between independently loaded extensions; implementation
stays with its owner. Source of truth for the shared types is the
`pi-agent-contracts` package, imported as `pi-agent-contracts/dock` and
`pi-agent-contracts/posted`.

A worked example is `examples/minimal-plan-dock`: one tool, one session entry,
one tool renderer, one validated snapshot, ~150 lines.

## What a primitive is here

A primitive is a Pi extension that:

- registers tools whose **parameters** are the public input contract;
- publishes versioned, **validated** events (`pi.events`) instead of exposing
  objects, components or callbacks;
- keeps state in **session entries** (`pi.appendEntry`) and its own preference
  file — never in this repository, and never in another component's store;
- works with the other components absent, falling back to its own UI.

Owning components: Tasks owns `tasks` and `/tasks`; Ask owns the question tools
and `/questions`; Workspace owns the editor, footer, transcript and the dock
that renders provider rows; Frame owns drawing primitives only.

## Ask contract

### Tools

| Tool | Mode | Parameters | Result `details` |
| --- | --- | --- | --- |
| `ask_user_question` | pauses for one answer | `{ question: string; details?: string; options?: Option[]; multiSelect?: boolean }` | `AskUserQuestionResultDetails` |
| `ask_questions` | pauses; sequential batch with Review | `{ questions: Array<{ question: string; label?: string; details?: string; options?: Option[]; multiSelect?: boolean }> }` (min 1) | `BatchQuestionResultDetails` |
| `question_queue` | durable, does not pause | `{ op: "post" \| "list" \| "apply" \| "withdraw" \| "replace"; question?: Input; id?: string; revision?: integer ≥ 1; reason?: string; offset?: integer; limit?: integer 1–20 }` | `{ label, question, questions }` (no named type) |

`options` items use the exported `OptionSchema`: `{ label: string; value?: string; description?: string; recommended?: boolean; suggestion?: { kind: "evidence" | "fit" | "low-friction" | "explore"; basis: string; caveat?: string } }`.
`recommended` is legacy and shows no endorsement; a `suggestion` badge requires a
non-blank `basis`. `Input` is `{ question; details?; options?; multiSelect?;
urgency: "blocking" | "deferred"; why; boundary; planId?; taskIds? }`, where `why`
and `boundary` are required: a durable question must say what waits.

`status` is one of `"answered" | "skipped" | "cancelled" | "unavailable" | "regenerate" | "clarification_requested"`.
`ask_questions` reports per-question skips through `skippedQuestionIndexes`, not a
batch status. Both pausing tools return `unavailable` outside an interactive TUI.

### Events

| Key | ID | Direction |
| --- | --- | --- |
| `POSTED.probe` | `pi-ask:posted:v1:probe` | consumer → Ask: publish your questions |
| `POSTED.update` | `pi-ask:posted:v1:update` | Ask → consumers: `QuestionSnapshot` |
| `POSTED.open` | `pi-ask:posted:v1:open` | consumer → Ask: open question `id` at `revision` |
| `POSTED.needed` | `pi-ask:posted:v1:needed` | consumer → Ask: linked work reached, make it blocking |
| `POSTED.catalogueProbe` | `pi-tasks:links:v1:probe` | Ask → Tasks: publish your plan catalogue |
| `POSTED.catalogue` | `pi-tasks:links:v1:update` | Tasks → consumers: `TaskCatalogue` |
| `POSTED.interaction` | `pi-workspace:interaction:v1` | any → all: `{ sessionId, id, active }`, an overlay is open |

`QuestionSnapshot = { version: 1; sessionId: string; available: boolean; questions: QuestionProjection[]; fault?: string }`.
`QuestionProjection` carries `id, revision, question, urgency ("blocking" | "deferred"), state, boundary, planId?, taskIds, responseStatus?, consequence?, replacementId?, neededNow?`.
`QuestionOpen = { version: 1; sessionId; id; revision }`.
`TaskCatalogue = { version: 1; sessionId; available; attentionHosted?; plans: { id, taskIds, title?, tasks?: { id, title }[] }[] }`.

Consumers validate with `isQuestionSnapshot` and `isTaskCatalogue` and filter on
`sessionId`; unknown or malformed payloads are ignored, not repaired.

### Delivered answers

An answer reaches the agent as a custom **message**, `customType: "pi-ask:answer-v1"`,
with `{ triggerTurn: true, deliverAs: "steer" }`, `display: true`, and
`details: { label, question, id, submissionRevision }`. The `submissionRevision`
is what distinguishes a fresh submission from an already-delivered one.
`pi-ask:posted-v1` entries persist the question book; `pi-ask:posted-context-v1`
is hidden context, never a user message.

### Stage machine

`awaiting → submitted → delivered → applied`, with `withdrawn` and `replaced`
reachable from any unresolved stage (`awaiting | submitted | delivered`).

| Transition | Guard |
| --- | --- |
| new → `awaiting` | `post` |
| `awaiting` → `submitted` | a response exists; `submissionRevision = revision + 1` |
| `submitted` → `delivered` | the message was delivered |
| `delivered` → `applied` | response status is `answered` and a consequence is recorded |
| unresolved → `replaced` | a replacement question is posted, `replacementId` points forward |
| unresolved → `withdrawn` | a reason is recorded |

**Skipped, clarification and unavailable are not approval.** The skip text says
the answer "remains unknown, not agreement or consent"; only a delivered
`answered` response may be reported applied, and `apply` on anything else throws.
Tasks are never completed automatically as a consequence of an answer.

## Tasks contract

### Tool

`tasks` accepts `op: "plans" | "create" | "select" | "rename" | "archive" | "list" | "add" | "update" | "requirements"`,
plus `revision` (required for writes), `planId`, `title`, `items`, `id`, `changes`,
`requirements`, `offset`, `limit`. `executionMode: "sequential"`,
`renderShell: "self"`.

Reads: `plans`, `list`, and `requirements` without inputs. Writes require the
current library `revision` and fail closed when history is unreadable.

Result `details` by branch:

- `plans` → `{ plans, plan? }`, where each plan is the `planInfo()` return shape `{ id, title, current, state, counts, createdAt, updatedAt }` with `state: "open" | "closed" | "completed" | "archived"`;
- `requirements` → `{ plan?, requirements: (Requirement & { state })[], title? }`;
- everything else → `{ plan?, planId?, title? }`.

### Storage

| Key | Record | Status |
| --- | --- | --- |
| `pi-tasks:plans-v2` | `PlanBook` `version: 3` | written |
| `pi-tasks:plan-v1` | `Plan` `version: 1` | read-only legacy, migrated in memory |

The `plans-v2` key is kept even though the record is version 3 so an older reader
sees an unsupported version and fails closed instead of restoring stale data.

```ts
Task      = { id, title, status, phase, doneWhen, dependsOn, reason, note, noteBy, evidence, userClosed, updatedBy, updatedAt }
Status    = "pending" | "active" | "blocked" | "done" | "cancelled"
Plan      = { version: 1, revision, nextId, tasks, userCleared }
Requirement = { id, title, source, acceptance, taskIds, disposition, reason, updatedBy }
disposition = "accepted" | "superseded"
PlanBook  = { version: 3, revision, nextPlanId, selectedId, plans, userCleared }
SavedPlan = { id, title, state, createdAt, updatedAt, closedAt, archivedAt, archivedBy, requirements }
```

Requirement coverage `state` is computed, not stored:
`"uncovered" | "needs disposition" | "open" | "reported done" | "superseded"`.

### Dock provider contract

| Key | ID | Direction |
| --- | --- | --- |
| `DOCK.probe` | `pi-home:dock:v1:probe` | provider → host: `{ version: 1, sessionId }` |
| `DOCK.host` | `pi-home:dock:v1:host` | host → providers: `DockHost` |
| `DOCK.update` | `pi-home:dock:v1:update` | provider → host: `DockSnapshot` |
| `DOCK.ack` | `pi-home:dock:v1:ack` | host → provider: `DockAck { version: 1, sessionId, id, mounted }` |

`DockHost = { version: 1; sessionId; available: boolean; colors?: DockColors }`.
`DockSnapshot = { version: 1; sessionId; id; title; rows: DockRow[]; hint?; summary?; more?; overview?: TaskOverview }`,
`DockRow = { text, tone? }` with `tone: "text" | "muted" | "accent" | "success" | "warning" | "error"`.
`TaskOverview` carries `revision, planId?, total, done, blocked, cancelled, activeId?, activeTitle?, questions?`.
Helpers: `isSnapshot`, `isHost`, `validOverview`, `cleanText`, `layoutDock`, `fitDock`.

The wire IDs keep the historical `pi-home:dock:v1` prefix; the owner is now
Workspace. A provider that receives no `DOCK.host` must render its own fallback —
`mounted` starts `false` and only a host `DockAck` sets it.

## Compatibility rules

1. **IDs carry `:vN`.** An ID is never reused for a different payload shape.
2. **Compatible additions:** a new optional field, a new `op`, a new event, or a
   new row `tone`. Consumers ignore unknown fields and unknown `op` values.
3. **Breaking changes need `:vN+1`:** renaming, removing or redefining a field or
   `op`, or changing a validator to reject something it previously accepted.
4. **Consumers validate.** Use the exported guards (`isSnapshot`, `isHost`,
   `isQuestionSnapshot`, `isTaskCatalogue`, `validOverview`) on every inbound
   payload, and drop what fails. Never trust `sessionId` from another session.
5. **Probes are always answered.** A host answers every `DOCK.probe` with a
   `DockHost`, including `available: false` when it cannot render; a provider
   probes on session start and republishes when a host appears. Neither waits for
   the other to be loaded.
6. **Never assume the other component is loaded.** No direct imports across
   component directories: shared shapes come from `pi-agent-contracts` only.
7. **A display contract changes no state.** Snapshots and projections are
   read-only views; nothing here writes plans, answers or preferences.

## Host internals

Workspace reads these private symbols and degrades gracefully when one is
missing. `tests/host-shapes.test.mjs` asserts every one of them, naming the file
to update. Nothing outside Workspace's adapters may read them.

A plugin author should reach for `pi.registerToolRenderer` first: it is the
supported seam for replacing how a tool call is drawn, it needs no private
access, and Pi wraps renderer components in a `MouseRegion` that toggles
`expanded` for you. This suite keeps its transcript card on guarded internals
instead, for a measured reason: Pi prepends an empty row to every self-shell
renderer and wraps default-shell renderers in a padded, tinted Box, so the same
card occupies 4 rows through the resolver where it occupies 3 today, and every
card would gain a blank row regardless of the user's density preference. The
suite's card is also one frame across call and result, which Pi renders as two
sibling slots. Copy the seam when your surface can be drawn per call and per
result; copy nothing from the patch path.

| Symbol | Read by | Fallback when missing |
| --- | --- | --- |
| `ToolExecutionComponent.prototype.render/handleMouse/invalidate` | `activity-blocks.ts` | native tool card |
| `ToolExecutionComponent` own `args`, `result`, `expanded`, `isPartial`, `cwd` | `activity-blocks.ts` | native tool card |
| `Container.prototype.render` (records `mouseLayout` per render) | `copy-selection.ts` | native selection text |
| `TuiAltScreen.prototype.getSelectionBounds/getSelectionColumns/getActiveSelectionText` | `copy-selection.ts` | native selection text |
| `TuiAltScreen.prototype.render/doRender`, `TuiMainScreen.prototype.doRender`, instance `terminal.write/hideCursor/showCursor` | `paint-guard.ts` | unclipped repaint |
| `UserMessageComponent` / `AssistantMessageComponent` prototype `render` | `native-message-adapter.ts`, `sent-messages.ts` | native message layout |
| `create*ToolDefinition("")` factories, compared by identity | `activity-blocks.ts` | every card stays native |

Upgrade procedure: run `node --test tests/host-shapes.test.mjs` against the new
host. A failure names the symbol and the file; update that adapter, keep the
fallback working, then re-run `npm test`.
