// The example is loaded through the same bundled-loader path the suite uses, so
// resolution failures surface here rather than in a real Pi process.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { jiti, visibleWidth } from "../../extensions/pi-workspace/tests/host.mjs";

const directory = fileURLToPath(new URL(".", import.meta.url));
const { DOCK, isHost, isSnapshot, validOverview } = await jiti.import("pi-agent-contracts/dock");
const { default: examplePlanDock } = await jiti.import(join(directory, "index.ts"));

/** Records what the extension asks the host to do, without a real Pi process. */
function fakePi() {
  const tools = new Map(), handlers = new Map(), entries = [], emitted = [], listeners = new Map(), resolvers = [];
  const api = {
    registerTool: definition => { tools.set(definition.name, definition); },
    registerToolRenderer: resolver => { resolvers.push(resolver); },
    appendEntry: (customType, data) => { entries.push({ type: "custom", customType, data: structuredClone(data) }); },
    on: (event, handler) => { handlers.set(event, handler); },
    events: {
      on: (event, handler) => { listeners.set(event, [...(listeners.get(event) ?? []), handler]); },
      emit: (event, payload) => {
        emitted.push({ event, payload });
        for (const handler of listeners.get(event) ?? []) handler(payload);
      },
    },
  };
  return {
    api, tools, entries, emitted, listeners, resolvers,
    fire: (event, context) => handlers.get(event)?.({}, context),
  };
}

function fakeContext(sessionId, branch = []) {
  const notices = [];
  return {
    notices, mode: "tui",
    sessionManager: { getSessionId: () => sessionId, getBranch: () => branch },
    ui: { notify: (message, level) => notices.push({ message, level }) },
  };
}

const updates = pi => pi.emitted.filter(record => record.event === DOCK.update);

test("registers exactly one plan tool and claims no host role", async () => {
  const pi = fakePi();
  examplePlanDock(pi.api);
  assert.deepEqual([...pi.tools.keys()], ["example_plan"]);
  const tool = pi.tools.get("example_plan");
  assert.equal(tool.renderShell, "self");
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ["items", "title"]);
  await pi.fire("session_start", fakeContext("s1"));
  assert.ok(pi.emitted.some(record => record.event === DOCK.probe), "asks a host to advertise itself");
  assert.ok(!pi.emitted.some(record => record.event === DOCK.host), "a provider must not answer its own probe");
});

test("a mutation persists first, then publishes one snapshot that validates", async () => {
  const pi = fakePi();
  examplePlanDock(pi.api);
  const context = fakeContext("s1");
  await pi.fire("session_start", context);
  pi.emitted.length = 0;
  const result = await pi.tools.get("example_plan").execute("call-1", {
    title: "Ship the contract",
    items: [{ title: "Read the contract" }, { title: "Write a provider", doneWhen: "a row appears" }],
  }, undefined, undefined, context);

  assert.match(result.content[0].text, /Ship the contract/);
  assert.equal(pi.entries.length, 1);
  assert.equal(pi.entries[0].customType, "example-plan:v1");
  assert.equal(updates(pi).length, 1);
  const snapshot = updates(pi)[0].payload;
  assert.ok(isSnapshot(snapshot), JSON.stringify(snapshot));
  assert.ok(validOverview(snapshot.overview));
  assert.equal(snapshot.sessionId, "s1");
  assert.equal(snapshot.id, "example-plan");
  assert.deepEqual(snapshot.rows.map(row => row.text), ["Read the contract", "Write a provider"]);
  assert.equal(snapshot.overview.total, 2);
  assert.equal(snapshot.overview.done, 0);
});

test("the host side of the contract is a valid DockHost plus DockAck", async () => {
  // Workspace performs this role. Asserted here so a reader sees both directions.
  assert.ok(isHost({ version: 1, sessionId: "s1", available: true }));
  assert.ok(!isHost({ version: 1, sessionId: "s1" }), "available is required");
  const ack = { version: 1, sessionId: "s1", id: "example-plan", mounted: false };
  assert.deepEqual(Object.keys(ack).sort(), ["id", "mounted", "sessionId", "version"]);
});

test("a persisted plan that cannot be represented is not published", async () => {
  const pi = fakePi();
  examplePlanDock(pi.api);
  const context = fakeContext("s2", [{
    type: "custom", customType: "example-plan:v1",
    data: { version: 1, revision: "r1", title: "x".repeat(401), items: [{ title: "too long a title to publish" }] },
  }]);
  await pi.fire("session_start", context);
  assert.equal(updates(pi).length, 0, "an unrepresentable snapshot is never emitted");
  assert.equal(context.notices.length, 1, "one warning, not one per publish");
  assert.match(context.notices[0].message, /not publishable/);
});

test("the tool renderer seam covers this tool only and stays width-bounded", async () => {
  const pi = fakePi();
  examplePlanDock(pi.api);
  assert.equal(pi.resolvers.length, 1, "one resolver, registered for the documented seam");
  const [resolve] = pi.resolvers;
  const base = { renderShell: "default", renderCall: () => ({}), renderResult: () => ({}) };
  assert.equal(resolve("read", () => base), base, "a tool we do not own keeps Pi's renderers");
  assert.equal(resolve("example_plan", () => undefined), undefined, "no base renderers stays none");
  const ours = resolve("example_plan", () => base);
  assert.equal(ours.renderShell, "self");
  assert.equal(ours.renderCall, base.renderCall, "the call slot is left native");

  const compact = ours.renderResult({ content: [] }, { expanded: false, isPartial: false }, {}, { expanded: false }).render(40);
  const expanded = ours.renderResult({ content: [] }, { expanded: true, isPartial: false }, {}, { expanded: true }).render(40);
  assert.ok(expanded.length > compact.length, "expanded shows the extra row");
  assert.match(compact.join("\n"), /example_plan/);
  // Every width either renders inside its budget or renders nothing at all.
  for (const width of [0, 8, 12, 15, 16, 20, 37, 40, 120]) for (const row of ours.renderResult({ content: [] }, {}, {}, { expanded: true }).render(width))
    assert.ok(visibleWidth(row) <= width, `width ${width}: ${visibleWidth(row)} cells: ${row}`);
});

test("a replacement plan is restored from its own session entry", async () => {
  const pi = fakePi();
  examplePlanDock(pi.api);
  const branch = [{ type: "custom", customType: "example-plan:v1", data: { version: 1, revision: "r9", title: "Restored", items: [{ title: "Still open" }] } }];
  await pi.fire("session_start", fakeContext("s3", branch));
  const snapshot = updates(pi).at(-1).payload;
  assert.ok(isSnapshot(snapshot));
  assert.equal(snapshot.title, "Restored");
  assert.equal(snapshot.overview.revision, "r9");
});

test("switching branch republishes that branch's plan, not the previous one", async () => {
  const pi = fakePi();
  examplePlanDock(pi.api);
  await pi.fire("session_start", fakeContext("s4", [{
    type: "custom", customType: "example-plan:v1", data: { version: 1, revision: "r1", title: "First branch", items: [] },
  }]));
  assert.equal(updates(pi).at(-1).payload.title, "First branch");
  // The same extension instance survives a tree switch; the branch is new data.
  await pi.fire("session_tree", fakeContext("s4", [{
    type: "custom", customType: "example-plan:v1", data: { version: 1, revision: "r2", title: "Second branch", items: [{ title: "Other work" }] },
  }]));
  const snapshot = updates(pi).at(-1).payload;
  assert.ok(isSnapshot(snapshot));
  assert.equal(snapshot.title, "Second branch");
  assert.deepEqual(snapshot.rows.map(row => row.text), ["Other work"]);
});

