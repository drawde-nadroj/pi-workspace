import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import { list, type Entry, type Journal } from "./journal.ts";

export type MirroredEntry = Entry & { day: string };
export type JournalUpdate = {
  entries: MirroredEntry[];
  added: MirroredEntry[];
  changed: MirroredEntry[];
  initial: boolean;
};

/** Observe commits, not keystrokes. Notifications are hints: always reread the
 * atomic Markdown files, deduplicate by stable ID, and reconcile after gaps. */
export async function observeJournal(
  journal: Journal,
  onUpdate: (update: JournalUpdate) => void,
  onError: (error: Error) => void,
  options: { pollMs?: number; debounceMs?: number; watch?: boolean } = {},
): Promise<() => void> {
  let closed = false, refreshing = false, again = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const days = new Map<string, MirroredEntry[]>();
  const known = new Map<string, string>();
  const errors = new Set<string>();
  const report = (error: unknown) => {
    const value = error instanceof Error ? error : new Error(String(error));
    if (!errors.has(value.message)) { errors.add(value.message); onError(value); }
  };
  const refresh = async (initial = false) => {
    if (closed) return;
    if (refreshing) { again = true; return; }
    refreshing = true;
    try {
      const filenames = (await readdir(journal.directory))
        .filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort();
      const present = new Set(filenames.map(name => name.slice(0, -3)));
      for (const name of filenames) {
        const day = name.slice(0, -3);
        try {
          const snapshot = await list(journal, day);
          days.set(day, snapshot.entries.map(entry => ({ ...entry, day })));
        } catch (error) { report(error); } // Retain the last valid projection.
      }
      for (const day of days.keys()) {
        if (!present.has(day)) report(new Error(`Journal day ${day} disappeared; retaining its last visible snapshot.`));
      }
      if (closed) return;
      const entries = [...days.values()].flat();
      const current = new Map(entries.map(entry => [`${entry.day}:${entry.id}`, JSON.stringify(entry)]));
      const added = entries.filter(entry => !known.has(`${entry.day}:${entry.id}`));
      const changed = entries.filter(entry => {
        const id = `${entry.day}:${entry.id}`;
        return known.has(id) && known.get(id) !== current.get(id);
      });
      if (initial || added.length || changed.length || current.size !== known.size) {
        known.clear(); for (const [id, body] of current) known.set(id, body);
        onUpdate({ entries, added: initial ? [] : added, changed: initial ? [] : changed, initial });
      }
    } catch (error) { report(error); }
    finally {
      refreshing = false;
      if (again && !closed) { again = false; void refresh(); }
    }
  };
  const schedule = () => {
    if (closed) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { debounce = undefined; void refresh(); }, options.debounceMs ?? 60);
  };
  let watcher: FSWatcher | undefined;
  try {
    if (options.watch !== false) watcher = watch(journal.directory, (_event, filename) => {
      // A missing filename is possible; a complete rescan also covers rename.
      if (!filename || /^\d{4}-\d{2}-\d{2}\.md$/.test(String(filename))) schedule();
    });
    watcher?.on("error", report);
  } catch (error) { report(error); }
  // Do not rely on fs.watch alone: some filesystems coalesce or lose events.
  const poll = setInterval(() => { void refresh(); }, options.pollMs ?? 1500);
  poll.unref?.();
  await refresh(true); // Subscribe before snapshot so a concurrent save is not lost.
  return () => {
    if (closed) return;
    closed = true;
    watcher?.close(); clearInterval(poll);
    if (debounce) clearTimeout(debounce);
  };
}
