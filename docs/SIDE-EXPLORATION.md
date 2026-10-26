# Side exploration: architecture assessment

Status: **investigated, not implemented**. This is a later release direction, not a `/btw` command or an extra panel in the current release.

## Desired experience

A person explicitly chooses to explore a possibility on the side, develops it without losing the main conversation, and returns with useful understanding retained in the quest journal. Choosing inquiry does not authorize implementation. Main-session draft, navigation position and intent must remain recoverable. Journal capture and returning to the main conversation are distinct actions.

## Available host mechanisms

Source inspection used the installed Pi 1.4.0 `docs/extensions.md`, `docs/tui.md`, `dist/core/extensions/types.d.ts` and `examples/extensions/qna.ts`. These are API facts and design interpretations, not a running side-conversation prototype.

| Mechanism | Verified API fact | Implication |
| --- | --- | --- |
| Command-driven fork | `ExtensionCommandContext.fork(entryId, {position, withSession})` creates a separate session file. | Could preserve a main-session bookmark and open a side thread at a known boundary. A fork inherits context rather than automatically narrowing it to the quest. |
| New initialized session | `newSession({parentSession, setup, withSession})` supports a parent reference and setup. | Could seed bounded quest context rather than the entire main thread. Context selection and provenance need an explicit contract. |
| Return to main | `switchSession(sessionPath, {withSession})` switches files; `navigateTree(targetId, options)` navigates a session tree. Both can report cancellation. | Returning requires an exact bookmark and successful fresh-context handoff. A cancelled switch must retain recoverable side state. |
| Overlay with a nested model call | `qna.ts` demonstrates a cancellable overlay calling `ctx.modelRegistry.complete`. | This is not a ready-made secondary agent conversation. It would need separate history, model/tool permissions, costs, cancellation and result handling. |
| Custom UI | `ctx.ui.custom` supports focused overlays, temporary hiding and cleanup. | An overlay alone supplies neither an independent conversation nor guaranteed draft/undo restoration. |

Session-switch operations are command-only because lifecycle use can deadlock. Replacement invalidates old context; session-bound work must use the fresh `withSession` context. Capturing plain bookmark data before a switch is appropriate; retaining an old editor/context object is not.

## Recommended next architecture

Prefer an **explicit command-driven separate session** over simulating an entire second agent inside a modal. First prototype the smallest enter/return journey, with no automatic implementation tools or automatic summarization request. Choose fork versus initialized session after comparing continuity with bounded context.

A versioned bookmark would need the main session path, branch entry, selected quest, side session identity and a safe draft-preservation strategy. The draft/undo behavior of native session switching has not been verified here: do not promise preservation until tested with the actual editor and pi-vim. Cross-session Ask answers must remain owned by their original branch; historical journal snapshots cannot replay approval.

Useful return material could include discoveries, changed understanding and unresolved questions. Make recording that material retry-safe, using existing source-linked quest records. Returning itself should not send a new work request, replay the initial invitation or mark work complete.

## Acceptance gates for a later prototype

- Enter only from an explicit user action at a safe run boundary.
- Preserve or visibly recover main draft, Vim state, selected branch and quest context.
- Handle cancelled entry/return, reload, shutdown and a missing session without losing either thread.
- Distinguish conversational exploration from permitted concrete work.
- Keep capture, answer application and task updates under their existing owners.
- Show model/cost behavior before introducing additional calls; no hidden background conversation.
- Verify keyboard and narrow-width navigation in the actual host.

The current release instead provides contextual possibility presentation, journal directions and explicit keep/explore/make records. It adds no Obsidian synchronization, side-agent runtime, activity panel or background exploration.
