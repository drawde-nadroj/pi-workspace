# Example: minimal plan dock

A copyable dock **provider** showing the whole contract: one tool
(`example_plan`), one session entry (`example-plan:v1`), one
`pi.registerToolRenderer` renderer, and a validated `DockSnapshot` published on
`DOCK.update` after every mutation. Loaded next to Workspace its rows appear in
the dock; with no host it still works and simply renders nothing.

| File | Role |
| --- | --- |
| `index.ts` | The extension: tool, session entry, renderer, snapshot, validation gate |
| `test.mjs` | Drives the extension through a fake `ExtensionAPI` and asserts the message shapes |
| `README.md` | This page |

Four things are worth copying from `index.ts`: state goes in a session entry, never
in this repository; `restore()` validates persisted data instead of casting it;
`publish()` runs `isSnapshot`/`validOverview` before emitting and stays silent when
the state cannot be represented; and the renderer returns `next()` untouched for
tools it does not own, so another extension's override survives.

## Load it

From the suite root, `npm ci` (this links the `pi-agent-contracts` workspace
package), then in a scratch directory:

```sh
PI_CODING_AGENT_DIR=$(mktemp -d) pi install ./examples/minimal-plan-dock
```

Ask the agent to call `example_plan` and, with Workspace loaded, watch the dock
row appear. Run the assertions with `npm run test:examples`.

## What it deliberately omits

No plan history, requirements ledger, Ask integration, native fallback widget or
`/commands` — [Tasks](../../extensions/pi-tasks/README.md) is the full version. It
is also **not** a host: answering `DOCK.probe` with `available: true` while
rendering nothing would make every other provider suppress its native fallback.
Workspace owns that side; see the [contracts](../../packages/pi-agent-contracts/README.md)
package and the [primitive contracts](../../docs/PRIMITIVES.md).
