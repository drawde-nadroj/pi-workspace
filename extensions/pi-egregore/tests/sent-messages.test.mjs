import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain, visibleWidth } from "./host.mjs";
const { SentMessageFrames, terminalBackground } = await jiti.import(join(source, "sent-messages.ts"));
const { composerBorder, userFrameColor } = await jiti.import(join(source, "composer-style.ts"));
const { taskFrameColor } = await jiti.import(join(source, "../../lib/task-frame.ts"));
const { sentTime, calendarDay } = await jiti.import(join(source, "sent-metadata.ts"));
const { COMPOSER_ICONS } = await jiti.import(join(source, "composer-icons.ts"));
const { AssistantMessageComponent, UserMessageComponent } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/index.js")));
const { Container, Text, TuiMainScreen, TuiAltScreen, colorToHex, parseColor } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));

test("composer, assistant and Tasks use the same Pi accent in dark and light themes", () => {
  for (const appearance of ["dark", "light"]) {
    const accent = parseColor(appearance === "light" ? "#6546aa" : "#bbadff");
    const current = { ...theme, appearance, colors: { ...theme.colors, accent },
      style: theme.style.bind(theme), getColorMode: theme.getColorMode.bind(theme) };
    assert.equal(colorToHex(composerBorder(current)), colorToHex(accent));
    assert.equal(colorToHex(taskFrameColor(current)), colorToHex(accent));
    assert.notEqual(colorToHex(userFrameColor(current)), colorToHex(accent));
    const root = new Container(), frames = new SentMessageFrames();
    const assistant = new AssistantMessageComponent({ role: "assistant", content: [{ type: "text", text: "Reply" }],
      stopReason: "stop", model: "test", provider: "test", timestamp: 1 });
    root.addChild(assistant);
    try {
      frames.sync(root, () => current);
      assert.ok(assistant.render(80)[0].includes(current.style("╭", { fg: accent })));
    } finally { frames.dispose(); }
  }
});

test("sent-message frames wrap only native user messages, preserving content, wrapping and terminal zones", () => {
  const root = new Container(), chat = new Container(), frames = new SentMessageFrames();
  root.addChild(chat);
  const user = new UserMessageComponent("My words 界面 👩‍💻\n\n**Important** and [link](https://example.org).\n\n```ts\nconst x = 1;\n```"), assistant = new Text("Assistant text");
  chat.addChild(user); chat.addChild(assistant);
  const original = user.render, before = original.call(user, 90), other = assistant.render;
  try {
    assert.equal(frames.sync(root, () => theme), true);
    assert.equal(frames.sync(root, () => theme), false, "idempotent: never nests boxes");
    assert.equal(assistant.render, other);
    for (const width of [12, 20, 38, 60, 90, 160]) {
      const rows = user.render(width), text = rows.map(plain).join("\n");
      assert.match(text, /^╭ jordan /);
      for (const row of rows) assert.ok(visibleWidth(row) <= width);
      assert.equal(rows.join("").split("\x1b]133;A\x07").length - 1, 1);
      assert.equal(rows.join("").split("\x1b]133;B\x07").length - 1, 1);
      assert.equal(rows.join("").split("\x1b]133;C\x07").length - 1, 1);
      assert.doesNotMatch(rows.join(""), /\x1b\[(?:48[;:]|4[0-7]m|10[0-7]m)/);
      if (width >= 60) { assert.match(text, /My words/); assert.match(text, /Important/); assert.match(text, /const x = 1/); }
    }
    assert.deepEqual(user.render(8), original.call(user, 8), "tiny windows keep the native renderer");
    frames.dispose(); frames.dispose();
    assert.equal(user.render, original);
    assert.deepEqual(user.render(90), before, "cleanup leaves native content exactly unchanged");
  } finally { frames.dispose(); }
});

test("live workspace identity and density balance the user and assistant frame interiors", () => {
  const root = new Container(), frames = new SentMessageFrames();
  const user = new UserMessageComponent("hello");
  const assistant = new AssistantMessageComponent({ role: "assistant", content: [{ type: "text", text: "reply" }],
    stopReason: "stop", model: "test", provider: "test", timestamp: 1 });
  root.addChild(user); root.addChild(assistant);
  const prefs = { displayName: "Alex 界面", density: "spaced", messageTime: "off", timestamps: "24h" };
  try {
    frames.sync(root, () => theme, () => "Assistant", undefined, () => ({ prefs }));
    const spacedUser = user.render(70).map(plain), spacedAssistant = assistant.render(70).map(plain);
    assert.match(spacedUser[0], /Alex 界面/);
    assert.equal(spacedUser.length, spacedAssistant.length);
    prefs.density = "compact";
    assert.equal(user.render(70).length, spacedUser.length - 2);
    assert.equal(assistant.render(70).length, spacedAssistant.length - 2);
    for (const rows of [spacedUser, spacedAssistant]) {
      assert.equal(rows[1].slice(1, -1).trim(), "", "Spaced has a top interior padding row");
      assert.equal(rows.at(-2).slice(1, -1).trim(), "", "Spaced has a matching bottom interior padding row");
    }
    for (const node of [user, assistant]) {
      const compact = node.render(70).map(plain);
      assert.ok(compact[1].slice(1, -1).trim(), "Compact begins with content");
      assert.ok(compact.at(-2).slice(1, -1).trim(), "Compact ends with content");
    }
    assert.equal(user.render(70).join("").split("\x1b]133;C\x07").length - 1, 1);
  } finally { frames.dispose(); }
});

test("chat frames show only sourced fixed creation times; repeated user text maps in order", () => {
  const root = new Container(), frames = new SentMessageFrames();
  const first = new UserMessageComponent("again"), second = new UserMessageComponent("again"), synthetic = new UserMessageComponent("synthetic");
  const assistant = new AssistantMessageComponent({ role: "assistant", content: [{ type: "text", text: "Reply" }],
    stopReason: "stop", model: "test", provider: "test", timestamp: Date.UTC(2024, 0, 2, 15, 42) });
  for (const node of [first, second, synthetic, assistant]) root.addChild(node);
  const prefs = { messageTime: "on", timestamps: "24h", icons: "nerd" };
  const users = [Date.UTC(2024, 0, 2, 10, 1), Date.UTC(2024, 0, 2, 10, 2)]
    .map(timestamp => ({ text: "again", timestamp }));
  try {
    frames.sync(root, () => theme, () => "Assistant", undefined, () => ({ prefs, users }));
    const firstTime = sentTime(users[0].timestamp, prefs, Date.now());
    const secondTime = sentTime(users[1].timestamp, prefs, Date.now());
    const label = time => `${COMPOSER_ICONS.sent} ${time}`;
    assert.ok(plain(first.render(70).at(-1)).includes(label(firstTime)));
    assert.ok(first.render(70).at(-1).includes(theme.style(` ${label(firstTime)} `, { fg: userFrameColor(theme), bold: true })), "user timestamp matches the user frame red");
    assert.ok(plain(second.render(70).at(-1)).includes(label(secondTime)));
    assert.doesNotMatch(plain(synthetic.render(70).at(-1)), /Sent |\u{f10dd}/u, "unsourced user messages have no invented time");
    const assistantTime = sentTime(Date.UTC(2024, 0, 2, 15, 42), prefs, Date.now());
    assert.ok(plain(assistant.render(70).at(-1)).includes(label(assistantTime)));
    frames.sync(root, () => theme, () => "Assistant", undefined, () => ({ prefs, users, chronomancerDay: "2024-01-01" }));
    const actualDay = calendarDay(users[0].timestamp);
    assert.ok(plain(first.render(90).at(-1)).includes(actualDay), "past-day mode shows the real send date");
    assert.ok(!plain(synthetic.render(90).at(-1)).includes(actualDay), "no date is fabricated for unsourced messages");
    frames.sync(root, () => theme, () => "Assistant", undefined, () => ({ prefs, users }));
    assert.ok(plain(first.render(90).at(-1)).includes(label(firstTime)), "normal mode restores its original formatting");
    prefs.transcript = { version: 1, chat: { assistantLabel: "quiet", showSent: true, sentPosition: "bottomLeft" }, tools: { identity: "quiet", status: "semantic" } };
    frames.sync(root, () => theme, () => "Assistant", undefined, () => ({ prefs, users }));
    assert.ok(plain(first.render(70).at(-1)).startsWith(`╰ ${label(firstTime)}`), "user creation time moves left without losing its red identity");
    assert.ok(first.render(70).at(-1).includes(theme.style(` ${label(firstTime)} `, { fg: userFrameColor(theme), bold: true })));
    assert.ok(plain(assistant.render(70).at(-1)).includes(label(assistantTime)));
    assert.doesNotMatch(plain(synthetic.render(70).at(-1)), /Sent /);
    prefs.icons = "plain";
    assert.ok(plain(first.render(70).at(-1)).includes(`Sent ${firstTime}`), "plain mode retains a readable label");
    assert.doesNotMatch(plain(first.render(70).at(-1)), new RegExp(COMPOSER_ICONS.sent));
    prefs.transcript.chat.showSent = false;
    assert.ok(!plain(first.render(70).at(-1)).includes(firstTime), "saved transcript section takes precedence over legacy field");
    delete prefs.transcript;
    prefs.messageTime = "off";
    frames.sync(root, () => theme, () => "Assistant", undefined, () => ({ prefs, users }));
    assert.ok(!plain(first.render(70).at(-1)).includes(firstTime));
  } finally { frames.dispose(); }
});

test("new messages are adopted; detached instances restore; later decorators are not overwritten", () => {
  const root = new Container(), frames = new SentMessageFrames();
  const first = new UserMessageComponent("first"), second = new UserMessageComponent("second");
  const original = first.render;
  root.addChild(first); frames.sync(root, () => theme);
  root.removeChild(first); root.addChild(second); frames.sync(root, () => theme);
  assert.equal(first.render, original);
  assert.match(plain(second.render(60)[0]), /jordan/);
  const decorated = second.render, later = width => decorated(width);
  second.render = later;
  frames.dispose();
  assert.equal(second.render, later);
  assert.doesNotMatch(second.render(60).map(plain).join("\n"), /╭ jordan/);
});

test("assistant frames follow current model, streaming, errors, hidden thinking mouse and cleanup", () => {
  const root = new Container(), frames = new SentMessageFrames(), assistant = new AssistantMessageComponent(undefined, true);
  root.addChild(assistant); const original = assistant.render, originalMouse = assistant.handleMouse;
  let name = "Current Model";
  const message = (content, stopReason = "stop") => ({ role: "assistant", content, stopReason, errorMessage: "An explicit failure", model: "old-model", provider: "test", timestamp: 1 });
  frames.sync(root, () => theme, () => name);
  try {
    assert.deepEqual(assistant.render(90), [], "empty streaming message creates no empty box");
    assistant.updateContent(message([{ type: "toolCall", id: "call", name: "bash", arguments: {} }]), true);
    assert.deepEqual(assistant.render(90), [], "tool-only message creates no box");
    assistant.updateContent(message([{ type: "text", text: "Streaming 界面" }]), true);
    assert.match(plain(assistant.render(90)[0]), /Current Model/);
    name = "Another Model with a very long name 界面";
    for (const width of [12, 20, 38, 90]) for (const line of assistant.render(width)) assert.ok(visibleWidth(line) <= width);
    assert.match(plain(assistant.render(90)[0]), /Another Model/);
    assistant.updateContent(message([{ type: "text", text: "**Complete** reply" }]), false);
    assert.match(assistant.render(90).map(plain).join("\n"), /Complete/);
    assistant.updateContent(message([], "error"), false);
    assert.match(assistant.render(90).map(plain).join("\n"), /An explicit failure/);
    assistant.updateContent(message([{ type: "thinking", thinking: "Hidden thought" }, { type: "text", text: "Reply" }]), false);
    assert.equal(plain(original.call(assistant, 88)[0]).trim(), "", "Pi's native thinking message begins with a spacer");
    let rows = assistant.render(90), y = rows.findIndex(line => plain(line).includes("Thinking"));
    assert.equal(y, 2, "Spaced uses one top padding row even for a thinking-first frame");
    assert.equal(rows.join("").split("\x1b]133;A\x07").length - 1, 1, "terminal zone marker survives trimming");
    assistant.handleMouse({ type: "click", button: "left", x: 5, y, screenX: 5, screenY: y, width: 90, height: rows.length, ctrl: false, alt: false, shift: false });
    assert.match(assistant.render(90).map(plain).join("\n"), /Hidden thought/, "frame offsets retain native thinking toggle");
  } finally { frames.dispose(); }
  assert.equal(assistant.render, original); assert.equal(assistant.handleMouse, originalMouse);
});

test("only the active streaming assistant frame animates, without modifying its text", () => {
  const root = new Container(), frames = new SentMessageFrames(), assistant = new AssistantMessageComponent(undefined, true);
  root.addChild(assistant);
  let now = 100;
  frames.sync(root, () => theme, () => "Assistant", () => ({ active: true, now, startAt: 0 }));
  try {
    const message = { role: "assistant", content: [{ type: "thinking", thinking: "Checking sources" }], stopReason: "stop", model: "test", provider: "test", timestamp: 1 };
    assistant.updateContent(message, true);
    const first = assistant.render(70);
    now = 1700;
    const second = assistant.render(70);
    assert.notEqual(first[0], second[0]);
    assert.deepEqual(first.map(plain), second.map(plain));
    assistant.updateContent(message, false);
    const settled = assistant.render(70);
    now = 2100;
    assert.deepEqual(assistant.render(70), settled);
  } finally { frames.dispose(); }
});

test("background clearing preserves truecolor foreground payloads, links, and attributes", () => {
  const input = "\x1b[1;38;2;48;40;105;48;2;22;33;44mwords\x1b[0m\x1b]8;;https://example.org\x07link\x1b]8;;\x07";
  const output = terminalBackground(input);
  assert.ok(output.includes("1;38;2;48;40;105;49m"));
  assert.ok(output.includes("\x1b]8;;https://example.org\x07"));
  assert.equal(terminalBackground("\x1b[48:2::22:33:44mtext"), "\x1b[49mtext");
  assert.equal(terminalBackground("\x1b[48;5;121mtext"), "\x1b[49mtext");
});

for (const Renderer of [TuiMainScreen, TuiAltScreen]) test(`${Renderer.name}: mounted native transcript renders the rounded user outline`, () => {
  const writes = [], terminal = { columns: 90, rows: 30, kittyProtocolActive: false, start() {}, stop() {}, async drainInput() {}, write(text) { writes.push(text); }, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  const tui = new Renderer(terminal, false), document = new Container(), chat = new Container(), frames = new SentMessageFrames();
  tui.addChild(document); document.addChild(chat); chat.addChild(new UserMessageComponent("A real native user message"));
  try {
    tui.start(); frames.sync(tui, () => theme); tui.renderNow(true);
    assert.match(writes.join(""), /jordan/);
    assert.match(tui.render(90).map(plain).join("\n"), /A real native user message/);
    assert.match(plain(tui.render(90)[0]), /^╭ jordan /);
    frames.dispose();
    assert.doesNotMatch(tui.render(90).map(plain).join("\n"), /╭ jordan/);
  } finally { frames.dispose(); tui.stop(); }
});
