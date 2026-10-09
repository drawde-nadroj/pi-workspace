import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Keep this package self-contained. A running Pi can cache an older frame
// export map, so resolve the established root without evaluating its old code
// and load the current implementation by file URL, not a newly added subpath.
const directory = dirname(createRequire(import.meta.url).resolve("pi-embeddable-frame"));
const primitives: typeof import("pi-embeddable-frame/primitives") = await import(
  pathToFileURL(join(directory, "primitives.js")).href
);
export const { frameRows, frameRail } = primitives;
