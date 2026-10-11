import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { footerPrefs, FOOTER_DEFAULTS, type FooterPrefs } from "./footer-state.ts";

export const WORKSPACE_SETTINGS = "pi-workspace.json";
export const LEGACY_SETTINGS = "pi-footer.json";
export const WORKSPACE_VERSION = 1;

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
    return footerPrefs(raw);
  }
  return { ...FOOTER_DEFAULTS };
}
