import assert from "node:assert/strict";
import { test } from "node:test";
import { getKeybindings } from "@earendil-works/pi-tui";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";

const theme = {
	fg: (color: string, text: string) => color === "success" ? `<green>${text}</green>` : text,
	bg: (_: string, text: string) => text,
	bold: (text: string) => text,
};

test("Esc never clears a staged radio answer; Ctrl+C unselects it instead", () => {
	let result: unknown;
	const component = new TabbedQuestions([
		{ question: "First?", mode: "single-select", options: [{ label: "First choice", value: "first" }] },
		{ question: "Second?", mode: "single-select", options: [{ label: "Second choice", value: "second" }] },
	], { terminal: { rows: 40 }, requestRender() {} }, theme, getKeybindings(), (value) => { result = value; });
	component.focused = true;
	const state = component as any;
	const render = () => component.render(100).join("\n");
	const select = () => component.handleInput("\r");
	select();
	assert.match(render(), /<green>First choice<\/green>/);
	component.handleInput("\t"); // Focus + Note.
	component.handleInput("\r"); // Activate it.
	component.handleInput("Keep my note");
	component.handleInput("\t"); // Save note and return directly to the answer.
	component.handleInput("\x1b");
	assert.equal(result, undefined, "one Escape asks before closing");
	assert.equal(state.activeTab, 0);
	assert.equal(state.dismissConfirm, true);
	assert.equal(state.tabs[0].answer !== null, true, "closing never silently unselects");
	assert.match(render(), /Discard 1 answer and 1 note and close\?/);
	component.handleInput("n");
	assert.equal(state.dismissConfirm, false);
	assert.match(render(), /<green>First choice<\/green>/, "keeping the form keeps the selection");
	assert.equal(state.tabs[0].note, "Keep my note");
	component.handleInput("\x03"); // Ctrl+C clears the selection, not the note.
	assert.equal(state.tabs[0].answer, null);
	assert.equal(state.tabs[0].selected.size, 0);
	assert.equal(state.tabs[0].note, "Keep my note");
	assert.doesNotMatch(render(), /<green>First choice<\/green>/);
	select();
	assert.match(render(), /<green>First choice<\/green>/, "the answer can be selected again");
	component.handleInput("\x1b[C");
	select();
	component.handleInput("\x1b");
	assert.equal(state.tabs[0].selected.size, 1, "the confirmation only asks; it never edits state");
	assert.equal(state.tabs[1].answer !== null, true, "other questions keep their answers");
	component.handleInput("\x1b");
	assert.equal(result, null);
});
