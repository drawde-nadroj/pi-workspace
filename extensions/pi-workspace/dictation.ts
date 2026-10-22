import { accessSync, constants, existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rename, rm, unlink, type FileHandle } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth, type EditorComponent } from "@earendil-works/pi-tui";
import { COMPOSER_ICONS } from "./composer-icons.ts";

/**
 * Microphone dictation: capture through ffmpeg, transcribe with whisper.cpp.
 *
 * Nothing here touches Composer appearance, preferences or the editor's own
 * rendering. The rail owns the control; this module owns its operational
 * states, the local audio path, and the one consent-gated download.
 */

export type DictationPhase = "idle" | "recording" | "transcribing" | "downloading" | "unavailable";
export type DictationIcons = "nerd" | "plain";

/** Recording is capped so a forgotten microphone cannot fill the temp disk. */
const CAPTURE_CAP_MS = 300_000;
/** ffmpeg needs a moment to open the device; an instant exit is a failure, not a recording. */
const STARTUP_GRACE_MS = 600;
const STOP_GRACE_MS = 2_000;
/** Below this, the wav has no usable header or audio and must not be transcribed. */
const MINIMUM_WAV_BYTES = 1024;

export function dictationLabel(phase: DictationPhase, elapsedMs: number, percent: number, icons: DictationIcons): string {
  const tag = icons === "plain" ? "mic" : COMPOSER_ICONS.mic;
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  switch (phase) {
    case "recording": return ` ${tag} REC ${seconds}s `;
    case "transcribing": return ` ${tag} … ${seconds}s `;
    case "downloading": return ` ${tag} ↓ ${Math.max(0, Math.min(100, Math.floor(percent)))}% `;
    case "unavailable": return ` ${tag} ! `;
    default: return ` ${tag} `;
  }
}

/** Locate the rendered control in a rail row. Columns include the label's padding. */
export function dictationSpan(line: string, label: string, icons: DictationIcons): { start: number; end: number } | undefined {
  const plain = stripVTControlCharacters(line);
  const token = icons === "plain" ? "mic " : COMPOSER_ICONS.mic;
  const at = plain.lastIndexOf(token);
  if (at < 0) return undefined;
  const start = Math.max(0, visibleWidth(plain.slice(0, at)) - 1);
  return { start, end: start + visibleWidth(label) };
}

export interface DictationTools { ffmpeg?: string; whisper?: string; model?: string }

export interface CaptureSession {
  path: string;
  stop(): Promise<string>;
  cancel(): void;
  cleanup(): Promise<void>;
  onExit(callback: (hint: string) => void): void;
}

/** Failures carry the OS-specific reason so the rail never reports a bare code. */
export class DictationError extends Error {
  readonly hint: string;
  constructor(hint: string) {
    super(hint);
    this.name = "DictationError";
    this.hint = hint;
  }
}

export function captureArgs(platform: NodeJS.Platform, input: string): string[] {
  if (platform === "darwin") return ["-f", "avfoundation", "-i", input || ":0"];
  if (platform === "win32") return ["-f", "dshow", "-i", input || "audio=default"];
  const match = /^(pulse|alsa):(.*)$/.exec(input);
  if (match) return ["-f", match[1], "-i", match[2] || "default"];
  return ["-f", "pulse", "-i", input || "default"];
}

/** Resolve a tool without a shell. `.cmd`/`.bat` shims cannot be spawned with shell:false. */
export function findExecutable(name: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | undefined {
  if ((platform === "win32" ? /[\\/]/ : /\//).test(name)) return existsSync(name) ? name : undefined;
  const extensions = platform === "win32"
    ? (env.PATHEXT ?? ".EXE;.COM").split(";").map(extension => extension.trim().toLowerCase()).filter(extension => extension === ".exe" || extension === ".com")
    : [""];
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, name + extension);
      if (!existsSync(candidate)) continue;
      if (platform === "win32") return candidate;
      try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* not executable */ }
    }
  }
  return undefined;
}

export function cacheDirectory(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  return platform === "win32"
    ? join(env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "pi-dictation")
    : join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "pi-dictation");
}

/** Explicit override first; otherwise the layouts whisper.cpp and brew actually use. */
export function modelCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, cache: string): string[] {
  const file = "ggml-base.en.bin";
  return [
    env.PI_DICTATION_MODEL ?? "",
    join(cache, file),
    join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "whisper", file),
    platform === "darwin" ? join("/opt/homebrew/share/whisper-cpp/models", file) : "",
    platform === "darwin" ? join("/usr/local/share/whisper-cpp/models", file) : "",
    join(homedir(), ".local", "share", "whisper", file),
    platform === "win32" && env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "whisper", file) : "",
  ].filter(Boolean);
}

export function dictationSetupHint(platform: NodeJS.Platform): string {
  if (platform === "darwin") return "Dictation needs ffmpeg and whisper-cli (brew install ffmpeg whisper-cpp), or set PI_DICTATION_FFMPEG / PI_DICTATION_WHISPER.";
  if (platform === "win32") return "Dictation needs ffmpeg and whisper-cli on PATH (winget install Gyan.FFmpeg; whisper.cpp release build), or set PI_DICTATION_FFMPEG / PI_DICTATION_WHISPER.";
  return "Dictation needs ffmpeg and whisper-cli (install ffmpeg and whisper.cpp), or set PI_DICTATION_FFMPEG / PI_DICTATION_WHISPER.";
}

const DEVICE_FAILURE = /permission|denied|access is denied|could not enumerate|input\/output error|i\/o error|cannot open audio device|no such device|device not found/i;

export function captureFailureHint(platform: NodeJS.Platform, stderr: string): string {
  if (DEVICE_FAILURE.test(stderr)) {
    if (platform === "darwin") return "Microphone unavailable. Give your terminal app Microphone access in System Settings > Privacy & Security > Microphone, then retry. (open \"x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone\")";
    if (platform === "win32") return "Microphone unavailable. In Settings > Privacy & security > Microphone, turn on Microphone access, Let apps access your microphone, and Let desktop apps access your microphone, then retry. (start ms-settings:privacy-microphone)";
    return "No capture device. Install PipeWire/PulseAudio, or set PI_DICTATION_INPUT=alsa:default (or pulse:<device>).";
  }
  const detail = lastLines(stderr);
  return detail ? `Capture failed: ${detail}` : "Capture failed.";
}

/** Windows lists capture devices instead of defaulting; take the first audio input. */
export function parseDshowAudio(stderr: string): string | undefined {
  const start = stderr.indexOf("DirectShow audio devices");
  if (start < 0) return undefined;
  const video = stderr.indexOf("DirectShow video devices", start);
  const section = stderr.slice(start, video < 0 ? undefined : video);
  // A device in both categories carries an explicit marker; otherwise ffmpeg
  // lists a bare quoted name, so both shapes have to resolve.
  const annotated = /"([^"]+)"\s*\(audio\)/.exec(section);
  if (annotated) return annotated[1];
  for (const line of section.split(/\r?\n/).slice(1)) {
    if (/Alternative name/.test(line)) continue;
    const name = /"([^"]+)"/.exec(line);
    if (name) return name[1];
  }
  return undefined;
}

export function sanitizeTranscript(text: string): string {
  return text.replace(/\r/g, "").split("\n").map(line => line.trim())
    .filter(line => line && !/^\[(BLANK_AUDIO|SILENCE|NO SPEECH)\]$/i.test(line) && !/^\((silence|no speech)\)$/i.test(line))
    .join(" ").replace(/\s+/g, " ").trim();
}

export const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
export const MODEL_FILENAME = "ggml-base.en.bin";

/** Hugging Face reports the LFS object digest on the redirect, quoted and possibly weak. */
function linkedDigest(headers: Headers): string | undefined {
  return headers.get("x-linked-etag")?.replace(/^W\//, "").replace(/"/g, "").toLowerCase() || undefined;
}

/** Stream to a part file so an interrupted download never looks installed. */
export async function downloadModel(destination: string, onProgress: (percent: number) => void, signal: AbortSignal, url = MODEL_URL): Promise<void> {
  const part = `${destination}.${process.pid}.part`;
  const discard = async () => { try { await unlink(part); } catch { /* already gone */ } };
  let handle: FileHandle | undefined;
  try {
    // The digest header lives on the redirect, so it has to be read before the body.
    let response = await fetch(url, { signal, redirect: "manual" });
    let expected = linkedDigest(response.headers);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Speech model download failed with HTTP ${response.status}.`);
      response = await fetch(new URL(location, url), { signal, redirect: "manual" });
      expected ??= linkedDigest(response.headers);
    }
    if (!response.ok || !response.body) throw new Error(`Speech model download failed with HTTP ${response.status}.`);
    const total = Number(response.headers.get("content-length") ?? 0);
    const hash = createHash("sha256");
    handle = await open(part, "w");
    let read = 0, reported = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk as Uint8Array);
      hash.update(bytes);
      await handle.write(bytes);
      read += bytes.length;
      const at = Date.now();
      if (total > 0 && at - reported >= 200) { reported = at; onProgress(Math.floor((read / total) * 100)); }
    }
    await handle.close(); handle = undefined;
    if (expected && expected !== hash.digest("hex")) throw new Error("Speech model failed its integrity check.");
    onProgress(100);
    await rename(part, destination);
  } catch (error) {
    if (handle) { try { await handle.close(); } catch { /* closed */ } }
    await discard();
    throw error;
  }
}

function lastLines(text: string, count = 2, limit = 300): string {
  return stripVTControlCharacters(text).split(/\r?\n/).map(line => line.trim())
    .filter(Boolean).slice(-count).join(" ").slice(0, limit);
}

function run(command: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  const settled = Promise.withResolvers<{ code: number | null; stderr: string }>();
  const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8192); });
  child.stderr?.on("error", () => {});
  child.once("error", settled.reject);
  child.once("close", code => settled.resolve({ code, stderr }));
  return settled.promise;
}

/** dshow has no default device, so enumerate instead of guessing a name. */
function listDshowAudio(ffmpeg: string): Promise<string> {
  const settled = Promise.withResolvers<string>();
  let stderr = "";
  const child = spawn(ffmpeg, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  const timer = setTimeout(() => child.kill(), 5_000);
  timer.unref?.();
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8192); });
  child.stderr?.on("error", () => {});
  const done = () => { clearTimeout(timer); settled.resolve(stderr); };
  child.once("close", done);
  child.once("error", done);
  return settled.promise;
}

export function createLocalDictation(options: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv }) {
  const { platform, env } = options;
  const cache = cacheDirectory(platform, env);

  const tools = (): DictationTools => {
    const model = modelCandidates(platform, env, cache).find(candidate => existsSync(candidate));
    return {
      ffmpeg: findExecutable(env.PI_DICTATION_FFMPEG || "ffmpeg", env, platform),
      whisper: findExecutable(env.PI_DICTATION_WHISPER || "whisper-cli", env, platform),
      model,
    };
  };

  async function captureInput(ffmpeg: string): Promise<string> {
    if (env.PI_DICTATION_INPUT) return env.PI_DICTATION_INPUT;
    if (platform !== "win32") return "";
    const listed = await listDshowAudio(ffmpeg);
    const device = parseDshowAudio(listed);
    if (!device) throw new DictationError(captureFailureHint(platform, listed));
    return `audio=${device}`;
  }

  async function start(): Promise<CaptureSession> {
    const ffmpeg = tools().ffmpeg;
    if (!ffmpeg) throw new DictationError(dictationSetupHint(platform));
    const directory = await mkdtemp(join(tmpdir(), "pi-dictation-"));
    let removal: Promise<void> | undefined;
    const remove = () => (removal ??= rm(directory, { recursive: true, force: true }).catch(() => {}));
    const wav = join(directory, "dict.wav");
    let child: ChildProcess | undefined;
    try {
      const input = await captureInput(ffmpeg);
      child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...captureArgs(platform, input),
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    } catch (error) {
      await remove();
      throw error;
    }
    const process = child;
    let stderr = "", stopping = false, exited = false, hint: string | undefined, spawnError: NodeJS.ErrnoException | undefined;
    const listeners: ((reason: string) => void)[] = [];
    process.stderr?.setEncoding("utf8");
    process.stderr?.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8192); });
    process.stderr?.on("error", () => {});
    // ffmpeg never reads a piped stdin, so the 'q' write below can fail with
    // EPIPE on this stream; an unread 'error' event would kill the whole host.
    process.stdin?.on("error", () => {});
    const closed = Promise.withResolvers<void>();
    const startup = Promise.withResolvers<boolean>();
    // A spawn that cannot execute (ENOENT/EACCES/EAGAIN) emits only 'error' and
    // 'close': no 'exit', so startup must settle from here as well.
    process.on("error", (error: NodeJS.ErrnoException) => {
      spawnError = error;
      closed.resolve();
      startup.resolve(true);
      if (stopping) return;
      // Late stream errors must not leave the rail saying REC forever.
      hint = `Capture failed: ${error.code ?? error.message}`;
      for (const listener of listeners.splice(0)) listener(hint);
    });
    process.once("close", () => { closed.resolve(); startup.resolve(true); });
    process.once("exit", code => {
      exited = true;
      // A device that dies mid-recording must not leave the rail saying REC forever.
      if (stopping || !code) return;
      hint = captureFailureHint(platform, stderr);
      for (const listener of listeners.splice(0)) listener(hint);
    });
    const startupTimer = setTimeout(() => startup.resolve(false), STARTUP_GRACE_MS);
    startupTimer.unref?.();
    if (await startup.promise) {
      clearTimeout(startupTimer);
      await closed.promise;
      await remove();
      throw new DictationError(spawnError
        ? `ffmpeg could not start (${spawnError.code ?? spawnError.message}): ${ffmpeg}`
        : captureFailureHint(platform, stderr));
    }
    return {
      path: wav,
      onExit(callback) {
        if (hint) callback(hint); else listeners.push(callback);
      },
      async stop() {
        stopping = true;
        // ffmpeg only reads 'q' on a real terminal; an interrupt is what makes it
        // finalize the wav header, so send both and take whichever lands.
        if (!exited && process.stdin && !process.stdin.destroyed && process.stdin.writable) {
          try { process.stdin.write("q\n"); } catch { /* ffmpeg closed stdin */ }
        }
        if (!exited) {
          try { process.kill("SIGINT"); } catch { /* already gone */ }
          const grace = Promise.withResolvers<void>();
          const timer = setTimeout(() => grace.resolve(), STOP_GRACE_MS);
          await Promise.race([closed.promise, grace.promise]);
          clearTimeout(timer);
          if (!exited) { try { process.kill("SIGKILL"); } catch { /* gone */ } await closed.promise; }
        }
        const size = existsSync(wav) ? statSync(wav).size : 0;
        if (size < MINIMUM_WAV_BYTES) throw new DictationError(captureFailureHint(platform, stderr));
        return wav;
      },
      cancel() {
        stopping = true;
        try { process.kill(); } catch { /* gone */ }
        void remove();
      },
      async cleanup() { await remove(); },
    };
  }

  async function transcribe(wav: string): Promise<string> {
    const { whisper, model } = tools();
    if (!whisper) throw new DictationError(dictationSetupHint(platform));
    if (!model) throw new DictationError("Speech model not found; click the mic to download it.");
    const base = wav.replace(/\.wav$/, "");
    const { code, stderr } = await run(whisper,
      ["-m", model, "-f", wav, "-otxt", "-of", base, "-l", env.PI_DICTATION_LANGUAGE || "en", "-np"]);
    if (code !== 0) throw new DictationError(`whisper.cpp failed: ${lastLines(stderr)}`);
    return await readFile(`${base}.txt`, "utf8").catch(() => { throw new DictationError("whisper.cpp produced no text file."); });
  }

  async function installModel(onProgress: (percent: number) => void, signal: AbortSignal): Promise<string> {
    await mkdir(cache, { recursive: true, mode: 0o700 });
    const destination = join(cache, MODEL_FILENAME);
    await downloadModel(destination, onProgress, signal, env.PI_DICTATION_MODEL_URL || MODEL_URL);
    return destination;
  }

  return { cache, tools, start, transcribe, installModel };
}

export interface DictationDeps {
  tools: () => DictationTools;
  cache: string;
  platform: NodeJS.Platform;
  start: () => Promise<CaptureSession>;
  transcribe: (wav: string) => Promise<string>;
  installModel: (onProgress: (percent: number) => void, signal: AbortSignal) => Promise<string>;
  confirm: (title: string, message: string) => Promise<boolean>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  editor: () => (Pick<EditorComponent, "getText" | "setText"> & { insertTextAtCursor?: (text: string) => void }) | undefined;
  refresh: () => void;
  now?: () => number;
}

/** One control, one state machine. Every await re-checks the generation so a
 * cancelled capture can never insert text or overwrite newer state. */
export class DictationController {
  private readonly deps: DictationDeps;
  private current: DictationPhase;
  private starting = false;
  private startedAt = 0;
  private stoppedAt = 0;
  private percent = 0;
  private generation = 0;
  private session?: CaptureSession;
  private capTimer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private confirming = false;
  private disposed = false;

  constructor(deps: DictationDeps) {
    this.deps = deps;
    // A missing model stays idle: it is downloadable, unlike the tools.
    const { ffmpeg, whisper } = deps.tools();
    this.current = ffmpeg && whisper ? "idle" : "unavailable";
  }

  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private clearCap(): void { clearTimeout(this.capTimer); this.capTimer = undefined; }
  private settle(): void {
    const { ffmpeg, whisper } = this.deps.tools();
    this.current = ffmpeg && whisper ? "idle" : "unavailable";
  }

  phase(): DictationPhase { return this.current; }
  elapsed(): number {
    if (this.current === "recording") return Math.max(0, this.now() - this.startedAt);
    if (this.current === "transcribing") return Math.max(0, this.now() - this.stoppedAt);
    return 0;
  }
  label(icons: DictationIcons): string { return dictationLabel(this.current, this.elapsed(), this.percent, icons); }
  busy(): boolean { return this.current === "recording" || this.current === "transcribing" || this.current === "downloading"; }

  async toggle(): Promise<void> {
    if (this.disposed) return;
    if (this.current === "recording") { await this.stop(); return; }
    if (this.current === "transcribing" || this.current === "downloading") { this.deps.notify("Dictation is busy.", "info"); return; }
    // cancel() bumps this generation. Everything after an await re-checks it, so a
    // cancelled confirmation or download can never start a capture or clobber a
    // newer one, and never throws into the caller that fire-and-forgets toggle().
    const generation = this.generation;
    const tools = this.deps.tools();
    if (!tools.ffmpeg || !tools.whisper) {
      this.current = "unavailable";
      this.deps.notify(dictationSetupHint(this.deps.platform), "warning");
      return;
    }
    if (!tools.model) {
      this.confirming = true;
      let accepted = false;
      try {
        accepted = await this.deps.confirm("Download speech model?",
          `${MODEL_FILENAME} (142 MB) will be saved to ${this.deps.cache}. Speech is transcribed locally by whisper.cpp and never uploaded. Download now?`);
      } catch (error) {
        if (!this.disposed && generation === this.generation) this.deps.notify(`Dictation setup failed: ${message(error)}`, "error");
        return;
      } finally {
        this.confirming = false;
      }
      if (this.disposed || generation !== this.generation) return;
      if (!accepted) { this.deps.notify("Dictation model not installed; nothing was downloaded.", "info"); return; }
      this.current = "downloading"; this.percent = 0; this.deps.refresh();
      const abort = this.abort = new AbortController();
      try {
        await this.deps.installModel(percent => {
          if (this.disposed || generation !== this.generation) return;
          this.percent = Math.max(0, Math.min(100, Math.floor(percent)));
          this.deps.refresh();
        }, abort.signal);
      } catch (error) {
        if (!this.disposed && generation === this.generation) {
          this.percent = 0; this.settle();
          this.deps.notify(`Model download failed: ${message(error)}`, "error");
          this.deps.refresh();
        }
        return;
      } finally {
        if (this.abort === abort) this.abort = undefined;
      }
      if (this.disposed || generation !== this.generation) return;
      const ready = this.deps.tools();
      if (!ready.model) { this.settle(); this.deps.notify("The speech model is still missing after the download.", "error"); return; }
      if (!ready.ffmpeg || !ready.whisper) { this.current = "unavailable"; this.deps.notify(dictationSetupHint(this.deps.platform), "warning"); return; }
    }
    if (this.disposed || generation !== this.generation) return;
    await this.startRecording();
  }

  private async startRecording(): Promise<void> {
    if (this.starting || this.disposed) return;
    this.starting = true;
    const generation = ++this.generation;
    try {
      const session = await this.deps.start();
      if (this.disposed || generation !== this.generation) { session.cancel(); return; }
      this.session = session;
      this.current = "recording";
      this.startedAt = this.now();
      this.deps.refresh();
      session.onExit(hint => {
        if (this.disposed || this.generation !== generation || this.current !== "recording") return;
        this.clearCap();
        this.session = undefined;
        this.current = "idle";
        this.deps.notify(hint, "warning");
        this.deps.refresh();
      });
      this.capTimer = setTimeout(() => { void this.stop(); }, CAPTURE_CAP_MS);
      this.capTimer.unref?.();
    } catch (error) {
      if (generation === this.generation && !this.disposed) {
        this.settle();
        this.deps.notify(error instanceof DictationError ? error.hint : message(error), "warning");
      }
    } finally {
      this.starting = false;
    }
  }

  private async stop(): Promise<void> {
    const session = this.session;
    if (this.current !== "recording" || !session) return;
    const generation = this.generation;
    this.current = "transcribing";
    this.stoppedAt = this.now();
    this.clearCap();
    this.deps.refresh();
    try {
      const wav = await session.stop();
      const text = sanitizeTranscript(await this.deps.transcribe(wav));
      if (this.disposed || generation !== this.generation) return;
      if (!text) { this.deps.notify("No speech detected.", "warning"); return; }
      this.insert(text);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.deps.notify(error instanceof DictationError ? error.hint : `Dictation failed: ${message(error)}`, "warning");
    } finally {
      await session.cleanup();
      if (this.session === session) this.session = undefined;
      if (generation === this.generation && !this.disposed) this.settle();
      if (!this.disposed) this.deps.refresh();
    }
  }

  /** The cursor decides placement; the draft is only rebuilt when the editor has no insert. */
  private insert(text: string): void {
    const editor = this.deps.editor();
    if (!editor) { this.deps.notify("The Composer editor is unavailable.", "warning"); return; }
    if (typeof editor.insertTextAtCursor === "function") { editor.insertTextAtCursor(text); return; }
    const draft = editor.getText();
    editor.setText(draft && !/\s$/.test(draft) ? draft + " " + text : draft + text);
  }

  /** A prompt starts its own dialog; don't let that dialog cancel the question it asks. */
  cancel(reason: "prompt" | "user" | "dispose" = "user"): void {
    if (reason === "prompt" && this.confirming) return;
    this.generation++;
    this.clearCap();
    this.abort?.abort(); this.abort = undefined;
    const session = this.session;
    this.session = undefined;
    session?.cancel();
    this.percent = 0;
    this.settle();
    if (!this.disposed) this.deps.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel("dispose");
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
