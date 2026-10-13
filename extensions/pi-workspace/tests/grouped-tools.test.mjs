import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain, visibleWidth } from "./host.mjs";
const { GroupedTools } = await jiti.import(join(source, "grouped-tools.ts"));
const { ActivityBlocks } = await jiti.import(join(source, "activity-blocks.ts"));
const { FOOTER_DEFAULTS } = await jiti.import(join(source, "footer-state.ts"));
const { sentTime } = await jiti.import(join(source, "sent-metadata.ts"));
const { COMPOSER_ICONS } = await jiti.import(join(source, "composer-icons.ts"));
const { AssistantMessageComponent, ToolExecutionComponent, createReadToolDefinition, createWriteToolDefinition } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/index.js")));
const { Container, Text } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const ui = { requestRender() {} };
const timestamp = new Date(2025, 3, 4, 11, 42).getTime();
const message = (ids, at = timestamp) => ({ role: "assistant", timestamp: at, stopReason: "toolUse", content: ids.map(([id, name]) => ({ type: "toolCall", id, name, arguments: {} })) });
const tool = (name, id, definition) => new ToolExecutionComponent(name, id, { path: `${id}.txt` }, { showImages: false }, definition, ui, "/tmp");
const click = (node, width, y, x = 4) => node.handleMouse({ type: "click", button: "left", x, y, width, height: node.render(width).length, screenX: x, screenY: y, shift: false, alt: false, ctrl: false });
const printed = rows => rows.map(plain).join("\n");
function setup(ids = [["a", "read"], ["b", "write"]], at = timestamp, prefs = FOOTER_DEFAULTS) {
  const root = new Container(), owner = new AssistantMessageComponent(message(ids, at)), defs = { read: createReadToolDefinition("/tmp"), write: createWriteToolDefinition("/tmp") };
  const calls = ids.map(([id, name]) => tool(name, id, defs[name]));
  root.addChild(owner); for (const node of calls) root.addChild(node);
  const groups = new GroupedTools(() => theme, () => prefs);
  const blocks = new ActivityBlocks(() => theme, () => {}, () => "semantic", groups.isGrouped);
  return { root, owner, calls, groups, blocks };
}

test("replay groups adjacent call IDs under their issuing assistant's fixed Sent time", () => {
  const { root, owner, calls, groups, blocks } = setup();
  try {
    assert.equal(groups.sync(root), true); blocks.sync(root);
    assert.equal(root.children.length, 2);
    assert.equal(root.children[0], owner); assert.deepEqual(root.children[1].children, calls);
    const rows = root.render(90), text = printed(rows);
    assert.match(text, /Tools · 2 calls/);
    assert.match(text, new RegExp(`${COMPOSER_ICONS.sent} ${sentTime(timestamp, FOOTER_DEFAULTS, Date.now())}`));
    assert.equal(rows.filter(row => plain(row).startsWith("╭")).length, 1);
    assert.match(text, /· read a\.txt · preparing/); assert.match(text, /· write b\.txt · preparing/);
    assert.equal((text.match(/read a\.txt/g) ?? []).length, 1);
    assert.match(text, /b.txt/);
    for (const width of [12, 24, 28, 38, 90]) for (const row of root.render(width)) assert.ok(visibleWidth(row) <= width);
    assert.doesNotMatch(printed(root.render(24)), /Tools ·/);
  } finally { groups.dispose(); blocks.dispose(); }
  assert.deepEqual(root.children, [owner, ...calls]);
});

test("grouped tool identity and sourced Sent placement follow transcript appearance without changing children", () => {
  const prefs = { ...FOOTER_DEFAULTS, transcript: { version: 1, chat: { assistantLabel: "quiet", showSent: true, sentPosition: "bottomLeft" }, tools: { identity: "matched", status: "matched" } } };
  const { root, calls, groups, blocks } = setup(undefined, timestamp, prefs);
  try {
    groups.sync(root); blocks.sync(root);
    assert.deepEqual(root.children[1].children, calls);
    const rows = root.children[1].render(90);
    assert.ok(plain(rows.at(-1)).startsWith(`╰ ${COMPOSER_ICONS.sent} ${sentTime(timestamp, prefs, Date.now())}`));
    assert.match(plain(rows[0]), /Tools · 2 calls/);
    prefs.transcript.chat.showSent = false;
    assert.doesNotMatch(plain(root.children[1].render(90).at(-1)), /Sent /);
  } finally { groups.dispose(); blocks.dispose(); }
});

test("live streaming extends the same group and results, errors and expansion stay independent", () => {
  const { root, owner, calls: [a, b, c], groups, blocks } = setup([["a", "read"], ["b", "write"], ["c", "read"]]);
  root.removeChild(b); root.removeChild(c);
  try {
    assert.equal(groups.sync(root), false);
    root.addChild(b); groups.sync(root); blocks.sync(root);
    root.addChild(c);
    groups.sync(root); blocks.sync(root);
    assert.deepEqual(root.children[1].children, [a, b, c]);
    a.updateResult({ content: [{ type: "text", text: "first output" }], isError: false });
    b.updateResult({ content: [{ type: "text", text: "second failed" }], isError: true });
    c.updateResult({ content: [{ type: "text", text: "partial" }], isError: false }, true);
    assert.match(printed(root.render(90)), /✓ read a\.txt/);
    assert.doesNotMatch(printed(root.render(90)), /read.*returned/);
    assert.match(printed(root.render(90)), /× write b\.txt · failed/);
    assert.match(printed(root.render(90)), /◉ read c\.txt · running/);
    assert.match(printed(root.render(90)), /second failed/);
    const group = root.children[1];
    b.updateResult({ content: [{ type: "text", text: "stopped" }], details: { cancelled: true }, isError: true });
    assert.match(printed(group.render(90)), /■ write b\.txt · cancelled/);
    b.updateResult({ content: [{ type: "text", text: "second failed" }], isError: true });
    const before = group.render(90);
    // The compact heading toggles the original component without changing its result.
    assert.equal(click(group, 90, 1)?.handled, true);
    assert.equal(a.expanded, true);
    assert.equal(click(group, 90, 1)?.handled, true);
    assert.equal(a.expanded, false);
    assert.equal(click(group, 90, 2, 4), undefined, 'padding is selectable rather than toggling');
    assert.equal(click(group, 90, 1)?.handled, true); assert.equal(b.expanded, false); assert.equal(c.expanded, false);
    group.setExpanded(false); assert.equal(a.expanded, false);
    group.setExpanded(true); assert.equal(a.expanded, true); assert.equal(b.expanded, true); assert.equal(c.expanded, true);
    b.setExpanded(false); c.setExpanded(false);
    assert.match(printed(group.render(90)), /first output/);
    assert.ok(group.render(90).length >= before.length);
  } finally { groups.dispose(); blocks.dispose(); }
  assert.deepEqual(root.children, [owner, a, b, c]);
});

test("adjacent assistant turns never merge calls or borrow timestamps", () => {
  const { root, calls, groups } = setup();
  const later = new AssistantMessageComponent(message([["c", "read"], ["d", "write"]], timestamp + 60_000));
  const c = tool("read", "c", createReadToolDefinition("/tmp"));
  const d = tool("write", "d", createWriteToolDefinition("/tmp"));
  root.addChild(later); root.addChild(c); root.addChild(d);
  try {
    groups.sync(root);
    assert.equal(root.children.length, 4);
    assert.deepEqual(root.children[1].children, calls);
    assert.deepEqual(root.children[3].children, [c, d]);
    assert.match(printed(root.children[1].render(90)), new RegExp(`${COMPOSER_ICONS.sent} ${sentTime(timestamp, FOOTER_DEFAULTS, Date.now())}`));
    assert.match(printed(root.children[3].render(90)), new RegExp(`${COMPOSER_ICONS.sent} ${sentTime(timestamp + 60_000, FOOTER_DEFAULTS, Date.now())}`));
  } finally { groups.dispose(); }
});

test("no unsourced association or custom, self-rendered, image, narrow frame; branch rebuild detaches", () => {
  const missing = setup([["a", "read"], ["b", "write"]], undefined);
  // Explicit invalid timestamp: message fixture defaults undefined to timestamp.
  missing.owner.updateContent(message([["a", "read"], ["b", "write"]], NaN));
  assert.equal(missing.groups.sync(missing.root), false);
  const mixed = setup([["a", "read"], ["b", "write"]]);
  mixed.calls[1].toolDefinition = { renderShell: "self", renderCall: () => new Text("CUSTOM") };
  assert.equal(mixed.groups.sync(mixed.root), false);
  mixed.calls[1].toolDefinition = createWriteToolDefinition("/tmp");
  mixed.groups.sync(mixed.root);
  const group = mixed.root.children[1];
  mixed.calls[1].updateResult({ content: [{ type: "image", data: "AAAA", mimeType: "image/png" }], isError: false });
  mixed.groups.sync(mixed.root);
  assert.deepEqual(mixed.root.children, [mixed.owner, ...mixed.calls]);
  assert.doesNotMatch(printed(group.render(90)), /Tools ·/);
  assert.doesNotMatch(printed(group.render(20)), /Tools ·/);
  mixed.root.clear(); mixed.groups.sync(mixed.root);
  assert.equal(mixed.root.children.length, 0);
  mixed.groups.dispose(); missing.groups.dispose();
});
