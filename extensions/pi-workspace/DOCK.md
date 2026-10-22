# Workspace dock v1

A small optional integration contract, not a replacement UI framework. Runtime definitions are in the checkout's shared `lib/workspace-dock.ts`, outside either extension directory. This suite is checkout-loaded; the old personal-agent directory is not its runtime authority. Workspace or Tasks can be disabled independently without deleting the shared adapter.

## Ownership

Workspace owns editor/header/footer composition and its above-editor workspace widget. A provider owns its state, commands, tool behavior, and fallback widget. Providers send **display data**, not components, callback code, or terminal escape sequences.

The first consumer is `pi-tasks`. Workspace works without it; Tasks works without Workspace. Disabling Tasks withdraws its rows and disables its own behavior. Disabling Workspace announces unavailability so providers can use their native views.

## Event handshake

Use `pi.events`:

| Channel | Payload / effect |
| --- | --- |
| `pi-home:dock:v1:probe` | Provider asks whether a host is installed |
| `pi-home:dock:v1:host` | `{ version: 1, sessionId, available, colors? }` |
| `pi-home:dock:v1:update` | `{ version: 1, sessionId, id, title, rows, hint?, summary?, more?, layout? }` |
| `pi-home:dock:v1:ack` | `{ version: 1, sessionId, id, mounted }` |

`rows` contains `{ text, tone? }`; tone is `text`, `muted`, `accent`, `success`, `warning`, or `error`. An empty rows array withdraws the provider's panel; the host may keep the most recent Tasks snapshot (for the composer active-task hint) while `mounted` stays false, so nothing is drawn. The optional color map includes those six roles plus `base` and `panel`, as concrete six-digit hex colors.

Register handlers during factory loading; publish only with an active session context. Probe on session start, and republish on an available-host announcement. Workspace also announces when enabled/disabled or its look changes. This handles either extension startup order. Use a stable namespaced provider ID and the current `ctx.sessionManager.getSessionId()`; reject other sessions and unknown protocol versions.

After an acknowledgement, suppress your own fallback while `mounted` is true. On host unavailability, immediately show your fallback again. Remove your rows on shutdown. Pi owns event subscription teardown at runtime replacement; each extension must still release its own UI/resources and stop using old contexts.

## Bounds and semantics

- The host accepts at most six provider IDs, in insertion order.
- A snapshot has at most twelve bounded text rows. Optional `more` is the number of additional records not included in those rows; optional `summary` is a short, quiet right-aligned header label.
- Every snapshot uses one wrapping rule. `layoutDock` allocates a physical-line budget per row, gives accent (active) text spare lines first, marks clipped text with an ellipsis and omits unused padding rows. There is no provider-selected focus or compact layout: `title`, `summary`, `rows`, `hint` and `more` are shown as sent.
- `fitDock` reserves a `+ N more · <hint>` row only when necessary, including both host-hidden and provider-omitted rows in the count. Do not send an overflow message as a data row as well.
- The normal workspace fits five items plus an overflow row for a long list. Three-item plans remain fully visible in small panes; a shared height budget applies across multiple providers. Providers supply a command hint for full details.
- `mounted` means the host accepted ownership of the display, **not** a guarantee that every row is visible at every terminal size.
- Widgets and text never mutate task state. A row saying “done” is not a verification event.
- Terminal controls are stripped and text is measured/clipped by terminal-cell width.
- The current version has no action callbacks, arbitrary per-provider layout, reserved transcript sidebar, priority arbitration, or shared state database. Add those only for a concrete need.

The bus is local to trusted extensions in the same pi process. Provider IDs are not authenticated, and this is not a sandbox/security boundary.
