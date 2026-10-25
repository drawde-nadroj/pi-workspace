import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

export type WorkspaceSoundKind = "done" | "question";

const SOUND_FILES: Record<WorkspaceSoundKind, string> = {
  done: fileURLToPath(new URL("./assets/sounds/react-bits-pluck.wav", import.meta.url)),
  question: fileURLToPath(new URL("./assets/sounds/react-bits-hint.wav", import.meta.url)),
};

// The asset path is data, never PowerShell source (spaces, quotes and Unicode are safe).
const WINDOWS_PLAY = `
$ErrorActionPreference = 'Stop'
$player = $null
try {
  $player = New-Object System.Media.SoundPlayer
  $player.SoundLocation = $env:PI_WORKSPACE_SOUND_FILE
  $player.Load()
  $player.PlaySync()
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  if ($null -ne $player) { $player.Dispose() }
}`;

interface Playback {
  child: ChildProcess;
  cancelled: boolean;
}

/** Native playback of bundled PCM exports; see assets/sounds/PROVENANCE.json. */
export class WorkspaceSounds {
  private readonly active = new Set<Playback>();
  private generation = 0;
  private readonly platform: NodeJS.Platform;
  private readonly spawnPlayer: typeof spawn;

  constructor(options: { platform?: NodeJS.Platform; spawn?: typeof spawn } = {}) {
    this.platform = options.platform ?? process.platform;
    this.spawnPlayer = options.spawn ?? spawn;
  }

  /** Resolves when playback closes; the caller owns reporting playback failures. */
  async play(kind: WorkspaceSoundKind): Promise<void> {
    const file = SOUND_FILES[kind];
    const players: [string, string[]][] = this.platform === "darwin"
      ? [["/usr/bin/afplay", [file]]]
      : this.platform === "win32"
        ? [["powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_PLAY]]]
        : this.platform === "linux"
          ? [["pw-play", [file]], ["paplay", [file]], ["aplay", ["-q", file]]]
          : [];
    if (!players.length) throw new Error(`Workspace sounds do not support ${this.platform}.`);
    const generation = this.generation;
    for (const [command, args] of players) {
      if (generation !== this.generation) return;
      if (await this.playWith(command, args, file, kind)) return;
    }
    if (generation !== this.generation) return;
    const hint = this.platform === "linux"
      ? "Install pw-play (PipeWire), paplay (PulseAudio), or aplay (alsa-utils), and configure an audio output."
      : this.platform === "win32"
        ? "Windows PowerShell (powershell.exe) must be available on PATH."
        : "macOS /usr/bin/afplay is unavailable.";
    throw new Error(`Workspace sounds: no native player found. ${hint}`);
  }

  /** Try another backend only when the executable is missing, not on audio/device errors. */
  private playWith(command: string, args: string[], file: string, kind: WorkspaceSoundKind): Promise<boolean> {
    const child = this.spawnPlayer(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
      windowsHide: true,
      env: this.platform === "win32" ? { ...process.env, PI_WORKSPACE_SOUND_FILE: file } : process.env,
    });
    const { promise, resolve, reject } = Promise.withResolvers<boolean>();
    const playback: Playback = { child, cancelled: false };
    this.active.add(playback);
    let failure: NodeJS.ErrnoException | undefined;
    let diagnostic = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { diagnostic = (diagnostic + chunk).slice(-2048); });
    child.stderr?.on("error", (error: NodeJS.ErrnoException) => { failure = error; });
    child.once("error", (error: NodeJS.ErrnoException) => { failure = error; });
    child.once("close", (code, signal) => {
      this.active.delete(playback);
      if (playback.cancelled) {
        resolve(true);
      } else if (failure?.code === "ENOENT") {
        resolve(false);
      } else if (failure) {
        reject(new Error(`Workspace ${kind} sound could not play via ${command}: ${failure.message}`, { cause: failure }));
      } else if (code !== 0) {
        reject(new Error(`Workspace ${kind} sound failed: ${command} ${signal ? `was terminated by ${signal}` : `exited with code ${code}`}.${diagnostic.trim() ? ` ${diagnostic.trim()}` : ""}`));
      } else {
        resolve(true);
      }
    });
    return promise;
  }

  /** Stop current playback without warnings. The instance remains reusable after reload/off. */
  dispose(): void {
    this.generation++;
    for (const playback of this.active) {
      if (playback.cancelled) continue;
      playback.cancelled = true;
      // Players only read our assets; cancellation needs no file flush.
      playback.child.kill("SIGKILL");
    }
  }
}
