# pi-ask

share context, seek the seams, and make a decision.
call out the unknown!

**TLDR:** (yes the juice is worth the squeeze)

- ask for more questions and you shall receive!
- regenerate remaining questions based on answers and notes (if q1 changes direction, that context carries forward)
- ask for clarity between questions (never answer a question you don't understand!)
- stop anytime and submit only what you've answered (you're free!)
- see why an option is suggested, instead of trusting an unexplained badge
- shared understanding, fewer assumptions; ask when the answer changes the path

- already interested? check out [installation](#installation)! hope you enjoy :)

**Usage:**
- best for work where understanding grows as decisions compound
  - dictation in the notes + regeneration is good for getting the thoughts out
- the most fruitful conversations happen at the edge of shared understanding

## everything underneath is vibed but the above is Lived

Adaptive questions for building shared context with the [Pi Coding Agent](https://github.com/earendil-works/pi)—giving you precise control over what an agent learns, making efficient use of its context window, and reducing tokens wasted on guesses and rework.

For setup, see [Installation](#installation). For an answer task, see [best usage](#best-usage-ask-when-inquiry-is-worth-the-interruption) and [keyboard controls](#keyboard-controls). Agent authors can consult [tool parameters](#tool-parameters) and [posted queue operations](#posted-queue-operations). [Posted questions](#posted-questions-one-continuous-thread) explains scope and provenance; it is not a shell-command reference.

## Highlights

- **Regenerate unanswered questions from completed answers.** Once a batch has both an answered and an unanswered question, **Ctrl+R Regenerate unanswered** appears on the question and Review screens (also under **F2 More**). Press it to let the agent replace only the questions that no longer fit. Your resolved answers and notes become context for the new questions instead of being asked again.
- **Review before deciding what to omit.** Press **Ctrl+Enter** to compare answered, explicitly skipped, and still-unanswered questions. Only **Submit without N unanswered** marks the remaining questions skipped.
- **Attach notes to individual answers.** Focus the persistent **+ Note** row and press Enter or + to type; Enter or Tab saves the note and returns to the answer, while Ctrl+C or Escape discards that edit. A note on a skipped question stays in the form but is not sent.
- **Ask the agent what a question means without leaving the dialog.** Clarify ambiguous wording before a misunderstanding becomes part of the work.
- **Mix the right response types.** Use single-choice, multi-select, custom **Something else…** answers, and multiline free-form input in the same batch.
- **Review the whole batch before submitting it.** Catch accidental choices and see related decisions together before committing them to the conversation.
- **Spend context on decisions, not repairs.** Batch related unknowns, preserve resolved answers, and regenerate only what is stale instead of burning tokens on repeated clarification or work based on bad assumptions.

The package exposes three tools:

- **`ask_user_question`** asks one free-form, single-choice, or multiple-choice question.
- **`ask_questions`** collects several related answers in a sequential form with a compact **1 of N** header and a Review screen.
- **`question_queue`** posts one durable question without stopping independent work, lists history, and records application, withdrawal or replacement. `/questions` opens the standalone inbox; `/tasks questions` opens the integrated view when Tasks is installed.

## Posted questions: one continuous thread

Use existing synchronous tools for an immediate decision where the agent should pause. Use `question_queue post` when other authorized work can continue. Each post includes **why**, a concrete **boundary**, and **blocking** or **deferred** urgency; optional `planId`/`taskIds` link existing non-archived Tasks work. A blocking label is local to that boundary, not a declaration that all agent work has stopped. Unlinked questions work without Tasks.

Select a question in `/tasks` → **Questions** and press Enter. Ask opens as a raised overlay above the existing panel; Escape first returns from Review/custom/clarification editing or discards only the active note edit. Outer Escape then returns to the same question and preserves the draft, including custom/free-text answers, saved notes and clarification buffers. Enter Continue opens Review; a separate **Submit** finalizes the response. Existing synchronous forms retain their original input/skip/cancel semantics. Ask appearance and density are read from the existing `/workspace` settings at opening; there are no new live appearance preferences.

The branch-local lifecycle is **Awaiting answer → Response submitted → Delivered to agent → Agent reports applied**. Answer, skip and clarification response kinds are labeled separately; submission does not imply agreement. Delivery means the response has entered the model context, not that the model has acted on it. Notes and caveats remain part of the response. Skips and clarification requests can be delivered but cannot be reported applied as answers; the agent must clarify, replace or withdraw the question. Application requires a concrete consequence and does not mutate Tasks. Linked agent task starts/completions wait on unresolved records; a deferred linked question becomes blocking when the agent reaches that task boundary. Ask records the needed-now reason without rewriting the original question, losing an open urgency-only draft, or changing a submitted response identity. The open form updates its context and commits against the latest compatible revision; definition/link/session changes still fail closed. Independent work remains available. This is a Tasks-state gate, **not a universal enforcement layer for arbitrary shell commands, tools, or external side effects**. Use the synchronous consent/permission path for immediate high-risk actions.

`question_queue list` returns full records with per-question revisions. `apply`, `withdraw` and `replace` require the current question revision and a reason/consequence. Replacement keeps the original question and links to the new record; it never silently rewrites submitted wording. Withdrawal is not approval, and neither withdrawal nor application automatically changes a task. Reconcile changed scope through the requirement owner before proceeding. Stale session/revision responses are rejected rather than applied to a revised question.

Submitted responses use Pi steering and are available after the current turn's tool calls, not inside a running tool. Submitting while idle can start an agent turn. If delivery is interrupted, the response stays Submitted; `/questions retry q1` requires explicit confirmation and reuses the original submission identity. There is **no automatic retry** on reload. Outcome views explain correction: tell the agent what changed and request a provenance-preserving replacement. The original response is retained; delivered context and external effects cannot be undone by this UI. A prior uncertain send may still be queued; the same answer must not be applied twice. Refreshing the inbox is safe and does not send anything.

State uses version-1 `pi-ask:posted-v1` custom entries on the active branch, bounded to 100 retained records and 1 MiB. Drafts save on returning from the overlay; crashes can lose currently open, unsaved input. Restore/reload/tree/compaction read branch entries without rewriting them. Invalid or future versions fail closed and are not automatically reset. Posted tool results, submission messages and delivery entries each own one immutable chat event; opening an old event does not rewrite its past status. Standalone Ask provides an attention widget when Tasks does not host attention, including unavailable, off or hidden Tasks. Link availability is a separate fact. The Questions catalogue is session-scoped; linked plan/task names are read-only context, not a new state owner. Non-TUI modes may post/list/disposition records; answering requires the TUI.

The Workspace clock keeps tracking independent work during the Tasks browser and posted Ask overlays, while visual motion stays still. Existing synchronous questions still pause the clock. No new timers, network calls, live-settings changes or input-editor replacement are introduced by posting a question.

## Rounded question panel

Questions temporarily replace the main input area with a **Questions** panel: rounded framing, the terminal’s own background, and native multiline fields. The panel, the **What are you wondering about?** clarification field, the inline **Something else…** editor, and the active note editor embed the installable `pi-embeddable-frame` renderer; their text input, focus, completion and submit behavior remain owned by pi-ask. The default lower-left **1 of N** indicator replaces the former question-summary bar; the full overview appears on Review. The question surface shares Pi’s active accent (purple in the current workspace theme) without changing global theme settings. The **Questions** title and progress match its accent border by default and both frame-rail labels are bold; question wording and answer text retain their own emphasis rules. In the suite, `/workspace` → **Ask** can edit a synthetic preview and save bounded title/rail, question-emphasis and hint-tone settings in the version-1 `ask` section of `pi-workspace.json`; standalone Ask reads that section once when a question opens, with `pi-footer.json` and legacy `questionLabels` as fallbacks when the workspace file is absent. The question wording, focus and answer actions never come from appearance settings. Choice markers and native cursor/selection behavior remain. On a small terminal the panel reduces its frame rather than discarding answer state. There is no continuous animation while you are reading or typing.

Keyboard hints use **↵** for Enter and **⇧↵** for Shift+Enter, with readable action words. The primary action and **Ctrl+S Skip question** stay visible while answering or editing a note. No Nerd Font is required. Tool cards use **Question** / **Questions** rather than internal tool names.

Pi holds the real prompt draft while the question owns the input area, then restores it. Composer’s Vim integration preserves the existing editor instance and skips the unchanged-draft reset during native dialog restoration. Selection, `@` file-completion, clarification, skip, and review/submit controls remain available. Start a fresh Pi process after package/export or imported-module changes; `/reload` may retain dependencies.

## Best usage: ask when inquiry is worth the interruption

If you want the agent to check for important unknowns, try:

> **Before you start, investigate what you can. Ask me only about matters that need my perspective and would change the work. If I've invited exploration, contribute your thinking first; then ask an open question if it could help us see something important differently. If no question is needed, proceed.**

Give the agent relevant context, especially context already shared in the conversation or project. It can use `ask_questions` to gather related unknowns rather than guessing or interrupting repeatedly. It should not ask questions simply to fill a batch. For practical work, it should inspect what it can, make a provisional judgment, and ask only when different answers would materially change its next action. It can proceed with a stated, reversible assumption when the choice does not belong to you. For exploration you invited, a question can instead help reveal an overlooked possibility or reconsider an aim; it should still earn the interruption.

### Inquiry charter

**Purpose:** strengthen a person's ability to understand and act, not merely collect structured answers. The agent owes the person its own thinking before asking for theirs.

- **Attend before intervening.** Read what has already been said and investigate available evidence. Do not ask someone to repeat a fact the agent can find.
- **Separate kinds of uncertainty.** Findable facts call for research; low-risk, reversible choices can be made with stated assumptions; consequential preferences, consent, and lived experience belong to the person.
- **Ask at a real fork.** In practical work, a question is earned when plausible answers would change the next action. Show the finding or trade-off that makes the answer matter. One pivotal question beats a long questionnaire; zero questions can be the right result.
- **Make space for discovery.** In exploration the person invited, a question can instead help uncover a possibility or reconsider an aim, even without an immediate action. Offer a substantive thought first. Do not turn reflection into an unsolicited interrogation or presume the person's values.
- **Recommend without taking over.** Offer a reasoned provisional path for technical choices, including what could change it. For open exploration, reflect the problem before narrowing it to a menu. Keep room to disagree.
- **Learn from the answer.** Show what changed in the work or understanding, and drop stale follow-ups. When the person asks for clarification or revision, reconsider whether a question is still necessary instead of mechanically re-asking it.

This is a design ethic, not a claim that the tool verifies an agent's judgment. The educational ambition is to cultivate attention, evidence, judgment, creation, and revision while preserving the learner's agency. The software currently provides question and answer affordances plus agent-facing guidance; its real effect must be evaluated in use, including whether people leave better informed and more capable of acting without it.

For example, a weak practical question is *“Which architecture do you want: A, B, or C?”* before investigating the code. A stronger agent first inspects the project: *“A preserves your current editor state; B replaces it and risks losing Vim undo. I would use A. Is replacing the editor acceptable for a specific reason I have missed?”* If that difference does not affect the task, it should simply proceed with A. In an invited philosophical exploration, the agent might instead offer an interpretation and ask *“What in your experience resists that account?”*—but only when the answer would help deepen the inquiry, not as a reflexive closing line.

More useful context usually produces better work. A question batch creates a quick path to shared understanding: answer what you know, add notes where nuance matters, and ask the agent for clarification from inside any question you do not understand.

### Answer-to-action handoff

Both tools instruct the agent to apply submitted answers **with their notes and caveats**, explain material changes briefly, and drop obsolete questions. An answer that changes authorized scope or acceptance should be reconciled through the requirement owner's existing tools when available, preserving provenance and explicitly superseding changed requirements. Ask itself never writes Tasks state and does not require Tasks to be installed.

Skipped, unanswered, cancelled, and unavailable questions are not agreement or consent. An unresolved approval boundary remains a boundary. Exploratory answers are not authorization to implement, and not every answer should become a task. These are model-facing instructions; deterministic tests check their presence and result fidelity, not whether a model obeys them. The suite's `eval/harness/README.md` describes opt-in behavioral comparison and human interruption review.

### Revise unanswered questions

You do not have to finish a batch whose later questions no longer fit. After answering at least one question, leave the questions that need rethinking unanswered and use the visible **Ctrl+R Regenerate unanswered** action on the question or Review screen (also in **F2 More**). The plugin returns your completed answers and notes to the agent as new context and preserves them as resolved. The agent should reassess the unanswered questions: revise only those still consequential, or explain why none remain and continue the work. You should not have to answer the same question again.

This loop can continue until you and the agent share enough context to proceed:

1. The agent asks a broad, useful batch.
2. Your answers change or sharpen its understanding.
3. **Revise unanswered** prompts the agent to drop stale questions and, if needed, replace them with better ones.
4. The agent continues the work once the important unknowns are resolved.

### Submit answered questions and skip the rest

**Ctrl+S Skip question** is visible on every answer screen, including free-form questions. It explicitly skips the current question; a single question returns a distinct `skipped` result instead of `cancelled`. In a batch, the draft and note remain in the form for restoration, but neither is sent if the question stays skipped. After restoring with **Ctrl+S** or **Enter**, you can use the draft as an answer.

Typing free text creates a **draft**. Press **Enter Continue** to commit it; navigating to another question does not submit it. Use **Ctrl+Left/Right** to navigate while editing free text (plain Left/Right moves the text cursor); choice questions also accept plain Left/Right. **F2 More** includes Previous and Next question actions.

Press **Ctrl+Enter** or **Alt+Enter** after answering at least one question to open Review. Review distinguishes **Answered**, **Skipped**, and **Unanswered**, including an uncommitted draft. Opening Review does not skip anything. If unanswered questions remain, the final action says **Submit without N unanswered**; choosing it explicitly skips those questions. Escape returns to the first unanswered question. An all-skipped batch can also be reviewed and submitted.

### Questions as context management

The dialog is also a small context editor. It gives you control over both the shape of your response and what the agent treats as settled:

- **Choices constrain scope.** Select a precise option when the decision is bounded, use multi-select when several items belong together, or choose **Something else…** when the offered frame is wrong.
- **Free-form answers preserve depth.** Open-ended questions use a multiline editor instead of forcing nuanced input into a menu.
- **Notes separate the rule from the exception.** Keep the main answer easy to interpret while attaching caveats, conditions, or reasoning to that question.
- **Review prevents accidental context.** A batch is not final until you inspect it; unanswered questions become skipped only when you explicitly submit without them.
- **Clarification prevents false agreement.** Ask the agent what a question means before committing an answer to something you may have misunderstood.
- **Revision keeps context current.** Resolved answers remain explicit context while stale unanswered questions are reformulated rather than silently becoming assumptions.

The intended result is clearer conversation history; this is not a measured guarantee of comprehension or task quality. Instead of mixing requirements, uncertainty, corrections, and guesses into one long message, the tool returns structured answers and notes that show what you chose, what you qualified, and what still needs work.

That can also make better use of a limited token budget. Asking a focused batch has an upfront cost, but it can avoid repeated clarification turns, discarded implementations, and obsolete assumptions taking up the context window. This is especially useful with local models that have smaller context windows, metered APIs, or any workflow where cost and context pressure matter.

## Comparison

**Historical, unverified comparison notes:** the table below has no accompanying source citations or comparative captures. It was not revalidated in this documentation pass and is not a current compatibility or product-selection guarantee. Check upstream behavior before relying on a third-party row. These notes name **Claude Code 2.1.221**, **Codex CLI 0.146.1**, and the current version of this package; upstream behavior can change quickly.

| Capability | `pi-ask` | Claude Code `AskUserQuestion` | Codex `request_user_input` |
|---|---|---|---|
| Questions per batch | 1 or more; no schema maximum | 1–4 | 1–3 |
| Choice options | 1 or more; no schema maximum | 2–4 | 2–3 |
| Native open-ended question | **Yes** — omit options | No — use the automatic custom-text choice | No — use the automatic custom-text choice |
| Custom answer alongside choices | **Yes** — **Something else…** | **Yes** — **Other** | **Yes** — **Other** |
| Multi-select | **Yes** | **Yes** | No |
| Qualified suggestion with a visible basis | **Yes** | No — recommendation is a label convention | No — recommendation is a label convention |
| Per-question answer notes | **Yes** | Limited to supported preview/annotation flows | No |
| Review before final submission | **Yes** | **Yes** | Batch submission, but no separate review screen |
| Ask the agent for clarification inside the dialog | **Yes** | **Yes** — **Chat about this** | No |
| Dedicated “revise unanswered only” action | **Yes** | Partial — chat can lead Claude to reformulate questions | No |
| Explicit partial submit that marks the rest skipped | **Yes** | No | No |
| Preserve resolved answers while questions are revised | **Yes** | Partial — current answers are returned as clarification context | No dedicated revision flow |
| Visual/code previews for options | No | **Yes** | No |
| Structured result returned to the agent | **Yes** | **Yes** | **Yes** |
| Availability | Pi interactive TUI | Claude Code | Depends on the active Codex mode and tool list |

The main difference is not merely how many questions fit in one dialog. This package is designed for a longer **question → answer → revise → shared understanding** loop, with native free-form input and per-question notes. Claude Code has a smaller batch limit and richer option previews. Codex keeps the interaction compact and decision-oriented.

> **Preview:** No screenshot or animation is included yet. Contributions of an accurate demo are welcome.

## Additional features

- Optional question details and qualified suggestions with a visible basis
- Width-aware terminal rendering and serialized dialogs
- Structured results for answered, cancelled, unavailable, revision, and clarification states

## Installation
This README describes Ask in the **suite source checkout** and its standalone runtime. Links to `../../docs` or other suite components require that checkout; they are not extra files installed by the standalone Ask package.

### As part of this suite

Follow [the suite installation guide](../../docs/INSTALL.md) from the repository root. It loads Ask once with Workspace and Tasks. **Do not also register standalone Ask while the suite is loaded.**

### Standalone from this checkout

With compatible Pi and Node/npm installed, first run `npm ci` from the **suite repository root** to install the workspace dependency tree. Then register only Ask:

```sh
# From the suite repository root; do not use this in addition to the suite entry:
pi install "$PWD/packages/pi-ask"
```

This loads `extensions/questions.ts`, not Workspace or Tasks. Frame must remain resolvable through the installed dependency tree; local Pi registration does not run npm installation. Start a fresh Pi process after package/imported-module changes.

Earlier standalone instructions pointed to `the-sleeping-teemo/pi-context-seeker`. That remote repository was not checked for equivalence to this fork; do not use it as a verified route to the features documented here.

## Tool parameters

Pi calls these tools on behalf of the model. The examples below show their parameter objects.

### Single choice

```json
{
  "question": "Which database should we use?",
  "details": "For the primary application store",
  "options": [
    { "label": "PostgreSQL", "value": "postgres" },
    { "label": "SQLite", "value": "sqlite", "suggestion": { "kind": "low-friction", "basis": "A local prototype needs no database server.", "caveat": "Revisit this for concurrent production writes." } }
  ]
}
```

### Multiple choice

```json
{
  "question": "Which checks should run in CI?",
  "options": [
    { "label": "Tests" },
    { "label": "Typecheck" },
    { "label": "Lint" }
  ],
  "multiSelect": true
}
```

### Free-form

Omit `options` to open the multiline editor:

```json
{
  "question": "What should the release notes emphasize?",
  "details": "A short paragraph is enough."
}
```

### Batch

```json
{
  "questions": [
    {
      "question": "Which runtime should we target?",
      "label": "Runtime",
      "options": [{ "label": "Node.js" }, { "label": "Bun" }]
    },
    {
      "question": "Describe the deployment environment.",
      "label": "Deployment"
    },
    {
      "question": "Select required platforms.",
      "label": "Platforms",
      "options": [{ "label": "Linux" }, { "label": "macOS" }],
      "multiSelect": true
    }
  ]
}
```

Each option requires a nonblank `label`; `value`, `description`, and `suggestion` are optional. A suggestion requires `kind` (`evidence`, `fit`, `low-friction`, or `explore`) and a nonblank `basis`; `caveat` is optional. These fields express the assistant's judgment, not independent verification by the plugin. Prefer no suggestion when your priorities or the evidence are unknown. Legacy `recommended: true` and labels ending in `(Recommended)` remain accepted, but no longer produce an endorsement badge. `multiSelect` is valid only when options are present.

### Posted queue operations

`question_queue` is **one agent tool** with an `op` field, not a shell or slash command. The user-facing inbox command is `/questions`; `/questions q1` opens a record and `/questions retry q1` requests a confirmed retry of an interrupted undelivered submission.

| `op` | Parameters and boundary |
| --- | --- |
| `post` | `question` contains question text, `urgency`, `why`, `boundary`, and optional details/options/multiSelect/planId/taskIds |
| `list` | Optional `offset` (default 0) and `limit` (default 20, maximum 20); results contain full records for that page and `nextOffset` when more remain |
| `apply` | Current `id`, per-question `revision`, and a concrete `reason`; only a delivered answered response can be reported applied |
| `withdraw` | Current `id`, `revision`, and `reason`; not approval |
| `replace` | Current `id`, `revision`, `reason`, and replacement `question`; retains original provenance |

```json
{
  "op": "post",
  "question": {
    "question": "Should publication remain out of scope?",
    "urgency": "deferred",
    "why": "Publication scope belongs to you.",
    "boundary": "Publication waits; authorized local checks can continue."
  }
}
```

`question` text is limited to 2000 characters; details to 4000; why/boundary to 1200 each. Posted choices have 1–20 options and at most 20 task links. The queue retains at most 100 records and 1 MiB on the active branch. Use revisions from a fresh `list` result, not an assumed number. For example, an agent reporting application of a delivered answer supplies:

```json
{
  "op": "apply",
  "id": "q1",
  "revision": 4,
  "reason": "Publication remains excluded; only the authorized local checks continue."
}
```

The number `4` is **illustrative**, not a revision to copy into a real call. If delivery, consent or scope is unresolved, application is not valid. This operation records an agent report; it does not independently verify behavior or mutate Tasks. Linked-work gating is not a generic tool-permission sandbox.

## Keyboard controls

Controls vary with the active field; the UI shows the available actions.

- **Up/Down**: move through choices or review content
- **Enter**: in a batch multi-select question, toggle the highlighted option (or edit **Something else**); elsewhere select, confirm, save, advance, or submit as indicated
- **Space**: also toggle the highlighted option in a batch multi-select question
- **Left/Right**: move between choice questions; inside free text, move the text cursor
- **Ctrl+Left/Right**: move between batch questions, including while editing free text
- **Tab / Shift+Tab**: focus **+ Note** from the answer or save an active note and return to the answer; press **Enter** or **+** on the focused row to edit
- **Shift+Enter** (Ctrl+J in supported terminals): insert a newline in an editor
- **Ctrl+Enter / Alt+Enter** (single question): submit a free-form question while editing its note
- **Ctrl+C**: clear an answer editor where shown; while editing a note, discard that note edit and return to the answer
- **Escape**: go back, clear/cancel, or require a second press when answers would be discarded
- **Ctrl+S** (single or batch): skip the question; in a batch, restore a previously skipped question
- **Ctrl+Enter / Alt+Enter** (batch): open Review without silently skipping unanswered questions; an explicitly all-skipped batch is also allowed
- **Number keys in Review**: with up to nine questions, press `1` through the question count to edit immediately; with ten or more, type the question number and press **Enter** to edit, or **Esc** to clear the number
- **Ctrl+R**: regenerate unanswered batch questions after at least one has been answered; visible on eligible question and Review screens, also under **F2 More**
- **Ctrl+?** (Ctrl+/ equivalent): ask the agent for clarification; Enter sends it and Escape returns

### Editing notes

The **+ Note** row stays in place whether empty, showing a preview, or being edited. Press **Tab** to focus its + control, then **Enter** or **+** to open the accent-outlined note editor below it. From a choice list, **+** opens the note directly; within a free-text answer, **+** inserts a literal plus. The editor has a plain interior, like the answer and clarification editors; the control itself does not show a text cursor.

- **Enter** or **Tab** saves the note and returns directly to the answer. **Ctrl+C** or **Escape** discards changes since opening the note and restores its last saved text; neither closes the question.
- **Shift+Enter / Ctrl+J** adds a new line. The editor's native undo binding (**Ctrl+_** by default) still works while typing.
- **Ctrl+Enter / Alt+Enter** submits a single question or opens batch Review when an answer is ready.
- **Ctrl+S** skips the whole question, not only the note. An unsent skipped note stays in the form until submission or cancellation.

Keyboard hints wrap to fit the terminal. Large pasted notes retain their full content when returned to the agent, even when the editor shows a compact paste preview.

## Non-TUI behavior

The synchronous `ask_user_question` and `ask_questions` tools require Pi's interactive TUI. In RPC, print or other non-interactive modes they return structured `unavailable` rather than prompting on stdin; an already-aborted call returns `cancelled`. `question_queue` can post, list and disposition records outside TUI. Answering a posted question requires TUI; queue availability does not mean an answer or approval exists.

## Security

Question text, answer text, notes, and clarification requests become tool results and may be sent to the active model provider or retained in session history. Do not enter secrets unless you trust that provider and your Pi configuration. This package does not add network requests or credential storage of its own.

## Compatibility

The package uses the current Pi extension API and declares `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox` as peer dependencies with `*`, as recommended for Pi packages. It is intended for current Pi releases and terminals that support the displayed key sequences. Older Pi/TUI versions are not tested.

## Optional herdr interoperability

While a dialog is open, the extension emits `herdr:blocked` on Pi's shared event bus:

```ts
{ active: true, label: "Waiting for your answer" }
{ active: false }
```

Batch dialogs use “Waiting for your answers”. This is optional interoperability metadata; no herdr package is required.

## Known limitations

- Questions are interactive only in TUI mode.
- Only one question dialog is shown at a time.
- Key handling depends on the terminal correctly reporting modified keys; Ctrl+/ is accepted as an equivalent encoding for Ctrl+?.
- The package has no screenshot or animation yet.
- Compatibility with older Pi versions and every terminal emulator is not guaranteed.

## Development

For this suite checkout, work from the **repository root** with an installed compatible Pi host:

```sh
npm ci
npm run test:ask
npm run typecheck --workspace=pi-ask
npm run pack:check --workspace=pi-ask
```

If developing Ask as a separate package checkout rather than this workspace, install its own development dependencies before using its `npm test`, `npm run typecheck` and `npm run pack:check` scripts.

Ask's package `npm test` uses `tsx`; the suite's `test:ask` selects the installed-host runner. From the Ask package directory, `node --test test/host.test.mjs` runs the same TypeScript tests against that host without installing Ask's test-tool dependencies there. It still needs a compatible installed host and resolvable Frame runtime dependency (`PI_ASK_HOST_MODULES` can select an explicit host node_modules directory). `pack:check` prints the files that would be published without creating or publishing a release.

There is intentionally no build script. Pi loads extension `.ts` files directly through jiti, and this package publishes `extensions/questions.ts` rather than generated JavaScript. Use `npm run typecheck` for compile-time validation and `npm run pack:check` to verify the publish contents.

## Contributing

Issues, focused pull requests, terminal compatibility reports, documentation improvements, and an honest demo asset are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). This project is licensed under the [MIT License](LICENSE).
