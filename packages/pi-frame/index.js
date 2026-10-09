// Keep the public barrel, but let presentation depend on primitives directly.
// A previously cached root must not hide a newly added presentation API.
export { statusPreset, frameRail, frameRows, paintFramePerimeter } from "./primitives.js";
export { FRAME_POSITIONS, FRAME_STATES, framePresentationDefaults, readFramePresentation, createFrameController, presentationRows } from "./presentation.js";
