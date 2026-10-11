import { randomUUID } from "node:crypto";
import { open, lstat, mkdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

const MARKER = ".chronomancer.json";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export type Entry = { id: string; root: string; parent: string | null; depth: number; level: number; time: string; createdAt: string; body: string; revision: false };
export type Snapshot = { day: string; entries: Entry[] };
export type Journal = { directory: string; id: string };

export function localDay(now = new Date()): string {
  const n = (v: number) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${n(now.getMonth() + 1)}-${n(now.getDate())}`;
}
export function validateDay(day: string): string {
  if (!datePattern.test(day)) throw new Error("Use a real date in YYYY-MM-DD format.");
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(year, month - 1, date);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== date) throw new Error("That date does not exist.");
  return day;
}
function file(journal: Journal, day: string): string { return join(journal.directory, `${validateDay(day)}.md`); }
function document(day: string) { return `<!-- chronomancer:day=${day} -->\n`; }

export async function createJournal(directory: string): Promise<Journal> {
  const path = resolve(directory);
  await mkdir(path, { recursive: true });
  const canonical = await realpath(path);
  const marker = join(canonical, MARKER);
  const handle = await open(marker, "wx", 0o600).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Chronomancer already exists at ${canonical}; use connect instead.`);
    throw error;
  });
  const id = randomUUID();
  try { await handle.writeFile(JSON.stringify({ version: 1, id, createdAt: new Date().toISOString() }) + "\n"); }
  finally { await handle.close(); }
  return { directory: canonical, id };
}
export async function connectJournal(directory: string): Promise<Journal> {
  if (!isAbsolute(directory)) throw new Error("Connect using an absolute journal directory path.");
  const canonical = await realpath(directory);
  const info = await lstat(join(canonical, MARKER));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Chronomancer marker must be a regular file.");
  const marker = JSON.parse(await readFile(join(canonical, MARKER), "utf8"));
  if (marker?.version !== 1 || typeof marker.id !== "string" || !/^[0-9a-f-]{36}$/.test(marker.id))
    throw new Error("Not a supported Chronomancer journal. No files were changed.");
  return { directory: canonical, id: marker.id };
}

/** One journal per working directory. An existing marker takes precedence; never
 * turn an unrelated occupied directory into a journal without a user decision. */
export async function openLocalJournal(cwd: string): Promise<Journal> {
  const directory = await realpath(cwd);
  const existing = async (path: string) => lstat(path).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (await existing(join(directory, MARKER))) return connectJournal(directory);
  const child = join(directory, "chronomancer");
  const info = await existing(child);
  if (!info) return createJournal(child);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`${child} already exists but is not a journal directory; no files were changed.`);
  if (!await existing(join(child, MARKER)))
    throw new Error(`${child} already exists without a Chronomancer marker; inspect it before creating a journal there. No files were changed.`);
  return connectJournal(child);
}

function parse(source: string, day: string): { entry: Entry; start: number; finish: number }[] {
  if (!source.startsWith(document(day))) throw new Error(`Unexpected content in ${day}.md; no changes made.`);
  const lines = source.split("\n");
  const nodes: { entry: Entry; start: number; finish: number }[] = [];
  const byId = new Map<string, Entry>();
  let current: typeof nodes[number] | undefined;
  for (let i = 1; i < lines.length; i++) {
    const heading = /^(#{1,6}) (\d{2}:\d{2}:\d{2})$/.exec(lines[i]);
    if (!heading) {
      if (/^#{1,6}\s/.test(lines[i])) throw new Error(`Unrecognized heading at line ${i + 1}; no changes made.`);
      continue;
    }
    if (current) current.finish = i;
    const id = /^<!-- chronomancer:id=([0-9a-f-]{36}) -->$/.exec(lines[++i] ?? "")?.[1];
    const createdAt = /^<!-- chronomancer:created-at=(\d{4}-\d{2}-\d{2}T[^ ]+) -->$/.exec(lines[++i] ?? "")?.[1];
    const parentRaw = /^<!-- chronomancer:parent=([0-9a-f-]{36}|none) -->$/.exec(lines[++i] ?? "")?.[1];
    if (!id || !createdAt || !Number.isFinite(Date.parse(createdAt)) || !parentRaw || byId.has(id))
      throw new Error(`Malformed or duplicate Chronomancer metadata near line ${i - 1}; no changes made.`);
    const parent = parentRaw === "none" ? null : byId.get(parentRaw);
    if (parentRaw !== "none" && !parent) throw new Error("A journal parent is missing; no changes made.");
    const depth = parent ? parent.depth + 1 : 1;
    if (depth !== heading[1].length || depth > 5) throw new Error("Journal heading depth disagrees with its parent; no changes made.");
    const entry: Entry = { id, root: parent?.root ?? id, parent: parent?.id ?? null, depth, level: depth,
      time: heading[2], createdAt, body: "", revision: false };
    current = { entry, start: i - 3, finish: lines.length - 1 };
    nodes.push(current); byId.set(id, entry);
  }
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n], next = nodes[n + 1];
    const end = next?.start ?? lines.length;
    node.entry.body = lines.slice(node.start + 4, end).join("\n").trim();
    node.finish = end;
  }
  return nodes;
}
export async function list(journal: Journal, day: string): Promise<Snapshot> {
  const path = file(journal, day);
  let source: string;
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Journal day path must be a regular file.");
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { day, entries: [] };
  }
  return { day, entries: parse(source, day).map(node => node.entry) };
}
export async function store(journal: Journal, day: string, text: string, parentId?: string, now = new Date()): Promise<Entry> {
  const path = file(journal, day);
  if (!text.trim()) throw new Error("Write something before saving.");
  if (text.includes("\0") || /^#{1,6}\s/m.test(text)) throw new Error("Structural Markdown headings and NUL bytes cannot be entered as thoughts.");
  return withFileMutationQueue(path, async () => {
    // Exclusive creation is shared by independent Pi processes. An existing lock
    // blocks rather than risking a concurrent or partially completed write.
    const lockPath = `${path}.lock`;
    const lock = await open(lockPath, "wx", 0o600).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Journal day ${day} is being written; retry after checking ${lockPath}.`);
      throw error;
    });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      let source: string, existed = false;
      try {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error("Journal day path must be a regular file.");
        source = await readFile(path, "utf8"); existed = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        source = document(day);
      }
      const nodes = parse(source, day);
      const parent = parentId ? nodes.find(node => node.entry.id === parentId) : undefined;
      if (parentId && !parent) throw new Error("Selected thought is missing; rewind again.");
      if (parent && parent.entry.depth >= 5) throw new Error("Blue is the last user-writing stage.");
      const createdAt = now.toISOString();
      const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
      const id = randomUUID(), depth = (parent?.entry.depth ?? 0) + 1;
      const entry: Entry = { id, root: parent?.entry.root ?? id, parent: parentId ?? null,
        depth, level: depth, time, createdAt, body: text.replace(/\r\n/g, "\n").trim(), revision: false };
      const block = `\n${"#".repeat(depth)} ${time}\n<!-- chronomancer:id=${id} -->\n<!-- chronomancer:created-at=${createdAt} -->\n<!-- chronomancer:parent=${parentId ?? "none"} -->\n\n${entry.body}\n`;
      let insertion = source.length;
      if (parent) {
        const lines = source.split("\n");
        const following = nodes.find(node => node.start > parent.start && node.entry.depth <= parent.entry.depth);
        insertion = (following ? lines.slice(0, following.start).join("\n").length + 1 : source.length);
      }
      const result = source.slice(0, insertion).replace(/\n*$/, "\n") + block + source.slice(insertion);
      // Do not overwrite an edit made in another editor after our read.
      let latest: string | undefined;
      try { latest = await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (latest !== (existed ? source : undefined)) throw new Error("Journal changed on disk; no changes made. Rewind and retry.");
      const handle = await open(temp, "wx", 0o600);
      try { await handle.writeFile(result); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, path);
      return entry;
    } finally {
      await rm(temp, { force: true }).catch(() => {});
      await lock.close(); await rm(lockPath, { force: true });
    }
  });
}
