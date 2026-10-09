import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Local Pi integration boundary for in-process package upgrades.
 *
 * Both native module exports AND package export maps can outlive /reload.
 * Resolve only the established root entry (without evaluating its cached code),
 * then load the current implementation files by URL. Do not introduce another
 * package subpath dependency here, clear global caches, or fall back to a renderer
 * that silently drops labels. The installed frame package owns both sibling files.
 * Type-only package imports below are erased before runtime resolution.
 */
const packageDirectory = dirname(createRequire(import.meta.url).resolve("pi-embeddable-frame"));
const primitives: typeof import("pi-embeddable-frame/primitives") = await import(
  pathToFileURL(join(packageDirectory, "primitives.js")).href
);
const presentation: typeof import("pi-embeddable-frame/presentation") = await import(
  pathToFileURL(join(packageDirectory, "presentation.js")).href
);

export const { frameRail, frameRows, paintFramePerimeter, statusPreset } = primitives;
export const {
  FRAME_POSITIONS, FRAME_STATES, framePresentationDefaults, readFramePresentation,
  createFrameController, presentationRows,
} = presentation;
export type * from "pi-embeddable-frame/primitives";
export type * from "pi-embeddable-frame/presentation";
