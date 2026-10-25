import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain } from "./host.mjs";
const { nativeMessageFacts } = await jiti.import(join(source, "native-message-adapter.ts"));
const { SentMessageFrames } = await jiti.import(join(source, "sent-messages.ts"));
const { AssistantMessageComponent, UserMessageComponent } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/index.js")));
const { Container, Text } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const message = (content = [{ type: "text", text: "Reply" }]) => ({ role: "assistant", content, stopReason: "stop", provider: "test", model: "test", timestamp: 1234 });

test("native compatibility facts are typed, read-only and refreshed through streaming updates", () => {
  const user = new UserMessageComponent("Words 界面"), assistant = new AssistantMessageComponent();
  assert.deepEqual(nativeMessageFacts(user), { kind: "user", text: "Words 界面" });
  assert.deepEqual(nativeMessageFacts(assistant), { kind: "assistant", streaming: false, calls: [] });
  const data = message([{ type: "thinking", thinking: " " }, { type: "text", text: "Reply" }, { type: "toolCall", id: "c1", name: "read", arguments: { path: "synthetic.txt" } }]);
  assistant.updateContent(data, true); const before = JSON.stringify(data);
  assert.deepEqual(nativeMessageFacts(assistant), { kind: "assistant", streaming: true, timestamp: 1234, firstVisible: "text", calls: [{ id: "c1" }] });
  assistant.updateContent(message([{ type: "thinking", thinking: "Thinking" }]), false);
  assert.equal(nativeMessageFacts(assistant).firstVisible, "thinking");
  assert.equal(nativeMessageFacts(assistant).streaming, false); assert.equal(JSON.stringify(data), before);
  assert.equal(nativeMessageFacts(new Text("Not a message")), undefined);
});

test("incompatible private fields and throwing accessors fail closed without casting them into valid messages", () => {
  const user = new UserMessageComponent("cached"), assistant = new AssistantMessageComponent(message());
  Reflect.set(user, "text", 12); assert.equal(nativeMessageFacts(user), undefined);
  Reflect.set(assistant, "isStreaming", "yes"); assert.equal(nativeMessageFacts(assistant), undefined);
  Reflect.set(assistant, "isStreaming", false);
  Object.defineProperty(assistant, "lastMessage", { configurable: true, get() { throw Error("host drift"); } });
  assert.equal(nativeMessageFacts(assistant), undefined);
});

test("unsupported content/invalid blocks fall back; unknown timestamps are omitted, never fabricated", () => {
  const node = new AssistantMessageComponent(message());
  for (const content of [[null], [{ type: "text", text: 8 }], [{ type: "thinking", thinking: null }], [{ type: "future-media" }], [{ type: "toolCall", id: "x", name: "read", arguments: null }]]) {
    Reflect.set(node, "lastMessage", message(content)); assert.equal(nativeMessageFacts(node), undefined);
  }
  for (const timestamp of [NaN, Infinity, -1, undefined, "1234"]) {
    Reflect.set(node, "lastMessage", { ...message(), timestamp });
    assert.equal(nativeMessageFacts(node).timestamp, undefined);
  }
});

test("shape drift returns exact full-width native rendering and sync restores the original instance methods", () => {
  const root = new Container(), frames = new SentMessageFrames(), user = new UserMessageComponent("Native 界面");
  root.addChild(user); const original = user.render, mouse = user.handleMouse, invalidator = user.invalidate;
  try {
    frames.sync(root, () => theme); assert.match(plain(user.render(80)[0]), /╭ jordan/);
    // A future host's own render/invalidate remains functional after its private
    // field moves. Keep its public native behavior intact in this drift fixture.
    user.invalidate = () => {};
    Reflect.set(user, "text", undefined);
    assert.deepEqual(user.render(80), original.call(user, 80));
    assert.equal(frames.sync(root, () => theme), true);
    assert.equal(user.render, original); assert.equal(user.handleMouse, mouse);
    assert.equal(frames.sync(root, () => theme), false);
    Reflect.set(user, "text", "Native 界面"); user.invalidate = invalidator;
    assert.equal(frames.sync(root, () => theme), true);
  } finally { Reflect.set(user, "text", "Native 界面"); user.invalidate = invalidator; frames.dispose(); }
});
