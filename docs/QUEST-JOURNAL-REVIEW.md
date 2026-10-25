# Quest journal: glance first, detail on demand

Focused review of the quest-detail screenshot supplied on 2026-10-25 and `extensions/pi-quests/{index,surface}.ts`. This is a single-screen audit, not a whole-suite usability assessment. The later collaboration pass implemented counted read-only disclosures, a compact overview and a separate current next move. The findings below describe the original screenshot; they remain design rationale rather than user-testing results. A wide split-pane layout remains a proposal.

## Findings

- **Everything reads as primary.** Purpose, next move, goal, developments, evidence, task snapshots and provenance form one long text surface. Colored headings provide grouping, but not a clear priority for resuming work.
- **The first move can become stale.** The screenshot describes an initial prototype as the next move while later developments describe an implemented observer and panel. `firstMove` is stored text, not a dynamically derived next action. Separate the original invitation from a current next move; the agent should reconcile the latter against recorded work rather than the renderer inventing it.
- **History competes with the present.** Full task lists, earlier developments, commit/test details, timestamps and source IDs consume the space needed to understand current status. Keep the evidence and provenance, but disclose them when requested.
- **Empty sections receive unnecessary emphasis.** No recorded questions or connections should be a quiet count/disclosure, not a heading plus a full empty-state sentence each.
- **Long lines make scanning harder.** More terminal width currently allows longer paragraphs rather than a clearer hierarchy. A compact main column or wide list/detail arrangement is worth testing.

The useful principle is **a current-state view backed by a readable journal**. This applies Nielsen's status visibility, recognition and relevance heuristics: essential context remains visible; less-frequent detail stays discoverable. It does not require removing expressive color or useful information.

## Proposed default

1. Quest title, labelled status and short workspace name.
2. One meaningful current development, with any unresolved blocker visible.
3. Current next move, distinct from the original first move.
4. Linked work summary such as `4 done · 1 blocked`, with the blocked item visible. These are task counts, not a fabricated quest-completion percentage.
5. Labelled disclosures: `▸ History`, `▸ Evidence`, `? Questions`, `↗ Connections`, `▸ Source`. Pair symbols with words and provide plain-text fallbacks; no special font should be required.
6. Stable, visible actions and keyboard help. Continue, save, pause and visibility controls should remain reachable while details scroll.

Jade can identify the pursuit and structure; gold can emphasize open questions and discoveries. Neutral text carries prose. Current blockers should have explicit wording, not color alone. Source IDs, full paths and exact timestamps belong in Source or detailed history; preserve their original values.

## Missing bottom rail: diagnosis and implemented correction

The quest selector previously budgeted content from the entire terminal height while using `ctx.ui.custom()` in the editor area. That area also coexists with widgets and the footer. A correctly generated frame could therefore extend below the visible viewport. It also enforced a minimum height that could exceed a very short terminal.

`frameRows` returns a top rail, the supplied content, and a bottom rail. It does not know the host's available vertical space or own scrolling. The defect was in the integrating surface's sizing contract, not evidence that Frame omitted its closing rail.

The selector now uses a focused overlay with an explicit 90% height limit and the same budget in its renderer. It reserves rows for actions and both rails, scrolls the prose, and uses an unframed compact fallback for tiny dimensions. The host's overlay cap is a backstop; the component fits itself before the host clips it.

Regression coverage checks long content, narrow/wide widths, repeated height changes, the closing rail, last-action reachability and overlay options. The previous tests covered width and scrolling but not the mounted height budget. These automated checks do not establish physical terminal appearance; repeat the original scenario after restarting Pi.
