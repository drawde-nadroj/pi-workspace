# Pi Quests

A persistent landscape of paths to explore, with workspace views, depth/breadth suggestions and linked questions. Quests works independently of Egregore, Tasks and Ask.

## Directed memory: continuity of a developing intention

Pi Quests is built around **memory organized around agency**: remembering in ways that help you notice possibilities, choose directions, develop understanding and act. Its useful unit of memory is a developing pursuit:

> What caught my attention → why it matters → what I’m exploring → what I’ve tried → what changed → what becomes possible next.

This preserves enough context to resume a line of thought. A pursuit can grow across conversations as its questions, language, evidence and possibilities become clearer.

### Remembering with direction

General memory helps answer, **“What do we know that’s relevant here?”** Directed memory adds, **“What were we trying to understand or become able to do—and where have we reached?”**

These functions complement each other. A retrieval layer could supply relevant memories; a quest supplies the direction that makes those memories useful. This is a conceptual relationship and a possible future integration, rather than an existing connection to a memory platform.

Choosing a pursuit makes a thread worth maintaining across conversations. It gives continuity to an intention without requiring every future task to be specified. Offered paths preserve possibilities; accepting one gives the agent a direction to help develop. Tasks can organize concrete execution beneath that larger direction.

### Proactive thought partnership

The proactive opportunity is to use remembered context to propose a useful next move: deepen an idea, connect it elsewhere, revisit a question with new evidence, or recognize a capability developed through earlier work. Depth grows understanding within a pursuit; breadth carries that understanding into another domain.

In the current implementation, this depends on the agent noticing, recording and developing the thread during conversations. The journal provides persistent structure; it does not continuously think in the background or automatically reconstruct unrecorded progress.

### Bodies of thought worth growing

Possible applications include:

- **Learning and mastery:** retain difficulties, explanations that clicked, practice experiments and evidence of improvement. A later conversation can build on the learner’s developing understanding.
- **A body of thought:** grow “words worth repeating” from transcript seeds through discussion, sharper language, tested examples and eventual journal entries. Better questions and clearer formulations are meaningful progress.
- **Decisions and experiments:** preserve why something was tried, the criteria behind a decision, what happened and how understanding changed. This supports reconsideration as new evidence arrives.
- **Connections across projects:** retain a discovery with its evidence and origin so that a capability developed in one project can become useful in another.

These are directions the underlying model can support, rather than separate implemented subsystems. They share a foundation: preserving the relationship between intention, experience and understanding.

### A durable design criterion

> A remembered thread earns its place by helping you resume, deepen, connect or reconsider something that matters to you.

The aim is **continuity of a developing intention**. Useful memory helps a person carry something forward—and leaves room for that something to become more than its original formulation.

*Origin: the conversation developing Pi Quests, in which Jordan described the experience as “directed memory” and recognized the developing pursuit as a useful abstraction for memory.*

## Begin using it

Start a fresh Pi process after updating the suite. Bring a passage, transcript, question or piece of work into the conversation. Ask for paths to explore, or let the agent offer them at a meaningful milestone. Each offered path records its value, first move and source.

Open `/quests` to browse paths belonging to the current working directory plus globally promoted paths. `/quests all` shows the entire landscape. Choose a path and:

The selected quest opens with its state, workspace, latest development (or purpose), current next move and up to two recorded blockers. Counted **Work**, **Questions**, **History**, **Evidence** and **Connections** disclosures reveal more; **Purpose** retains the goal and original first move, and **Source** retains full provenance. Enter toggles a disclosure; Page Down/Page Up scroll the detail while arrows select sections or actions. Browsing does not mutate the quest. History counts event snapshots, not unique discoveries or completed tasks.

- **Continue in chat** marks it active and sends a request to develop the next useful move, accounting for work already done. It requires an idle agent. If sending fails, inspect the record before continuing again.
- **Resume overview** reads a bounded orientation: purpose, current position, understanding, uncertainty, next move, linked work and decision consequences. It does not change the journal or send a message.
- **Understanding** and **Linked decisions** disclose current source-linked statements and dated Ask snapshots, including answer notes and application consequences.
- **Keep for later** saves it without sending a message or starting work.
- **History** shows dated snapshots of pursuit, progress and completion, newest first, with older pages available.
- **Connections** shows related quest details.
- **Questions** expands open/answered journal entries; **Edit exploratory questions**, or **More actions → Questions**, adds a buffered question or records an answer. These are journal entries; answering does not start work or submit an Ask approval.
- **More actions → Show in all workspaces / Show only in original workspace** changes visibility while preserving origin. This workspace means the displayed working-directory path across sessions; All workspaces means this Pi journal everywhere, not public sharing.
- **More actions → Pause / Decline** keeps the record available without reminders.

Escape closes the browser. In TUI mode the browser uses a focused overlay bounded to 90% of terminal height; its actions and closing rail stay within that budget while detail text scrolls. Very small terminals use an unframed compact fallback. Quests has jade framing and focused selections, restrained warm-gold discovery/connection accents, and neutral body text. Light themes use deeper jade and gold for contrast. Arrow keys navigate, Enter selects, and Page Up/Page Down scroll long details. Selection uses Pi's native SelectList inside shared Frame chrome; text-entry dialogs and RPC selections remain native. Existing Composer draft, Vim and unrelated appearance settings remain unchanged. The browser currently supports keyboard navigation; it does not add pointer hit targets.

## Where next: Deepen and Connect

The handoff borrows the feel of a field journal and a constellation: origins make a path intelligible, and connections show where a discovery could travel. **Deepen** uses jade for continuity and growing understanding; **Connect** uses warm gold for a new relationship. Both have equal visual prominence, with strong readable titles and neutral body text. Gold indicates connection, not priority or urgency. Stored kinds remain `depth`, `breadth` and `exploration`; the latter displays as **Explore**.

Each path shows its value, **First move**, and **From** source. The agent should name the actual observation, conversation or supplied material that inspired the path, distinguishing a proposed connection from an established fact. Usually one or two substantial paths are enough. The same handoff can arise during conversation or Tasks' existing completion review.

`quests present` renders one shared jade-framed handoff in the tool transcript. It accepts either existing IDs or inline ideas; presentation itself does not save, accept or start paths. Inline ideas are labelled **Conversation only · not saved**; existing paths show their recorded state. Native tool expansion reveals long text; narrow terminals use an unframed labelled version. Plain-text results retain the same content for non-TUI clients and exports. Call the tool directly for its own visual renderer; a nested codemode call returns text to its caller rather than displaying a separate tool card.

There are no new timers, input controls, background model runs or appearance settings. Continue by talking about a path; saving a substantial offer and recognizing acceptance remain separate journal actions. Model guidance asks for one handoff rather than restating the same paths in another message; actual adherence remains model behavior.

## Tool reference

`quests` supports:

| Operation | Fields / result |
| --- | --- |
| `list` | `view: workspace` (default) or `all`; `offset`; 20 summaries per page |
| `get` | `id`; full record and revision |
| `offer` | `title`, `why`, `firstMove`, `source`; optional `kind: depth/breadth/exploration`, `global`; creates an **offered** path |
| `update` | `id`, current `revision`; refine title/value/first move, promote via `global`, `link` another quest ID, append `evidence`, add `question`, or record `answer` with `questionId` |
| `history` | `id`, optional `offset`; 20 newest event snapshots per page |
| `context` | Current branch's last ten user messages with source IDs, plus Tasks plan summaries for linking |
| `present` | `paths`: 1–4 objects, each either `{id}` alone or `{title, why, firstMove, source, kind?}`; read-only Where next presentation. Existing paths use `nextMove` where recorded, their original first move while offered/saved, or invite developing the next step for ongoing/closed pursuits. |

An explicit conversational request can record pursuit through `update` with `state: active`, `requestMessageId` and exact `requestQuote`. The tool verifies the user message exists on the current branch and contains the quote; interpreting its meaning remains the agent's responsibility. This records recognition and sends no additional request. Keep-for-later and Decline remain manual choices.

Optional `goal` defines closure, `progress` appends a development, `nextMove` records the current meaningful step separately from the original `firstMove`, and `planId` links a real Tasks plan from the current branch. Existing active records without `nextMove` invite developing the next step in chat rather than presenting a potentially completed first move as current. The agent maintains this wording; the renderer does not infer a next action. Completion needs a goal and fresh `evidence`; it remains an agent report, not independent verification. Linked tasks show current branch data when available and dated snapshots otherwise, never inferred live cross-session status. Links between quests are directional. Questions have stable IDs. History retains earlier answers, formulations and outcomes. These additive fields preserve older quest records without rewriting their origins.

With Egregore loaded, meaningful updates appear above the Composer. `/activity` expands recent session history and opens source details. `/egregore` → General owns **Session updates** (compact, expanded, off) and **Session update colors** (semantic, theme), using the normal preview/Save/Discard/Undo transaction. Activity follows the session branch; the quest journal remains cross-session.

## Carry a pursuit across conversations

Ask the agent to record meaningful observations, current understanding, uncertainty, decisions and artifacts as the pursuit develops. `record` appends a typed statement with a stable key and source description; an optional source entry ID must exist on the current branch. The source description is an agent report, and entry validation establishes existence rather than truth. To correct a statement, use a new key with `supersedes` pointing to the current statement of the same kind. Earlier statements remain in the record and history. Retrying identical content with the same key is a no-op, even after its original revision has advanced; reusing the key for different content fails.

After applying an Ask answer or changing linked Tasks, use `sync` to capture the current branch's records. It snapshots only already-linked plans and their posted questions. Answer text, notes, lifecycle state, source entry and reported consequence stay together. A changed snapshot flags the next move for review; recording `nextMove` clears that flag. Sync never delivers or applies an answer, changes a task, or expands authorization. Duplicate unchanged syncs create no journal or activity events. Historical snapshots can differ from a later branch and are labelled accordingly when resuming.

`resume` supplies a read-only orientation capped at 16,000 characters, with bounded sections and pointers to `get`/`history`. It refreshes available current-branch work and questions for display without saving them. Full answer caveats remain in the linked question snapshot and Ask record; inspect those before acting. It reads no other session files and performs no inference or network call.

`focus` selects one quest as context for subsequent runs on the current branch; omit `id` to clear focus. The selection uses a `pi-quests:focus-v1` session entry, while the quest itself remains cross-session. Focus does not accept a possibility, activate a quest or send a message. **Continue in chat** also selects focus while performing its existing explicit continuation action. The existing before-run guidance includes the selected pursuit's bounded orientation; there is no extra model request, timer or automatic work replay. Missing/unreadable context produces a warning in the guidance rather than resetting records.

| Operation | Required fields and effects |
| --- | --- |
| `record` | `id`, `revision`, `key`, `contextKind` (`understanding`, `uncertainty`, `decision`, `artifact`, `observation`), `statement`, `source`; optional `sourceEntryId`, `supersedes`. Appends an immutable statement. |
| `sync` | `id`, `revision`. Captures current-branch linked Tasks/Ask snapshots; unchanged retries are no-ops. |
| `resume` | `id`. Read-only bounded context, with current-branch versus historical labels. |
| `focus` | Optional `id`. Selects or clears branch-local context; does not authorize work. |

Context statements are limited to 200 per quest and the full quest record to 2 MB. Exceeding a limit rejects the change without discarding history. Existing records need no eager migration: the new fields are optional within the version-1 journal. Capability recognition, cross-pursuit discovery automation and vault integration remain later work.

## Storage and ownership

`<Pi agent directory>/quests/journal.sqlite` holds schema-versioned SQLite records and event history. It uses Node's built-in SQLite on the suite's Node 22.23.2+ baseline. Transactions protect record/event consistency; revisions reject stale writes across sessions. Connections close after each operation. A newer schema is rejected rather than overwritten.

Egregore identity is the resolved working-directory path, not an inferred Git repository root. Opening different subdirectories creates distinct local views; the entire landscape still shows everything. Session IDs and source descriptions preserve origins. The journal is global to this Pi agent directory and does not rewind with session branching. It is local plaintext storage; use normal filesystem protections and backups. No embeddings, remote memory service, background research or vault scanning are introduced.

Quests owns paths and exploratory questions. Tasks owns execution plans. Ask owns immediate question interaction and approval/application semantics. Quests adds guidance to existing runs and **does not request another model turn**. Tasks retains its existing single completion checkpoint, whose Where next? guidance is reused. Suggestions and automatic capture remain model behavior, not a deterministic guarantee.

This first slice has no Obsidian sync, Mnemosyne dependency, cross-session replay of Ask answers, reminders, automatic task creation, or separate mastery/story renderer. Evidence, origins, links and history provide the foundation for those future experiences.

## Verify

From the suite root, run `npm run test:quests`, `npm test`, and `npm run pack:check`. Tests cover persistence, revisions, promotion, question answers, links, authorization transitions and standalone host loading. Live model behavior and physical terminal usability require separate observation.
