import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { jiti, source, root, theme, plain, visibleWidth, kb as nativeKb } from "./host.mjs";

const { sliceByColumn } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
/** Columns, not UTF-16 indices: the rail carries a private-use glyph. */
const at = (row, span) => sliceByColumn(row, span.start, span.end - span.start, true);

const {
  DictationController, DictationError, MODEL_URL, captureArgs, captureFailureHint, dictationLabel, downloadModel,
  dictationSetupHint, dictationSpan, parseDshowAudio, sanitizeTranscript, cacheDirectory, createLocalDictation,
  findExecutable, modelCandidates,
} = await jiti.import(join(source, "dictation.ts"));
const { composerBottomRail } = await jiti.import(join(source, "composer-style.ts"));
const { COMPOSER_ICONS } = await jiti.import(join(source, "composer-icons.ts"));
const { DEFAULTS, RunClock } = await jiti.import(join(source, "state.ts"));
const { FOOTER_DEFAULTS } = await jiti.import(join(source, "footer-state.ts"));
const { appearanceDefaults } = await jiti.import(join(source, "appearance.ts"));

/** Fake capture, transcriber and editor: no microphone, no processes, no network. */
function harness(options = {}) {
  const notifications = [], calls = { start: 0, transcribe: 0, install: 0, confirm: 0, refresh: 0 };
  let now = 10_000, draft = "", transcript = " hello   world ", tools = { ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli", model: "/models/ggml-base.en.bin" };
  const session = {
    path: "/tmp/pi-dictation-test/dict.wav", stopped: 0, cancelled: 0, cleaned: 0, handlers: [],
    async stop() { this.stopped++; return this.path; },
    cancel() { this.cancelled++; },
    async cleanup() { this.cleaned++; },
    onExit(callback) { this.handlers.push(callback); },
  };
  const editor = { getText: () => draft, setText: value => { draft = value; } };
  const controller = new DictationController({
    tools: () => tools,
    cache: "/tmp/pi-dictation-test/cache",
    platform: "darwin",
    start: async () => { calls.start++; if (options.startFails) throw options.startFails; return session; },
    transcribe: async () => { calls.transcribe++; return transcript; },
    installModel: async (onProgress, signal) => {
      calls.install++;
      if (options.installModel) return options.installModel(onProgress, signal);
      onProgress(42);
      return "/tmp/pi-dictation-test/cache/ggml-base.en.bin";
    },
    confirm: async () => { calls.confirm++; return options.confirm ? options.confirm() : options.accept ?? true; },
    notify: (message, type) => notifications.push({ message, type }),
    editor: () => editor,
    refresh: () => { calls.refresh++; },
    now: () => now,
  });
  return {
    controller, calls, notifications, session, editor,
    draft: () => draft, setDraft: value => { draft = value; }, setTranscript: value => { transcript = value; },
    setTools: value => { tools = value; }, advance: ms => { now += ms; },
  };
}

function workspace(dictation) {
  return {
    prefs: { ...DEFAULTS, motion: "off" }, clock: new RunClock(), tools: new Map(), phase: "working",
    promptDepth: 0, compacting: false, lastInputAt: 0, layout: { ...FOOTER_DEFAULTS },
    thinkingLevel: () => "medium", ...(dictation ? { dictation } : {}),
  };
}
const context = { cwd: "/tmp/project", model: { name: "test-model" } };

test("labels are exact for every phase, rounded down and clamped", () => {
  const tag = COMPOSER_ICONS.mic;
  assert.equal(dictationLabel("idle", 0, 0, "nerd"), ` ${tag} `);
  assert.equal(dictationLabel("recording", 0, 0, "nerd"), ` ${tag} REC 0s `);
  assert.equal(dictationLabel("recording", 999, 0, "nerd"), ` ${tag} REC 0s `);
  assert.equal(dictationLabel("recording", 61_700, 0, "nerd"), ` ${tag} REC 61s `);
  assert.equal(dictationLabel("transcribing", 3_400, 0, "nerd"), ` ${tag} … 3s `);
  assert.equal(dictationLabel("downloading", 0, 41.9, "nerd"), ` ${tag} ↓ 41% `);
  assert.equal(dictationLabel("downloading", 0, -3, "nerd"), ` ${tag} ↓ 0% `);
  assert.equal(dictationLabel("downloading", 0, 140, "nerd"), ` ${tag} ↓ 100% `);
  assert.equal(dictationLabel("unavailable", 0, 0, "nerd"), ` ${tag} ! `);
  assert.equal(dictationLabel("idle", 0, 0, "plain"), " mic ");
  assert.equal(dictationLabel("recording", 2_000, 0, "plain"), " mic REC 2s ");
  assert.equal(dictationLabel("transcribing", 2_000, 0, "plain"), " mic … 2s ");
  assert.equal(dictationLabel("downloading", 0, 7, "plain"), " mic ↓ 7% ");
  assert.equal(dictationLabel("unavailable", 0, 0, "plain"), " mic ! ");
  assert.equal(dictationLabel("recording", -5_000, 0, "plain"), " mic REC 0s ");
});

test("capture arguments and device hints follow each OS convention", () => {
  assert.deepEqual(captureArgs("darwin", ""), ["-f", "avfoundation", "-i", ":0"]);
  assert.deepEqual(captureArgs("darwin", ":2"), ["-f", "avfoundation", "-i", ":2"]);
  assert.deepEqual(captureArgs("win32", ""), ["-f", "dshow", "-i", "audio=default"]);
  assert.deepEqual(captureArgs("win32", "audio=Microphone (USB)"), ["-f", "dshow", "-i", "audio=Microphone (USB)"]);
  assert.deepEqual(captureArgs("linux", ""), ["-f", "pulse", "-i", "default"]);
  assert.deepEqual(captureArgs("linux", "pulse:alsa_input.usb"), ["-f", "pulse", "-i", "alsa_input.usb"]);
  assert.deepEqual(captureArgs("linux", "alsa:"), ["-f", "alsa", "-i", "default"]);
  assert.deepEqual(captureArgs("linux", "alsa:default"), ["-f", "alsa", "-i", "default"]);

  // ffmpeg lists a bare quoted name per device; a dual-purpose device is annotated.
  const listing = [
    "[dshow @ 000001] DirectShow video devices (some may be both video and audio devices)",
    '[dshow @ 000001]  "HD WebCam"',
    '[dshow @ 000001]     Alternative name "@device_pnp_\\\\?\\usb#vid_1"',
    "[dshow @ 000001] DirectShow audio devices",
    '[dshow @ 000001]  "Microphone (Realtek(R) Audio)"',
    '[dshow @ 000001]     Alternative name "@device_cm_{33D9A762}"',
    '[dshow @ 000001]  "Stereo Mix (Realtek(R) Audio)"',
  ].join("\n");
  assert.equal(parseDshowAudio(listing), "Microphone (Realtek(R) Audio)");
  assert.equal(parseDshowAudio('[dshow] DirectShow audio devices\n[dshow]  "Cam" (audio)\n[dshow]  "Mic"'), "Cam");
  assert.equal(parseDshowAudio("[dshow] DirectShow video devices\n[dshow]  \"Cam\""), undefined);
  assert.equal(parseDshowAudio(""), undefined);

  assert.match(dictationSetupHint("darwin"), /brew install ffmpeg whisper-cpp/);
  assert.match(dictationSetupHint("win32"), /winget install Gyan\.FFmpeg/);
  assert.match(dictationSetupHint("linux"), /install ffmpeg and whisper\.cpp/);
  for (const platform of ["darwin", "win32", "linux"]) assert.match(dictationSetupHint(platform), /PI_DICTATION_FFMPEG/);

  const denied = "Input/output error";
  assert.match(captureFailureHint("darwin", denied), /System Settings > Privacy & Security > Microphone/);
  assert.match(captureFailureHint("win32", denied), /ms-settings:privacy-microphone/);
  assert.match(captureFailureHint("linux", "cannot open audio device default"), /PI_DICTATION_INPUT=alsa:default/);
  // Actual macOS ffmpeg wording for a denied or missing device (verified on this host).
  const real = "[AVFoundation indev @ 0x79ec28140] Invalid audio device index\n[in#0 @ 0x79ec28000] Error opening input: Input/output error\nError opening input file :0.";
  assert.match(captureFailureHint("darwin", real), /Privacy & Security > Microphone/);
  assert.equal(captureFailureHint("darwin", "boom\n\n  second detail  \n"), "Capture failed: boom second detail");
  assert.equal(captureFailureHint("linux", ""), "Capture failed.");

  // Tool resolution refuses .cmd/.bat shims and honours explicit paths.
  assert.equal(findExecutable("/definitely/not/here", {}, "linux"), undefined);
  // The absolute-path fast path must work for the host running the test; never use a
  // POSIX-only fixture such as /bin/sh, which does not exist on Windows.
  assert.equal(findExecutable(process.execPath, {}, process.platform), process.execPath);
  // Both separator branches reject a path that cannot exist on any platform.
  assert.equal(findExecutable(join(tmpdir(), "no-such-tool.exe"), {}, "win32"), undefined);
  assert.equal(findExecutable("definitely-not-a-real-tool", process.env, "darwin"), undefined);
  // Expected paths are built by the same `join` the production code uses, so the
  // assertion tests composition rather than the host's separator.
  assert.equal(cacheDirectory("darwin", { XDG_CACHE_HOME: "/tmp/xdg" }), join("/tmp/xdg", "pi-dictation"));
  assert.equal(cacheDirectory("win32", { LOCALAPPDATA: "/tmp/local" }), join("/tmp/local", "pi-dictation"));
  assert.equal(modelCandidates("darwin", { PI_DICTATION_MODEL: "/custom.bin" }, "/cache")[0], "/custom.bin");
  assert.ok(modelCandidates("darwin", {}, "/cache").includes(join("/opt/homebrew/share/whisper-cpp/models", "ggml-base.en.bin")));
  assert.ok(!modelCandidates("linux", {}, "/cache").includes(join("/opt/homebrew/share/whisper-cpp/models", "ggml-base.en.bin")));
  assert.match(MODEL_URL, /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/.*ggml-base\.en\.bin$/);
});

test("transcripts lose whisper's artefacts but keep every spoken word", () => {
  assert.equal(sanitizeTranscript(" hello   world "), "hello world");
  assert.equal(sanitizeTranscript("\r\n[BLANK_AUDIO]\r\nreal words\r\n"), "real words");
  assert.equal(sanitizeTranscript("(silence)\n(no speech)\n[NO SPEECH]"), "");
  assert.equal(sanitizeTranscript("\n\n  \n"), "");
  assert.equal(sanitizeTranscript("line one\nline two"), "line one line two");
});

test("the click span covers the rendered control and nothing around it", async () => {
  const run = harness();
  const rail = plain(composerBottomRail(theme, 58, workspace(run.controller), context, "NORMAL"));
  const span = dictationSpan(composerBottomRail(theme, 58, workspace(run.controller), context, "NORMAL"),
    run.controller.label("nerd"), "nerd");
  assert.ok(span, rail);
  assert.ok(span.start >= 0 && span.end > span.start);
  assert.equal(at(rail, span).trim(), COMPOSER_ICONS.mic);
  assert.notEqual(at(rail, { start: span.start - 1, end: span.start }), COMPOSER_ICONS.mic);
  assert.notEqual(at(rail, { start: span.end, end: span.end + 1 }), COMPOSER_ICONS.mic);

  const plainIcons = workspace(run.controller);
  plainIcons.layout.icons = "plain";
  const plainRail = composerBottomRail(theme, 58, plainIcons, context, "NORMAL");
  const plainSpan = dictationSpan(plainRail, run.controller.label("plain"), "plain");
  assert.equal(at(plain(plainRail), plainSpan), " mic ");
  assert.equal(dictationSpan(plainRail, " mic ", "nerd"), undefined);

  await run.controller.toggle();
  run.advance(2_500);
  const recording = composerBottomRail(theme, 58, workspace(run.controller), context, "NORMAL");
  const recordingSpan = dictationSpan(recording, run.controller.label("nerd"), "nerd");
  assert.equal(at(plain(recording), recordingSpan).trim(), `${COMPOSER_ICONS.mic} REC 2s`);
  run.controller.cancel("user");
});

test("the rail renders the mic only with a pointer, enough width and no appearance editor", async () => {
  const run = harness();
  const plain_ = (icons = "plain") => { const state = workspace(run.controller); state.layout.icons = icons; return state; };

  const wide = composerBottomRail(theme, 58, plain_(), context, "NORMAL");
  assert.match(plain(wide), / mic /);
  assert.match(plain(wide), /test-m/, "the model keeps the remaining budget");
  assert.match(plain(wide), /NORMAL/);
  assert.ok(visibleWidth(wide) <= 58);
  assert.match(plain(composerBottomRail(theme, 58, plain_("nerd"), context, "NORMAL")), new RegExp(COMPOSER_ICONS.mic));

  // 40 cells is the floor that keeps REC plus seconds beside a centered mode label.
  assert.doesNotMatch(plain(composerBottomRail(theme, 39, plain_(), context, "NORMAL")), / mic /);
  assert.match(plain(composerBottomRail(theme, 40, plain_(), context, "NORMAL")), / mic /);

  const regular = plain_(); regular.mouseReporting = () => false;
  assert.doesNotMatch(plain(composerBottomRail(theme, 58, regular, context, "NORMAL")), / mic /);

  const appearance = plain_();
  appearance.layout.appearance = appearanceDefaults(appearance.layout);
  assert.doesNotMatch(plain(composerBottomRail(theme, 58, appearance, context, "NORMAL")), / mic /);

  // A workspace without a controller renders exactly as it did before the mic existed.
  const bare = workspace();
  assert.equal(composerBottomRail(theme, 58, bare, context, "NORMAL"), composerBottomRail(theme, 58, { ...workspace(), dictation: undefined }, context, "NORMAL"));
  assert.doesNotMatch(plain(composerBottomRail(theme, 58, bare, context, "NORMAL")), /mic/);

  // The native scroll hint keeps priority; the mic still leads the right slot.
  const scrolled = plain(composerBottomRail(theme, 58, plain_(), context, "NORMAL", "↓ 3 more"));
  assert.match(scrolled, /↓ 3 more/);
  assert.match(scrolled, / mic /);
});

test("clicking records, stops, transcribes and inserts at the cursor", async () => {
  const run = harness();
  assert.equal(run.controller.phase(), "idle");
  assert.equal(run.controller.label("plain"), " mic ");

  await run.controller.toggle();
  assert.equal(run.controller.phase(), "recording");
  assert.equal(run.calls.start, 1);
  assert.equal(run.controller.label("plain"), " mic REC 0s ");
  assert.equal(run.controller.busy(), true);
  run.advance(3_000);
  assert.equal(run.controller.label("plain"), " mic REC 3s ");

  await run.controller.toggle();
  assert.equal(run.controller.phase(), "idle");
  assert.equal(run.session.stopped, 1);
  assert.equal(run.session.cleaned, 1);
  assert.equal(run.draft(), "hello world");
  assert.deepEqual(run.notifications, []);
  assert.ok(run.calls.refresh > 2, "the rail repainted through both phases");
});

test("an existing draft keeps its own spacing and cursor insertion is preferred", async () => {
  const run = harness();
  run.setDraft("existing text");
  await run.controller.toggle();
  await run.controller.toggle();
  assert.equal(run.draft(), "existing text hello world");

  run.setDraft("trailing ");
  await run.controller.toggle();
  await run.controller.toggle();
  assert.equal(run.draft(), "trailing hello world");

  const inserted = [];
  const insertedRun = harness();
  const editor = { getText: () => "draft", setText: value => { assert.fail(`setText must not run: ${value}`); },
    insertTextAtCursor: text => inserted.push(text) };
  const controller = new DictationController({
    tools: () => ({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli", model: "/model.bin" }),
    cache: "/cache", platform: "darwin", start: async () => insertedRun.session, transcribe: async () => "spoken",
    installModel: async () => "/model.bin", confirm: async () => true, notify: () => {}, editor: () => editor,
    refresh: () => {}, now: () => 1_000,
  });
  await controller.toggle();
  await controller.toggle();
  assert.deepEqual(inserted, ["spoken"]);
});

test("empty speech, missing tools and a declined download each explain themselves", async () => {
  const silent = harness();
  silent.setTranscript(" \n[BLANK_AUDIO]\n");
  await silent.controller.toggle();
  await silent.controller.toggle();
  assert.equal(silent.draft(), "");
  assert.deepEqual(silent.notifications, [{ message: "No speech detected.", type: "warning" }]);
  assert.equal(silent.controller.phase(), "idle");

  const missing = harness();
  missing.setTools({});
  await missing.controller.toggle();
  assert.equal(missing.controller.phase(), "unavailable");
  assert.equal(missing.controller.label("plain"), " mic ! ");
  assert.equal(missing.calls.start, 0);
  assert.deepEqual(missing.notifications, [{ message: dictationSetupHint("darwin"), type: "warning" }]);

  const declined = harness({ accept: false });
  declined.setTools({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" });
  assert.equal(declined.controller.phase(), "idle", "a missing model is downloadable, not unavailable");
  await declined.controller.toggle();
  assert.equal(declined.calls.install, 0);
  assert.equal(declined.calls.start, 0);
  assert.deepEqual(declined.notifications, [{ message: "Dictation model not installed; nothing was downloaded.", type: "info" }]);
});

test("an accepted download reports progress, then records", async () => {
  const run = harness({ accept: true });
  run.setTools({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" });
  const progress = [];
  const controller = new DictationController({
    tools: () => (progress.length ? { ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli", model: "/cache/ggml-base.en.bin" }
      : { ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" }),
    cache: "/tmp/pi-dictation-test/cache", platform: "darwin", start: async () => run.session,
    transcribe: async () => "done", confirm: async () => true, notify: (message, type) => run.notifications.push({ message, type }),
    installModel: async onProgress => { onProgress(12); progress.push(controller.label("plain")); onProgress(100); return "/cache/ggml-base.en.bin"; },
    editor: () => run.editor, refresh: () => {}, now: () => 5_000,
  });
  await controller.toggle();
  assert.deepEqual(progress, [" mic ↓ 12% "]);
  assert.deepEqual(run.notifications, [], "an accepted download needs no follow-up notice");
  assert.equal(controller.phase(), "recording", "the download leads straight into capture");
});

test("a failing start, a dying device and a failing transcription all recover", async () => {
  const failing = harness({ startFails: new DictationError("Microphone unavailable. Give your terminal app Microphone access.") });
  await failing.controller.toggle();
  assert.equal(failing.controller.phase(), "idle");
  assert.deepEqual(failing.notifications, [{ message: "Microphone unavailable. Give your terminal app Microphone access.", type: "warning" }]);

  const dying = harness();
  await dying.controller.toggle();
  dying.session.handlers[0]("No capture device. Install PipeWire/PulseAudio.");
  assert.equal(dying.controller.phase(), "idle");
  assert.equal(dying.notifications.at(-1).type, "warning");

  const broken = harness();
  const controller = new DictationController({
    tools: () => ({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli", model: "/model.bin" }),
    cache: "/cache", platform: "darwin", start: async () => broken.session,
    transcribe: async () => { throw new Error("whisper exploded"); }, installModel: async () => "/model.bin",
    confirm: async () => true, notify: (message, type) => broken.notifications.push({ message, type }),
    editor: () => broken.editor, refresh: () => {}, now: () => 1_000,
  });
  await controller.toggle();
  await controller.toggle();
  assert.deepEqual(broken.notifications, [{ message: "Dictation failed: whisper exploded", type: "warning" }]);
  assert.equal(controller.phase(), "idle");
  assert.equal(broken.session.cleaned, 1, "the temp recording is always removed");
});

test("cancel stops capture, clears its timer and ignores a prompt it started itself", async () => {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const created = new Map(), cleared = [];
  globalThis.setTimeout = (fn, ms, ...rest) => { const id = realSet(fn, ms, ...rest); created.set(id, ms); return id; };
  globalThis.clearTimeout = id => { cleared.push(created.get(id)); created.delete(id); return realClear(id); };
  try {
    const run = harness();
    await run.controller.toggle();
    assert.ok([...created.values()].includes(300_000), "the capture cap is armed");
    run.controller.cancel("user");
    assert.equal(run.session.cancelled, 1);
    assert.equal(run.controller.phase(), "idle");
    assert.ok(cleared.includes(300_000), "the cap is cleared, not left to fire");

    // The confirmation dialog fires ui_prompt_start; it must not cancel its own flow.
    const confirming = Promise.withResolvers();
    let asked = 0;
    const pending = harness();
    const controller = new DictationController({
      tools: () => ({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" }), cache: "/cache", platform: "darwin",
      start: async () => pending.session, transcribe: async () => "spoken", installModel: async () => "/model.bin",
      confirm: async () => { asked++; return confirming.promise; },
      notify: (message, type) => pending.notifications.push({ message, type }),
      editor: () => pending.editor, refresh: () => {}, now: () => 1_000,
    });
    const toggling = controller.toggle();
    await new Promise(resolve => realSet(resolve, 0));
    assert.equal(asked, 1);
    controller.cancel("prompt");
    confirming.resolve(false);
    await toggling;
    assert.deepEqual(pending.notifications, [{ message: "Dictation model not installed; nothing was downloaded.", type: "info" }]);

    run.controller.cancel("user");
    run.controller.dispose();
    run.controller.dispose();
    assert.equal(run.controller.phase(), "idle", "dispose is idempotent");
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});

test("both editor wrappers route a rail click to the mic without taking focus", async () => {
  const { ComposerEditor } = await jiti.import(join(source, "ui.ts"));
  const { dressComposerEditor } = await jiti.import(join(source, "composer-editor.ts"));
  const { getEditorTheme } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js")));
  let toggles = 0;
  const fake = { phase: () => "idle", label: icons => dictationLabel("idle", 0, 0, icons), toggle: () => { toggles++; return Promise.resolve(); } };
  const fullCtx = { ui: { theme }, sessionManager: { getSessionId: () => "s", getSessionName: () => "Alchemy" }, cwd: "/tmp/project", model: { name: "test-model" } };
  const click = (x, y, width) => ({ type: "click", button: "left", x, y, screenX: x, screenY: y, width, height: 20, shift: false, alt: false, ctrl: false });
  const railOf = rows => rows.findIndex(row => plain(row).includes(" mic "));

  // The fallback editor owns its own render and rail row.
  const tui = { terminal: { rows: 40 }, requestRender() {}, addChild() {}, setFocus() {} };
  const state = workspace(fake); state.layout.icons = "plain";
  const native = new ComposerEditor(tui, getEditorTheme(), nativeKb, () => fullCtx, state, () => "medium", () => 10_000);
  native.focused = true; native.setText("draft");
  let rows = native.render(60);
  const row = railOf(rows), span = dictationSpan(rows[row], fake.label("plain"), "plain");
  assert.ok(row > 0 && span);
  assert.deepEqual(native.handleMouse(click(span.start + 1, row, 60)), { handled: true });
  assert.equal(toggles, 1);
  native.handleMouse(click(span.end + 2, row, 60));
  assert.equal(toggles, 1, "a click beside the control stays with the editor");
  assert.equal(native.focused, true, "the mic never steals focus");

  // A stale width cannot hit-test against a rail painted at another size.
  native.handleMouse(click(span.start + 1, row, 59));
  assert.equal(toggles, 1);

  // The live path decorates a foreign editor instead of replacing it.
  let width = 0;
  const foreign = {
    getText: () => "draft", setText() {}, handleInput() {}, handleMouse: event => ({ handled: true, forwarded: event.x }),
    invalidate() {}, getPaddingX: () => 2, setPaddingX(value) { width = value; },
    render: cells => { const rule = "─".repeat(Math.max(0, cells)); return [rule, "draft".padEnd(Math.max(0, cells)), `${rule} NORMAL`]; },
  };
  const live = workspace(fake); live.layout.icons = "plain";
  const undress = dressComposerEditor(foreign, () => fullCtx, live, () => 10_000, () => 40);
  try {
    rows = foreign.render(60);
    const liveRow = railOf(rows), liveSpan = dictationSpan(rows[liveRow], fake.label("plain"), "plain");
    assert.ok(liveRow > 0 && liveSpan, plain(rows.join("\n")));
    assert.deepEqual(foreign.handleMouse(click(liveSpan.start + 1, liveRow, 60)), { handled: true });
    assert.equal(toggles, 2);
    // Other rows still reach the decorated editor after coordinate translation.
    assert.equal(foreign.handleMouse(click(3, 2, 60)).forwarded, 2);
  } finally { undress(); assert.ok(width >= 0); }
});

test("the model download writes only a verified file and leaves no part behind", async () => {
  const { createServer } = await import("node:http");
  const { createHash } = await import("node:crypto");
  const { mkdtemp, readdir, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const body = Buffer.from("pretend-whisper-model-bytes");
  const digest = createHash("sha256").update(body).digest("hex");
  const server = createServer((request, response) => {
    if (request.url === "/ok") {
      response.writeHead(200, { "content-length": body.length, "x-linked-etag": `W/"${digest}"` });
      response.end(body);
      return;
    }
    // The real endpoint reports the digest on the redirect only.
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/ok-unsigned", "x-linked-etag": `"${digest}"` });
      response.end();
      return;
    }
    if (request.url === "/ok-unsigned") {
      response.writeHead(200, { "content-length": body.length });
      response.end(body);
      return;
    }
    if (request.url === "/redirect-bad") {
      response.writeHead(302, { location: "/ok-unsigned", "x-linked-etag": `"${"0".repeat(64)}"` });
      response.end();
      return;
    }
    if (request.url === "/mismatch") {
      response.writeHead(200, { "content-length": body.length, "x-linked-etag": `"${"0".repeat(64)}"` });
      response.end(body);
      return;
    }
    response.writeHead(404).end("no");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), "pi-dictation-download-"));
  try {
    const progress = [];
    await downloadModel(join(directory, "model.bin"), percent => progress.push(percent), new AbortController().signal, `${base}/ok`);
    assert.equal(await readFile(join(directory, "model.bin"), "utf8"), body.toString());
    assert.equal(progress.at(-1), 100);
    assert.ok(progress.every(percent => percent >= 0 && percent <= 100));
    assert.deepEqual(await readdir(directory), ["model.bin"]);

    await assert.rejects(downloadModel(join(directory, "bad.bin"), () => {}, new AbortController().signal, `${base}/mismatch`),
      /Speech model failed its integrity check\./);
    await assert.rejects(downloadModel(join(directory, "gone.bin"), () => {}, new AbortController().signal, `${base}/missing`),
      /HTTP 404/);
    // The digest on the redirect still governs the unverified body it points at.
    await downloadModel(join(directory, "moved.bin"), () => {}, new AbortController().signal, `${base}/redirect`);
    assert.equal(await readFile(join(directory, "moved.bin"), "utf8"), body.toString());
    await assert.rejects(downloadModel(join(directory, "moved-bad.bin"), () => {}, new AbortController().signal, `${base}/redirect-bad`),
      /Speech model failed its integrity check\./);
    assert.deepEqual((await readdir(directory)).sort(), ["model.bin", "moved.bin"], "failed downloads leave nothing behind");
  } finally {
    await rm(directory, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
  }
});

test("a capture tool that cannot start rejects cleanly and leaves no temp directory", async t => {
  if (process.platform === "win32") { t.skip("POSIX spawn errno codes"); return; }
  const { chmod, mkdtemp, readdir, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const residue = async () => (await readdir(tmpdir())).filter(name => name.startsWith("pi-dictation-")).sort();
  const before = await residue();
  // Not "pi-dictation-": that prefix is what the residue check looks for.
  const directory = await mkdtemp(join(tmpdir(), "pd-tool-"));
  const notExecutable = join(directory, "ffmpeg");
  await writeFile(notExecutable, "#!/bin/sh\nexit 0\n");
  await chmod(notExecutable, 0o644);
  const local = ffmpeg => createLocalDictation({ platform: process.platform,
    env: { PATH: "", PI_DICTATION_FFMPEG: ffmpeg, PI_DICTATION_WHISPER: "/bin/sh" } });
  try {
    // An existing path is used as given, so the spawn itself is what fails.
    assert.equal(local(notExecutable).tools().ffmpeg, notExecutable);
    await assert.rejects(local(notExecutable).start(), error => {
      assert.ok(error instanceof DictationError);
      assert.match(error.hint, /^ffmpeg could not start \(EACCES\): /);
      return true;
    });
    await assert.rejects(local(join(directory, "gone")).start(), /Dictation needs ffmpeg and whisper-cli/);
    assert.deepEqual(await residue(), before, "failed starts remove their temp directory");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("stopping a capture whose stdin is already closed settles without crashing", async t => {
  if (process.platform === "win32") { t.skip("POSIX capture script"); return; }
  const { chmod, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(join(tmpdir(), "pd-stdin-"));
  // ffmpeg closes a non-terminal stdin: the 'q' write hits EPIPE on this stream.
  const script = join(directory, "ffmpeg");
  await writeFile(script, "#!/bin/sh\nexec 0<&-\nsleep 1\n");
  await chmod(script, 0o755);
  const local = createLocalDictation({ platform: process.platform,
    env: { PATH: "", PI_DICTATION_FFMPEG: script, PI_DICTATION_WHISPER: "/bin/sh" } });
  let session;
  try {
    session = await local.start();
    assert.match(session.path, /dict\.wav$/);
    // An unhandled stdin 'error' would take down the whole test process here.
    await assert.rejects(session.stop(), /Capture failed\./);
    await session.cleanup();
    assert.equal(existsSync(join(session.path, "..")), false, "cleanup removes the recording directory");
  } finally {
    await session?.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a cancelled confirmation neither downloads nor records, and a rejection is reported", async () => {
  const gate = Promise.withResolvers();
  const cancelled = harness({ confirm: () => gate.promise });
  cancelled.setTools({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" });
  const pending = cancelled.controller.toggle();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled.calls.confirm, 1);
  cancelled.controller.cancel("user");
  gate.resolve(true); // the dialog said yes, but the operation was cancelled
  await pending; // must not reject
  assert.equal(cancelled.calls.install, 0, "a cancelled setup downloads nothing");
  assert.equal(cancelled.calls.start, 0, "a cancelled setup never records");
  assert.equal(cancelled.controller.phase(), "idle");
  assert.deepEqual(cancelled.notifications, [], "cancel is its own feedback");

  const rejecting = harness({ confirm: async () => { throw new Error("dialog closed"); } });
  rejecting.setTools({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" });
  await assert.doesNotReject(rejecting.controller.toggle());
  assert.deepEqual(rejecting.notifications, [{ message: "Dictation setup failed: dialog closed", type: "error" }]);
  assert.equal(rejecting.calls.install + rejecting.calls.start, 0);

  const failing = harness({ installModel: async () => { throw new Error("offline"); } });
  failing.setTools({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" });
  await assert.doesNotReject(failing.controller.toggle());
  assert.deepEqual(failing.notifications, [{ message: "Model download failed: offline", type: "error" }]);
  assert.equal(failing.calls.start, 0);
  assert.equal(failing.controller.phase(), "idle");
});

test("a download cancelled mid-flight cannot reset the capture that replaced it", async () => {
  const download = Promise.withResolvers();
  const run = harness({ installModel: (onProgress, _signal) => { onProgress(30); return download.promise; } });
  run.setTools({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli" }); // no model yet
  const pending = run.controller.toggle();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(run.calls.install, 1);
  assert.equal(run.controller.phase(), "downloading");
  assert.equal(run.controller.label("plain"), " mic ↓ 30% ");

  run.controller.cancel("user");
  assert.equal(run.controller.phase(), "idle");

  // A newer operation: the model now exists, so this records straight away.
  run.setTools({ ffmpeg: "/bin/ffmpeg", whisper: "/bin/whisper-cli", model: "/models/ggml-base.en.bin" });
  await run.controller.toggle();
  assert.equal(run.controller.phase(), "recording");

  download.reject(new Error("aborted")); // the stale download settles after the cancel
  await pending; // must not reject
  assert.equal(run.controller.phase(), "recording", "the stale download must not reset the newer capture");
  assert.equal(run.session.cancelled, 0, "the live session is untouched");
  assert.deepEqual(run.notifications, [], "the cancelled download stays silent");
  run.controller.cancel("user");
});
