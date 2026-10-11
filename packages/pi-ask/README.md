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

## Highlights

- **Regenerate unanswered questions from completed answers.** Answer the useful parts of a batch, press **Ctrl+R**, and let the agent replace only the questions that no longer fit. Your resolved answers and notes become context for the new questions instead of being asked again.
- **Review before deciding what to omit.** Press **Ctrl+Enter** to compare answered, explicitly skipped, and still-unanswered questions. Only **Submit without N unanswered** marks the remaining questions skipped.
- **Attach notes to individual answers.** Focus the persistent **+ Note** row and press Enter to type; Tab saves the note and returns to the answer. A note on a skipped question stays in the form but is not sent.
- **Ask the agent what a question means without leaving the dialog.** Clarify ambiguous wording before a misunderstanding becomes part of the work.
- **Mix the right response types.** Use single-choice, multi-select, custom **Something else…** answers, and multiline free-form input in the same batch.
- **Review the whole batch before submitting it.** Catch accidental choices and see related decisions together before committing them to the conversation.
- **Spend context on decisions, not repairs.** Batch related unknowns, preserve resolved answers, and regenerate only what is stale instead of burning tokens on repeated clarification or work based on bad assumptions.

The package exposes two tools:

- **`ask_user_question`** asks one free-form, single-choice, or multiple-choice question.
- **`ask_questions`** collects several related answers in a sequential form with a compact **1 of N** header and a Review screen.

## Rounded question panel

Questions temporarily replace the main input area with a **Questions** panel: rounded framing, the terminal’s own background, and native multiline fields. The panel, the **What are you wondering about?** clarification field, the inline **Something else…** editor, and the active note editor embed the installable `pi-embeddable-frame` renderer; their text input, focus, completion and submit behavior remain owned by pi-ask. The default lower-left **1 of N** indicator replaces the former question-summary bar; the full overview appears on Review. A question-local orange accent highlights focus without changing the global theme. The **Questions** title and progress match its orange border by default and both frame-rail labels are bold; question wording and answer text retain their own emphasis rules. In the suite, `/footer` → **Ask** can edit a synthetic preview and save bounded title/rail, question-emphasis and hint-tone settings in `pi-footer.json` → `ask` (version 1); standalone Ask reads that section once when a question opens, with legacy `questionLabels` as a fallback. The question wording, focus and answer actions never come from appearance settings. Choice markers and native cursor/selection behavior remain. On a small terminal the panel reduces its frame rather than discarding answer state. There is no continuous animation while you are reading or typing.

Keyboard hints use **↵** for Enter and **⇧↵** for Shift+Enter, with readable action words. The primary action and **Ctrl+S Skip question** stay visible while answering or editing a note. No Nerd Font is required. Tool cards use **Question** / **Questions** rather than internal tool names.

Pi holds the real prompt draft while the question owns the input area, then restores it. Composer’s Vim integration preserves the existing editor instance and skips the unchanged-draft reset during native dialog restoration. Selection, `@` file-completion, clarification, skip, and review/submit controls remain available. Run `/reload` after updating the local package.

## Best usage: ask when an answer changes direction

If you want the agent to check for important unknowns, try:

> **Before you start, identify any unknowns only I can answer that would materially change your exploration or next action. Ask focused questions about those; if none are needed, proceed. If I'm exploring ideas, begin open-ended rather than forcing a decision menu.**

Give the agent relevant context, especially context already shared in the conversation or project. It can use `ask_questions` to gather related unknowns rather than guessing or interrupting repeatedly. It should not ask questions simply to fill a batch. First it should inspect what it can, make a provisional judgment, and ask only when different answers would materially change its next action. It can proceed with a stated, reversible assumption when the choice does not belong to you.

### Inquiry charter

**Purpose:** strengthen a person's ability to understand and act, not merely collect structured answers. The agent owes the person its own thinking before asking for theirs.

- **Attend before intervening.** Read what has already been said and investigate available evidence. Do not ask someone to repeat a fact the agent can find.
- **Separate kinds of uncertainty.** Findable facts call for research; low-risk, reversible choices can be made with stated assumptions; consequential preferences, consent, and lived experience belong to the person.
- **Ask at a real fork.** A question is earned when plausible answers would change the next action. Show the finding, trade-off, or uncertainty that makes the answer matter. One pivotal question beats a long questionnaire; zero questions can be the right result.
- **Recommend without taking over.** Offer a reasoned provisional path for technical choices, including what could change it. For open exploration, reflect the problem before narrowing it to a menu. Keep room to disagree.
- **Learn from the answer.** Show what changed, do the work, and drop stale follow-ups. When the person asks for clarification or revision, reconsider whether a question is still necessary instead of mechanically re-asking it.

This is a design ethic, not a claim that the tool verifies an agent's judgment. The educational ambition is to cultivate attention, evidence, judgment, creation, and revision while preserving the learner's agency. The software currently provides question and answer affordances plus agent-facing guidance; its real effect must be evaluated in use, including whether people leave better informed and more capable of acting without it.

For example, a weak question is *“Which architecture do you want: A, B, or C?”* before investigating the code. A stronger agent first inspects the project: *“A preserves your current editor state; B replaces it and risks losing Vim undo. I would use A. Is replacing the editor acceptable for a specific reason I have missed?”* If that difference does not affect the task, it should simply proceed with A.

More useful context usually produces better work. A question batch creates a quick path to shared understanding: answer what you know, add notes where nuance matters, and ask the agent for clarification from inside any question you do not understand.

### Revise unanswered questions

You do not have to finish a batch whose later questions no longer fit. After answering at least one question, leave the questions that need rethinking unanswered and press **Ctrl+R**. The plugin returns your completed answers and notes to the agent as new context and preserves them as resolved. The agent should reassess the unanswered questions: revise only those still consequential, or explain why none remain and continue the work. You should not have to answer the same question again.

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

The result is higher-signal conversation history. Instead of mixing requirements, uncertainty, corrections, and guesses into one long message, the tool returns structured answers and notes that show what you chose, what you qualified, and what still needs work.

That can also make better use of a limited token budget. Asking a focused batch has an upfront cost, but it can avoid repeated clarification turns, discarded implementations, and obsolete assumptions taking up the context window. This is especially useful with local models that have smaller context windows, metered APIs, or any workflow where cost and context pressure matter.

## Comparison

These tools share the same basic goal, but optimize for different workflows. This comparison reflects **Claude Code 2.1.221**, **Codex CLI 0.146.1**, and the current version of this package; upstream behavior can change quickly.

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
### From Git

```bash
pi install git:https://github.com/the-sleeping-teemo/pi-context-seeker
```

### From a local checkout

```bash
git clone https://github.com/the-sleeping-teemo/pi-context-seeker.git
cd pi-context-seeker
npm install
pi install .
```

Restart Pi if it is already running. The package manifest explicitly loads only `extensions/questions.ts`; the test module is not an extension entry point.

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

## Keyboard controls

Controls vary with the active field; the UI shows the available actions.

- **Up/Down**: move through choices or review content
- **Enter**: in a batch multi-select question, toggle the highlighted option (or edit **Something else**); elsewhere select, confirm, save, advance, or submit as indicated
- **Space**: also toggle the highlighted option in a batch multi-select question
- **Left/Right**: move between choice questions; inside free text, move the text cursor
- **Ctrl+Left/Right**: move between batch questions, including while editing free text
- **Tab / Shift+Tab**: focus **+ Note** from the answer or close its editor directly back to the answer; press **Enter** on the focused row to type
- **Shift+Enter** (Ctrl+J in supported terminals): insert a newline in an editor
- **Ctrl+Enter / Alt+Enter** (single question): submit a free-form question while editing its note
- **Ctrl+C**: clear the active text editor where shown; in a note, clear only that note and keep the question open
- **Escape**: go back, clear/cancel, or require a second press when answers would be discarded
- **Ctrl+S** (single or batch): skip the question; in a batch, restore a previously skipped question
- **Ctrl+Enter / Alt+Enter** (batch): open Review without silently skipping unanswered questions; an explicitly all-skipped batch is also allowed
- **Number keys in Review**: with up to nine questions, press `1` through the question count to edit immediately; with ten or more, type the question number and press **Enter** to edit, or **Esc** to clear the number
- **Ctrl+R**: revise unanswered batch questions when some questions are already resolved
- **Ctrl+?** (Ctrl+/ equivalent): ask the agent for clarification; Enter sends it and Escape returns

### Editing notes

The **+ Note** row stays in place whether empty, showing a preview, or being edited. Press **Tab** to focus its + control, then **Enter** or **Space** to start typing in an orange-outlined field below it. The field has a plain interior, like the answer and clarification editors; the control itself does not show a text cursor.

- **Ctrl+C** clears the note without changing your answer or other questions. The editor's undo binding (**Ctrl+_** by default) can restore the cleared text.
- **Shift+Enter / Ctrl+J** adds a new line. **Tab** saves the note and returns directly to the answer; **Enter** or **Escape** also leaves the editor without submitting the answer.
- **Ctrl+Enter / Alt+Enter** submits a single question or opens batch Review when an answer is ready.
- **Ctrl+S** skips the whole question, not only the note. An unsent skipped note stays in the form until submission or cancellation.

Keyboard hints wrap to fit the terminal. Large pasted notes retain their full content when returned to the agent, even when the editor shows a compact paste preview.

## Non-TUI behavior

The tools require Pi's interactive TUI. In RPC, print, or other non-interactive modes they do not prompt on stdin: they return a structured `unavailable` result. An already-aborted call returns `cancelled`.

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

```bash
npm install
npm test
npm run typecheck
npm run pack:check
```

`npm test` runs the focused interaction and rendering regression tests. When using this local package inside Pi, `node --test test/host.test.mjs` runs the same TypeScript tests against the installed Pi host without installing development dependencies (`PI_ASK_HOST_MODULES` can select an explicit host node_modules directory). `pack:check` prints the files that would be published without creating or publishing a release.

There is intentionally no build script. Pi loads extension `.ts` files directly through jiti, and this package publishes `extensions/questions.ts` rather than generated JavaScript. Use `npm run typecheck` for compile-time validation and `npm run pack:check` to verify the publish contents.

## Contributing

Issues, focused pull requests, terminal compatibility reports, documentation improvements, and an honest demo asset are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). This project is licensed under the [MIT License](LICENSE).
