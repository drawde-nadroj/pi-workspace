import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve the established package root without using its possibly cached exports.
// Workspace uses the same package-owned primitive to frame normal sent messages.
const directory = dirname(createRequire(import.meta.url).resolve("pi-embeddable-frame"));
const primitives: typeof import("pi-embeddable-frame/primitives") = await import(
  pathToFileURL(join(directory, "primitives.js")).href
);
export const { frameRows } = primitives;
