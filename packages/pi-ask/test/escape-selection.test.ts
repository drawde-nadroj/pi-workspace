import assert from "node:assert/strict";
import { test } from "node:test";
import { getKeybindings } from "@earendil-works/pi-tui";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";

const theme = {
	fg: (color: string, text: string) => color === "success" ? `<green>${text}</green>` : text,
	bg: (_: string, text: string) => text,
	bold: (text: string) => text,
};

test("Esc clears a staged radio answer and its green highlight without closing the form", () => {
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
	assert.equal(result, undefined);
	assert.equal(state.activeTab, 0);
	assert.equal(state.cancelArmed, false);
	assert.equal(state.tabs[0].answer, null);
	assert.equal(state.tabs[0].selected.size, 0);
	assert.equal(state.selected.size, 0);
	assert.equal(state.tabs[0].note, "Keep my note");
	assert.doesNotMatch(render(), /<green>First choice<\/green>|\(●\)/);
	select();
	assert.match(render(), /<green>First choice<\/green>/, "the answer can be selected again");
	component.handleInput("\x1b[C");
	select();
	component.handleInput("\x1b");
	assert.equal(state.tabs[0].selected.size, 1, "other questions keep their answers");
	assert.equal(state.tabs[1].answer, null);
	assert.equal(result, undefined);
});
