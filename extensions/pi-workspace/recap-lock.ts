import { open, readFile, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

/** One local request at a time across Pi processes. No daily call cap. */
export async function withRecapLock<T>(path: string, signal: AbortSignal, work: () => Promise<T>, waitMs = 120000): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  const token = randomUUID(), owner = JSON.stringify({ pid: process.pid, token }), start = Date.now();
  while (true) {
    signal.throwIfAborted();
    try {
      const file = await open(path, "wx", 0o600);
      try { await file.writeFile(owner); } finally { await file.close(); }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const raw = await readFile(path, "utf8"), old = JSON.parse(raw);
        if (Number.isInteger(old.pid) && old.pid > 0 && typeof old.token === "string") {
          let dead = false;
          try { process.kill(old.pid, 0); } catch (e) { dead = (e as NodeJS.ErrnoException).code === "ESRCH"; }
          if (dead) throw new Error("Recap stale lock");
        }
      } catch (e) { if (e instanceof Error && e.message === "Recap stale lock") throw e; /* Incomplete ownership: wait, never remove a potentially live lock. */ }
      if (Date.now() - start >= waitMs) throw new Error("Recap queue timeout");
      await delay(100, undefined, { signal });
    }
  }
  try { signal.throwIfAborted(); return await work(); }
  finally { try { if (await readFile(path, "utf8") === owner) await unlink(path); } catch { /* Already released. */ } }
}
