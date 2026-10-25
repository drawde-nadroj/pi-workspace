import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { DEFAULTS, preferencesFrom, type Preferences } from "./state.ts";

export const COMPOSER_SETTINGS = "pi-composer.json";
export const LEGACY_COMPOSER_SETTINGS = "pi-home.json";

/** New authority wins. Only absence permits the read-only legacy fallback. */
export async function loadComposerPreferences(directory = getAgentDir()): Promise<Preferences> {
  for (const name of [COMPOSER_SETTINGS, LEGACY_COMPOSER_SETTINGS]) {
    try { return preferencesFrom(JSON.parse(await readFile(join(directory, name), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return { ...DEFAULTS };
}

/** Only an explicit Composer control save creates the new file; never rewrite legacy data. */
export async function saveComposerPreferences(prefs: Preferences, directory = getAgentDir()): Promise<void> {
  const path = join(directory, COMPOSER_SETTINGS), temp = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temp, JSON.stringify(prefs, null, 2) + "\n", { mode: 0o600 });
    await rename(temp, path);
  } finally { await rm(temp, { force: true }).catch(() => {}); }
}
