# pi-agent-contracts

Data-only contracts that let independently loaded Pi extensions describe work to
each other without importing each other's implementation: TypeScript types,
runtime validators, layout helpers and the versioned `pi.events` IDs for the
Workspace/Tasks dock (`./dock`) and the Ask posted-question protocol
(`./posted`). No components, React-style callbacks, settings writers, or plan and
answer mutation live here — a consumer validates what it receives and renders it
itself. The repository owns these modules; compatibility is versioned by the
`:vN` suffix inside each event ID, so a new field shape is published as a new ID
rather than redefining an existing one.
