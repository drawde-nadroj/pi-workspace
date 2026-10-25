import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFile, mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jiti, source } from "./host.mjs";

const { WorkspaceSounds } = await jiti.import(join(source, "sounds.ts"));

function players(steps) {
  const calls = [];
  const spawn = (command, args, options) => {
    const step = steps[calls.length];
    assert.ok(step, `Unexpected player: ${command}`);
    const child = new EventEmitter();
    child.stderr = new PassThrough();
    child.kill = signal => {
      child.killed = true;
      queueMicrotask(() => child.emit("close", null, signal));
      return true;
    };
    calls.push({ command, args, options, child });
    queueMicrotask(() => {
      if (child.killed || step.hold) return;
      if (step.error) child.emit("error", Object.assign(new Error(step.error), { code: step.error }));
      if (step.stderr) child.stderr.write(step.stderr);
      child.emit("close", step.code ?? (step.error ? -1 : 0), null);
    });
    return child;
  };
  return { calls, spawn };
}

test("Linux falls through missing executables, but never replays after a device failure", async () => {
  const backend = players([{ error: "ENOENT" }, { error: "ENOENT" }, {}]);
  await new WorkspaceSounds({ platform: "linux", spawn: backend.spawn }).play("done");
  assert.deepEqual(backend.calls.map(call => call.command), ["pw-play", "paplay", "aplay"]);
  const unavailable = players([{ code: 1, stderr: "Connection refused: no audio server" }]);
  await assert.rejects(new WorkspaceSounds({ platform: "linux", spawn: unavailable.spawn }).play("question"), /pw-play.*Connection refused/);
  assert.equal(unavailable.calls.length, 1, "a failed running player must not cause duplicate playback through another backend");
});

test("missing Linux players explain the prerequisite; permission failures are not treated as absence", async () => {
  const missing = players(Array.from({ length: 3 }, () => ({ error: "ENOENT" })));
  await assert.rejects(new WorkspaceSounds({ platform: "linux", spawn: missing.spawn }).play("done"), /Install pw-play.*paplay.*aplay/);
  const denied = players([{ error: "EACCES" }]);
  await assert.rejects(new WorkspaceSounds({ platform: "linux", spawn: denied.spawn }).play("done"), /EACCES/);
  assert.equal(denied.calls.length, 1);
});

test("mute cancels active playback and a pending Linux fallback, and the player remains reusable", async () => {
  const backend = players([{ error: "ENOENT" }, {}]);
  const sounds = new WorkspaceSounds({ platform: "linux", spawn: backend.spawn });
  const pending = sounds.play("done");
  // The missing-player close happens first; dispose precedes the await continuation.
  queueMicrotask(() => sounds.dispose());
  await pending;
  assert.equal(backend.calls.length, 1, "no next backend may start after mute");
  await sounds.play("question");
  assert.equal(backend.calls[1].command, "pw-play");
  const held = players([{ hold: true }]);
  const active = new WorkspaceSounds({ platform: "win32", spawn: held.spawn });
  const playback = active.play("done");
  active.dispose();
  await playback;
  assert.equal(held.calls[0].child.killed, true);
});

test("Windows passes the asset as environment data, not executable PowerShell text", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi sound ' $() 日本語 "));
  try {
    await copyFile(join(source, "sounds.ts"), join(directory, "sounds.ts"));
    const { WorkspaceSounds: RelocatedSounds } = await jiti.import(join(directory, "sounds.ts"));
    const backend = players([{}]);
    await new RelocatedSounds({ platform: "win32", spawn: backend.spawn }).play("question");
    const call = backend.calls[0];
    assert.equal(call.options.env.PI_WORKSPACE_SOUND_FILE, join(directory, "assets", "sounds", "react-bits-hint.wav"));
    assert.equal(call.args.some(arg => arg.includes(directory)), false, "an asset path must never become script source");
    assert.equal(call.options.shell, false);
    assert.equal(call.options.windowsHide, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Windows failures are surfaced and unsupported platforms never spawn", async () => {
  const missing = players([{ error: "ENOENT" }]);
  await assert.rejects(new WorkspaceSounds({ platform: "win32", spawn: missing.spawn }).play("done"), /Windows PowerShell.*PATH/);
  const failure = players([{ code: 1, stderr: "Invalid wave header" }]);
  await assert.rejects(new WorkspaceSounds({ platform: "win32", spawn: failure.spawn }).play("done"), /Invalid wave header/);
  const unsupported = players([]);
  await assert.rejects(new WorkspaceSounds({ platform: "freebsd", spawn: unsupported.spawn }).play("done"), /do not support freebsd/);
  assert.equal(unsupported.calls.length, 0);
});

test("bundled sounds are playable standard PCM WAVs, not 24-bit or extensible Windows-incompatible headers", async () => {
  for (const name of ["pluck", "hint"]) {
    const wav = await readFile(join(source, "assets", "sounds", `react-bits-${name}.wav`));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(4) + 8, wav.length);
    assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
    assert.equal(wav.readUInt16LE(20), 1, "Windows SoundPlayer requires PCM");
    assert.equal(wav.readUInt16LE(34), 16, "portable 16-bit sample width");
    const channels = wav.readUInt16LE(22), rate = wav.readUInt32LE(24), align = wav.readUInt16LE(32);
    assert.equal(align, channels * 2);
    assert.equal(wav.readUInt32LE(28), rate * align);
    assert.equal(wav.toString("ascii", 36, 40), "data");
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    assert.equal((wav.length - 44) % align, 0);
  }
});

test("native Windows SoundPlayer loads and plays both packaged cues from a quoted Unicode path", { skip: process.platform !== "win32", timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi sound ' $() 日本語 "));
  try {
    await mkdir(join(directory, "assets", "sounds"), { recursive: true });
    await copyFile(join(source, "sounds.ts"), join(directory, "sounds.ts"));
    for (const name of ["pluck", "hint"]) await copyFile(join(source, "assets", "sounds", `react-bits-${name}.wav`), join(directory, "assets", "sounds", `react-bits-${name}.wav`));
    const { WorkspaceSounds: NativeSounds } = await jiti.import(join(directory, "sounds.ts"));
    const sounds = new NativeSounds();
    try { await sounds.play("done"); await sounds.play("question"); }
    finally { sounds.dispose(); }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
