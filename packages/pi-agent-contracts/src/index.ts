// One import path for every cross-component contract. Subpath imports
// (`pi-agent-contracts/dock`, `pi-agent-contracts/posted`) are preferred in
// extensions so a reader sees which protocol a file depends on.
export * from "./dock.ts";
export * from "./posted.ts";
