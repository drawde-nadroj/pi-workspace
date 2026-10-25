import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

export type WorkspaceSoundKind = "done" | "question";

const SOUND_FILES: Record<WorkspaceSoundKind, string> = {
  done: fileURLToPath(new URL("./assets/sounds/react-bits-pluck.wav", import.meta.url)),
  question: fileURLToPath(new URL("./assets/sounds/react-bits-hint.wav", import.meta.url)),
};

interface Playback {
  child: ChildProcess;
  cancelled: boolean;
}

/** Native playback of original React Bits Sound Lab exports; see assets/sounds/PROVENANCE.json. */
export class WorkspaceSounds {
  private readonly active = new Set<Playback>();

  /** Resolves when playback closes; the caller owns reporting playback failures. */
  async play(kind: WorkspaceSoundKind): Promise<void> {
    if (process.platform !== "darwin") {
      throw new Error(`Egregore sounds require macOS afplay; ${process.platform} is not supported.`);
    }

    // Keep the bundled renders untouched; only the question playback is quieter.
    const child = spawn("/usr/bin/afplay", ["-v", kind === "question" ? "0.6" : "1", SOUND_FILES[kind]], {
      stdio: "ignore",
      shell: false,
    });
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const playback: Playback = { child, cancelled: false };
    this.active.add(playback);
    let failure: Error | undefined;
    child.once("error", (error: Error) => { failure = error; });
    child.once("close", (code, signal) => {
      this.active.delete(playback);
      if (playback.cancelled) {
        resolve();
      } else if (failure) {
        reject(new Error(`Egregore ${kind} sound could not play: ${failure.message}`, { cause: failure }));
      } else if (code !== 0) {
        reject(new Error(`Egregore ${kind} sound failed: afplay ${signal ? `was terminated by ${signal}` : `exited with code ${code}`}.`));
      } else {
        resolve();
      }
    });
    return promise;
  }

  /** Stop current playback without warnings. The instance remains reusable after reload/off. */
  dispose(): void {
    for (const playback of this.active) {
      if (playback.cancelled) continue;
      playback.cancelled = true;
      // afplay only reads our assets: immediate termination needs no file flush or grace timer.
      playback.child.kill("SIGKILL");
    }
  }
}
