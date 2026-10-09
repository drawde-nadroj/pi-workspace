// Run the package's TypeScript tests against the installed Pi host, without installing dependencies.
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const install = join(homedir(), ".pi/agent/install");
const root = process.env.PI_ASK_HOST_MODULES || join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules");
const { createJiti } = await import(pathToFileURL(join(root, "jiti/lib/jiti.mjs")));
const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-tui": join(root, "@earendil-works/pi-tui/dist/index.js"),
  "@earendil-works/pi-coding-agent": join(root, "@earendil-works/pi-coding-agent/dist/index.js"),
  "typebox": join(root, "typebox/build/index.mjs"),
} });
const directory = fileURLToPath(new URL(".", import.meta.url));
for (const name of readdirSync(directory).filter(name => name.endsWith(".test.ts")).sort()) await jiti.import(join(directory, name));
