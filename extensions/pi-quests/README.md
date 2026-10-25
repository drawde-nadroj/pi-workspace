# Pi Quests

A persistent landscape of paths to explore, with workspace views, depth/breadth suggestions and linked questions. Quests works independently of Workspace, Tasks and Ask.

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

The selected quest immediately shows purpose, next move, goal, questions, developments, evidence, linked Tasks and connections. There is no Read gate. Page Down/Page Up scroll this context while arrows select actions.

- **Continue in chat** marks it active and sends a request to develop the next useful move, accounting for work already done. It requires an idle agent. If sending fails, inspect the record before continuing again.
- **Keep for later** saves it without sending a message or starting work.
- **History** shows dated snapshots of pursuit, progress and completion, newest first, with older pages available.
- **Connections** shows related quest details.
- **Questions** adds a buffered question or records an answer. These are journal entries; answering does not start work or submit an Ask approval.
- **Show in all workspaces / Show only in original workspace** changes visibility while preserving origin. This workspace means the displayed working-directory path across sessions; All workspaces means this Pi journal everywhere, not public sharing.
- **Pause / Decline** keeps the record available without reminders.

Escape closes the browser. Quests has jade framing and focused selections, restrained warm-gold discovery/connection accents, and neutral body text. Light themes use deeper jade and gold for contrast. Arrow keys navigate, Enter selects, and Page Up/Page Down scroll long details. Selection uses Pi's native SelectList inside shared Frame chrome; text-entry dialogs and RPC selections remain native. Existing Composer draft, Vim and unrelated appearance settings remain unchanged. The browser currently supports keyboard navigation; it does not add pointer hit targets.

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

An explicit conversational request can record pursuit through `update` with `state: active`, `requestMessageId` and exact `requestQuote`. The tool verifies the user message exists on the current branch and contains the quote; interpreting its meaning remains the agent's responsibility. This records recognition and sends no additional request. Keep-for-later and Decline remain manual choices.

Optional `goal` defines closure, `progress` appends a development, and `planId` links a real Tasks plan from the current branch. Completion needs a goal and fresh `evidence`; it remains an agent report, not independent verification. Linked tasks show current branch data when available and dated snapshots otherwise, never inferred live cross-session status. Links between quests are directional. Questions have stable IDs. History retains earlier answers, formulations and outcomes. These additive fields preserve older quest records without rewriting their origins.

With Workspace loaded, meaningful updates appear above the Composer. `/activity` expands recent session history and opens source details. `/workspace` → General owns **Session updates** (compact, expanded, off) and **Session update colors** (semantic, theme), using the normal preview/Save/Discard/Undo transaction. Activity follows the session branch; the quest journal remains cross-session.

## Storage and ownership

`<Pi agent directory>/quests/journal.sqlite` holds schema-versioned SQLite records and event history. It uses Node's built-in SQLite on the suite's Node 22.23.2+ baseline. Transactions protect record/event consistency; revisions reject stale writes across sessions. Connections close after each operation. A newer schema is rejected rather than overwritten.

Workspace identity is the resolved working-directory path, not an inferred Git repository root. Opening different subdirectories creates distinct local views; the entire landscape still shows everything. Session IDs and source descriptions preserve origins. The journal is global to this Pi agent directory and does not rewind with session branching. It is local plaintext storage; use normal filesystem protections and backups. No embeddings, remote memory service, background research or vault scanning are introduced.

Quests owns paths and exploratory questions. Tasks owns execution plans. Ask owns immediate question interaction and approval/application semantics. Quests adds guidance to existing runs and **does not request another model turn**. Tasks retains its existing single completion checkpoint, whose Where next? guidance is reused. Suggestions and automatic capture remain model behavior, not a deterministic guarantee.

This first slice has no Obsidian sync, Mnemosyne dependency, cross-session replay of Ask answers, reminders, automatic task creation, or separate mastery/story renderer. Evidence, origins, links and history provide the foundation for those future experiences.

## Verify

From the suite root, run `npm run test:quests`, `npm test`, and `npm run pack:check`. Tests cover persistence, revisions, promotion, question answers, links, authorization transitions and standalone host loading. Live model behavior and physical terminal usability require separate observation.
