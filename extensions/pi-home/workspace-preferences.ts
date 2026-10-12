import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { footerPrefs, FOOTER_DEFAULTS, type FooterPrefs } from "./footer-state.ts";

export const WORKSPACE_SETTINGS = "pi-workspace.json";
export const LEGACY_SETTINGS = "pi-footer.json";
export const WORKSPACE_VERSION = 1;

/** Track both authorities: the legacy file can change before the first Save. */
export async function workspaceSnapshot(dir = getAgentDir()): Promise<string> {
  const files = await Promise.all([WORKSPACE_SETTINGS, LEGACY_SETTINGS].map(async name => {
    try { return await readFile(join(dir, name), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }));
  return JSON.stringify(files);
}

/** One file authority: prefer the new name, but read the old file unchanged until Save. */
export async function loadWorkspacePrefs(dir = getAgentDir()): Promise<FooterPrefs> {
  for (const name of [WORKSPACE_SETTINGS, LEGACY_SETTINGS]) {
    let text: string;
    try { text = await readFile(join(dir, name), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const raw: unknown = JSON.parse(text);
    if (name === WORKSPACE_SETTINGS && (raw as { version?: unknown } | null)?.version !== WORKSPACE_VERSION)
      throw new Error(`Unsupported workspace settings version: ${String((raw as { version?: unknown } | null)?.version)}`);
    const appearance = (raw as { appearance?: unknown } | null)?.appearance;
    if (appearance !== undefined && (!appearance || typeof appearance !== "object" || (appearance as { version?: unknown }).version !== 1))
      throw new Error(`Unsupported Composer appearance version: ${String((appearance as { version?: unknown } | null)?.version)}`);
    const tasks = (raw as { tasks?: unknown } | null)?.tasks;
    if (tasks !== undefined) {
      if (!tasks || typeof tasks !== "object" || Array.isArray(tasks) || (tasks as { version?: unknown }).version !== 1)
        throw new Error(`Unsupported Tasks appearance version: ${String((tasks as { version?: unknown } | null)?.version)}`);
      const presentation = (tasks as { presentation?: unknown }).presentation;
      if (presentation !== undefined && (!presentation || typeof presentation !== "object" || Array.isArray(presentation)
        || (presentation as { version?: unknown }).version !== undefined && (presentation as { version?: unknown }).version !== 1))
        throw new Error(`Unsupported Tasks presentation version: ${String((presentation as { version?: unknown } | null)?.version)}`);
    }
    return footerPrefs(raw);
  }
  return { ...FOOTER_DEFAULTS };
}
