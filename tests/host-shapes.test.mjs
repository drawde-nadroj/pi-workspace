// Workspace deliberately reads a small number of host-internal symbols and keeps a
// graceful fallback for each. Without this canary a host upgrade would silently
// degrade rendering instead of failing one named test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const install = join(homedir(), ".pi/agent/install");
const hostModules = process.env.PI_WORKSPACE_HOST_MODULES || process.env.PI_HOME_HOST_MODULES ||
  join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules");
const load = path => import(pathToFileURL(join(hostModules, path)).href);

const hosts = {
  agent: await load("@earendil-works/pi-coding-agent/dist/index.js"),
  tui: await load("@earendil-works/pi-tui/dist/index.js"),
  alt: await load("@earendil-works/pi-tui/dist/tui-alt-screen.js"),
  main: await load("@earendil-works/pi-tui/dist/tui-main-screen.js"),
};

const SHAPES = [
  { symbol: "ToolExecutionComponent.prototype.render", host: "agent", file: "activity-blocks.ts", fallback: "native tool card" },
  { symbol: "ToolExecutionComponent.prototype.handleMouse", host: "agent", file: "activity-blocks.ts", fallback: "native mouse handling" },
  { symbol: "ToolExecutionComponent.prototype.invalidate", host: "agent", file: "activity-blocks.ts", fallback: "native invalidation" },
  { symbol: "Container.prototype.render", host: "tui", file: "copy-selection.ts", fallback: "native selection text" },
  { symbol: "TuiAltScreen.prototype.getSelectionBounds", host: "alt", file: "copy-selection.ts", fallback: "native selection text" },
  { symbol: "TuiAltScreen.prototype.getSelectionColumns", host: "alt", file: "copy-selection.ts", fallback: "native selection text" },
  { symbol: "TuiAltScreen.prototype.getActiveSelectionText", host: "alt", file: "copy-selection.ts", fallback: "native selection text" },
  { symbol: "TuiAltScreen.prototype.render", host: "alt", file: "paint-guard.ts", fallback: "unclipped repaint" },
  { symbol: "TuiAltScreen.prototype.doRender", host: "alt", file: "paint-guard.ts", fallback: "unclipped repaint" },
  { symbol: "TuiMainScreen.prototype.doRender", host: "main", file: "paint-guard.ts", fallback: "unclipped repaint" },
  { symbol: "UserMessageComponent.prototype.render", host: "agent", file: "native-message-adapter.ts", fallback: "native message layout" },
  { symbol: "AssistantMessageComponent.prototype.render", host: "agent", file: "native-message-adapter.ts", fallback: "native message layout" },
];

const hint = shape => `host shape changed: ${shape.symbol} — update extensions/pi-workspace/${shape.file} (docs/PRIMITIVES.md#host-internals). Fallback today: ${shape.fallback}`;

for (const shape of SHAPES) test(`host shape: ${shape.symbol}`, () => {
  const [className, member] = shape.symbol.split(".prototype.");
  const constructor = hosts[shape.host][className];
  assert.equal(typeof constructor, "function", hint(shape));
  assert.equal(typeof constructor.prototype[member], "function", hint(shape));
});

/** Native renderer identity is how Workspace distinguishes a built-in tool from a
 * third-party override; without the factories every card falls back to native. */
test("host shape: native tool renderer factories", () => {
  for (const name of ["createReadToolDefinition", "createEditToolDefinition", "createWriteToolDefinition",
    "createGrepToolDefinition", "createFindToolDefinition", "createLsToolDefinition"]) {
    const create = hosts.agent[name];
    assert.equal(typeof create, "function",
      `host shape changed: ${name} — update extensions/pi-workspace/activity-blocks.ts (docs/PRIMITIVES.md#host-internals). Fallback today: every tool card stays native`);
    const definition = create("");
    assert.ok(definition && "renderCall" in definition && "renderResult" in definition,
      `host shape changed: ${name}().renderCall/renderResult — update extensions/pi-workspace/activity-blocks.ts (docs/PRIMITIVES.md#host-internals)`);
  }
});
