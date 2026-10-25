import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jiti, source, root, kb } from "./host.mjs";
const { ModalEditor } = await jiti.import(join(source, "../../node_modules/pi-vim/index.ts"));
const { KeybindingsManager } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/core/keybindings.js")));
const { getEditorTheme } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js")));
const { setKeybindings } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));

test("pi-vim 0.14.2: Windows undo needs the documented Ctrl+- compatibility alias even without Egregore", () => {
  // Reproduce Windows defaults on every OS; do not install Egregore decoration.
  const windows = new KeybindingsManager({ "app.suspend": [], "tui.editor.undo": "ctrl+z" });
  setKeybindings(windows);
  try {
    const editor = new ModalEditor({ terminal: { rows: 40 }, requestRender() {} }, getEditorTheme(), windows);
    editor.setClipboardMirrorPolicy("never");
    editor.setText("one two 界面");
    editor.handleInput("\x1b"); editor.handleInput("0"); editor.handleInput("x");
    assert.equal(editor.getText(), "ne two 界面");
    editor.handleInput("u");
    assert.equal(editor.getText(), "ne two 界面", "upstream hard-coded Ctrl+- does not match Windows Ctrl+Z");
    // Apply precisely the supported user configuration, retaining Windows undo.
    windows.setUserBindings({ "app.suspend": [], "tui.editor.undo": ["ctrl+z", "ctrl+-"] });
    assert.ok(windows.matches("\x1a", "tui.editor.undo"));
    assert.ok(windows.matches("\x1f", "tui.editor.undo"));
    editor.handleInput("u");
    assert.equal(editor.getText(), "one two 界面", "history was retained; the alias makes Vim undo reach it");
  } finally { setKeybindings(kb); }
});
