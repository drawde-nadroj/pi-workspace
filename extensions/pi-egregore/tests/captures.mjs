import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Unique per test process, intentionally retained for manual visual inspection.
let directory;
export function writeCapture(name, content) {
  directory ??= mkdtempSync(join(tmpdir(), "pi-workspace-captures-"));
  const path = join(directory, name);
  writeFileSync(path, content);
  console.log(`Capture: ${path}`);
  return path;
}
