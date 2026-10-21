import assert from "node:assert/strict";
import { test } from "node:test";
import { CURSOR_MARKER, getKeybindings, TuiAltScreen, TuiMainScreen, visibleWidth } from "@earendil-works/pi-tui";
import { askText, askSingleChoice, askMultiChoice } from "../extensions/ask-user-question/standalone-ui.ts";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";
import { createNoteEditor, createQuestionEditor, renderOptionalNote, sanitizeDisplayText, sanitizeEditorDisplay } from "../extensions/ask-user-question/tui-primitives.ts";
import type { QuestionDef } from "../extensions/ask-user-question/domain.ts";

const keys = { tab: "\t", backTab: "\x1b[Z", enter: "\r", escape: "\x1b", clear: "\x03", enhancedClear: "\x1b[99;5u", left: "\x1b[D", right: "\x1b[C", newline: "\x1b[13;2u", submit: "\x1b[13;5u", ask: "\x1b[47;5u" };
const option = { label: "Keep the answer", value: "keep", recommended: true };
const theme = {
	fg: (_color: string, text: string) => `\x1b[34m${text}\x1b[39m`,
	bg: (_color: string, text: string) => `\x1b[44m${text}\x1b[49m`,
	bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};
function runtime(rows = 40) {
	let renders = 0;
	return { terminal: { rows }, requestRender() { renders++; }, get renders() { return renders; } };
}
function cursorCount(lines: string[]): number {
	return lines.join("\n").split(CURSOR_MARKER).length - 1;
}
function assertCursor(lines: string[], width: number, rows?: number) {
	assert.equal(cursorCount(lines), 1, "only the active editor owns the hardware cursor");
	assert.match(lines.join("\n"), /(?:\x1b\[7m[^]*?\x1b\[0m|\x1b_pi:fc\x07[^]*?\x1b_pi:\/fc\x07)/, "the editor retains its visual cursor for the host to render");
	for (const line of lines) assert.ok(visibleWidth(line) <= width, `line exceeds ${width} columns: ${sanitizeDisplayText(line)}`);
	if (rows !== undefined) assert.ok(lines.length <= rows, "frame fits terminal height");
}
function standalone(mode: "text" | "single-select" | "multi-select", rows = 40) {
	const tui = runtime(rows);
	let component: any;
	let result: any = undefined;
	const ctx: any = { ui: { custom(factory: any) {
		return new Promise((resolve) => {
			component = factory(tui, theme, getKeybindings(), (value: any) => { result = value; resolve(value); });
			component.focused = true;
		});
	} } };
	const pending = mode === "text" ? askText(ctx, "Your answer?", "Helpful context")
		: mode === "single-select" ? askSingleChoice(ctx, "Your answer?", undefined, [option])
		: askMultiChoice(ctx, "Your answer?", undefined, [option]);
	return { tui, component, pending, get result() { return result; } };
}
function batch(mode: QuestionDef["mode"], rows = 40) {
	const tui = runtime(rows);
	let result: any = undefined;
	const questions: QuestionDef[] = [
		{ question: "First answer?", label: "First", mode, options: mode === "text" ? [] : [option] },
		{ question: "Second answer?", label: "Second", mode: "text", options: [] },
	];
	const component = new TabbedQuestions(questions, tui, theme, getKeybindings(), (value) => { result = value; });
	component.focused = true;
	return { tui, component, get result() { return result; } };
}
function stage(component: any, mode: QuestionDef["mode"]) {
	component.handleInput(mode === "text" ? "Primary answer" : mode === "single-select" ? keys.enter : " ");
}

// Cover both legacy ANSI and Pi 1.2 renderer-owned cursors, not just the IME marker.
test("cursor sanitization preserves trusted wrappers and scrubs injected markers", () => {
	const start = "\x1b_pi:fc\x07", end = "\x1b_pi:/fc\x07";
	assert.equal(sanitizeEditorDisplay(`${CURSOR_MARKER}${start}界${end}`), `${CURSOR_MARKER}${start}界${end}`);
	assert.equal(sanitizeEditorDisplay(`${CURSOR_MARKER}\x1b[7mX\x1b[0m`), `${CURSOR_MARKER}\x1b[7mX\x1b[0m`);
	assert.equal(sanitizeDisplayText(`${start}plain${end}`), "plain");
	const editor = createQuestionEditor(runtime(), theme);
	editor.setText(`${CURSOR_MARKER}${start}untrusted${end}`);
	assert.equal(editor.getText(), "untrusted");
	editor.insertTextAtCursor(`${start}insert${end}`);
	editor.handleInput(`${start}typed${end}`);
	assert.ok(!editor.getText().includes("\x1b_pi:"));
});
test("sanitizer preserves only the focused editor's generated cursor", () => {
	const editor = createQuestionEditor(runtime(), theme);
	editor.setText(`ab${CURSOR_MARKER}cd\x1b[31mred\x1b[0m\x1b[2J`);
	editor.focused = true;
	const lines = editor.render(40).map(sanitizeEditorDisplay);
	assertCursor(lines, 40);
	assert.ok(!lines.join("").includes("\x1b[31m"));
	assert.ok(!lines.join("").includes("\x1b[2J"));
	assert.deepEqual(lines.map(sanitizeEditorDisplay), lines, "sanitization remains safe when applied twice");
	editor.focused = false;
	const blurred = editor.render(40).map(sanitizeEditorDisplay).join("");
	assert.ok(!blurred.includes(CURSOR_MARKER));
	assert.ok(!blurred.includes("\x1b[7m"), "inactive editors do not show a competing cursor");
});

test("note editor leaves cancellation to the form and keeps native cursor and undo", () => {
	for (const cancel of [keys.clear, keys.enhancedClear]) {
		const editor = createNoteEditor(runtime(), theme);
		editor.focused = true;
		editor.handleInput("A note");
		editor.handleInput(keys.enter);
		assert.equal(editor.getText(), "A note", "Enter does not submit inside the native editor");
		editor.handleInput(keys.newline);
		editor.handleInput("第二行 👩‍💻");
		const original = editor.getText();
		editor.handleInput(cancel);
		assert.equal(editor.getText(), original, "the form, not the editor, owns discard");
		assertCursor(editor.render(32).map(sanitizeEditorDisplay), 32);
		editor.handleInput("New note");
		editor.handleInput("\x1f"); // Ctrl+_ is Pi's default undo binding.
		assert.equal(editor.getText(), original);
	}
});

test("standalone Ctrl+C restores an earlier committed note rather than erasing it", async () => {
	const h = standalone("text");
	h.component.handleInput("Answer");
	h.component.handleInput(keys.tab);
	h.component.handleInput(keys.enter);
	h.component.handleInput("Saved note");
	h.component.handleInput(keys.enter);
	h.component.handleInput(keys.tab);
	h.component.handleInput(keys.enter);
	h.component.handleInput("Unwanted change");
	h.component.handleInput(keys.clear);
	assert.match(sanitizeDisplayText(h.component.render(80).join("\n")), /\+ Note: Saved note/);
	h.component.handleInput(keys.enter);
	assert.equal((await h.pending as any).note, "Saved note");
});

test("active note editor has a purple perimeter without coloring its input", () => {
	const purple = "\x1b[38;2;150;110;230m";
	const palette = { ...theme, fg: (role: string, text: string) => role === "accent" ? `${purple}${text}\x1b[39m` : text };
	const editor = createNoteEditor(runtime(), palette);
	editor.focused = true;
	editor.setText("Neutral text");
	const rows: string[] = [];
	renderOptionalNote(rows, 45, palette, editor, true, 10);
	assert.match(rows[1], /\x1b\[38;2;150;110;230m╭/);
	assert.match(rows[2], /\x1b\[38;2;150;110;230m│/);
	assert.ok(!rows[2].includes(`${purple}Neutral text`), "input text stays neutral");
	assertCursor(rows, 45);
});

test("inline note cursor remains visible at narrow widths and wide grapheme boundaries", () => {
	const tui = runtime(24);
	const editor = createNoteEditor(tui, theme);
	editor.focused = true;
	for (const text of ["", "abc", "é 👩‍💻 中文", "first\nsecond\nthird", "long ".repeat(30)]) {
		editor.setText(text);
		for (const width of [1, 2, 4, 8, 12, 20, 32, 80]) {
			const lines: string[] = [];
			renderOptionalNote(lines, width, theme, editor, true, 9);
			assertCursor(lines, width);
		}
	}
});

for (const mode of ["text", "single-select", "multi-select"] as const) {
	test(`standalone ${mode}: note cursor, clear scope, hints, multiline, and submit`, async () => {
		const h = standalone(mode);
		stage(h.component, mode);
		h.component.handleInput(keys.tab);
		assert.match(sanitizeDisplayText(h.component.render(80).join("\n")), /› \+ Note/);
		h.component.handleInput(keys.enter);
		assertCursor(h.component.render(80), 80);
		h.component.handleInput("Remove this note");
		h.component.handleInput(keys.clear);
		assert.equal(h.result, undefined, "Ctrl+C discards the note, not the question");
		assert.ok(!sanitizeDisplayText(h.component.render(80).join("\n")).includes("Remove this note"));
		h.component.handleInput(keys.tab);
		h.component.handleInput(keys.enter);
		h.component.handleInput("Keep this note");
		assert.equal(h.result, undefined);
		h.component.handleInput(keys.newline);
		h.component.handleInput("第二行");
		const hints = sanitizeDisplayText(h.component.render(32).join("\n"));
		for (const hint of ["Save note", "Discard note"]) assert.ok(hints.includes(hint), hint);
		assertCursor(h.component.render(32), 32);
		h.component.handleInput(keys.backTab);
		h.component.handleInput(keys.tab);
		h.component.handleInput(keys.enter);
		assertCursor(h.component.render(80), 80);
		h.component.handleInput(keys.submit);
		const result: any = await h.pending;
		assert.equal(result.note, "Keep this note\n第二行");
		if (mode === "text") assert.equal(result.answer, "Primary answer");
		else if (mode === "single-select") assert.equal(result.answer.value, "keep");
		else assert.deepEqual(result.answer.map((a: any) => a.value), ["keep"]);
	});

	test(`batch ${mode}: note control saves edits without corrupting answers`, () => {
		const h = batch(mode);
		stage(h.component, mode);
		const previous = mode === "text" ? "\x1b[1;5D" : keys.left;
		const next = mode === "text" ? "\x1b[1;5C" : keys.right;
		if (mode === "text") { h.component.handleInput(keys.enter); h.component.handleInput(previous); }
		h.component.handleInput(keys.tab);
		assert.match(sanitizeDisplayText(h.component.render(80).join("\n")), /› \+ Note/);
		h.component.handleInput(keys.enter);
		h.component.handleInput("First note");
		assertCursor(h.component.render(80), 80);
		h.component.handleInput(keys.enhancedClear);
		h.component.handleInput(keys.tab);
		h.component.handleInput(keys.enter);
		h.component.handleInput("Retained first note");
		h.component.handleInput(keys.enter);
		h.component.handleInput(next);
		h.component.handleInput("Second answer");
		h.component.handleInput(keys.tab);
		h.component.handleInput(keys.enter);
		h.component.handleInput("Second note");
		h.component.handleInput(keys.clear);
		h.component.handleInput(keys.enter);
		assert.equal(h.result, undefined, "Review requires explicit submission");
		assert.equal(cursorCount(h.component.render(80)), 0);
		h.component.handleInput(keys.enter);
		const submitted: any = h.result;
		assert.ok(Array.isArray(submitted));
		assert.equal(submitted[0].note, "Retained first note");
		assert.equal(submitted[1].note, "");
		assert.equal(submitted[1].answer, "Second answer");
		if (mode === "text") assert.equal(submitted[0].answer, "Primary answer");
		else if (mode === "single-select") assert.equal(submitted[0].answer.value, "keep");
		else assert.deepEqual(submitted[0].answer.map((a: any) => a.value), ["keep"]);
	});

	test(`${mode}: focused note survives resize, short terminals, blur, and clarification`, () => {
		for (const make of [standalone, batch]) {
			const h = make(mode, 24);
			stage(h.component, mode);
			h.component.handleInput(keys.tab);
			h.component.handleInput(keys.enter);
			h.component.handleInput("Line one");
			h.component.handleInput(keys.newline);
			h.component.handleInput("中文 👩‍💻 end");
			for (const rows of [24, 16, 12]) {
				h.tui.terminal.rows = rows;
				for (const width of [12, 24, 40, 80, 120]) assertCursor(h.component.render(width), width, rows);
			}
			h.tui.terminal.rows = 40;
			h.component.focused = false;
			assert.equal(cursorCount(h.component.render(80)), 0);
			h.component.focused = true;
			assertCursor(h.component.render(80), 80);
			h.component.handleInput(keys.ask);
			assertCursor(h.component.render(80), 80);
			h.component.handleInput(keys.escape);
			assertCursor(h.component.render(80), 80);
		}
	});
}

for (const mode of ["text", "single-select", "multi-select"] as const) {
	test(`${mode}: large pasted notes return content, not editor preview markers`, async () => {
		const note = "A long pasted note. ".repeat(80);
		const paste = `\x1b[200~${note}\x1b[201~`;
		const one = standalone(mode);
		stage(one.component, mode);
		one.component.handleInput(keys.tab);
		one.component.handleInput(keys.enter);
		one.component.handleInput(paste);
		one.component.handleInput(keys.submit);
		assert.equal((await one.pending as any).note, note);
		const many = batch(mode);
		stage(many.component, mode);
		if (mode === "text") { many.component.handleInput(keys.enter); many.component.handleInput("\x1b[1;5D"); }
		many.component.handleInput(keys.tab);
		many.component.handleInput(keys.enter);
		many.component.handleInput(paste);
		many.component.handleInput(keys.submit);
		many.component.handleInput(keys.enter);
		assert.equal(many.result[0].note, note);
	});
}

for (const Renderer of [TuiMainScreen, TuiAltScreen]) {
	test(`${Renderer.name}: actual Pi renderer routes note input and keeps the visual cursor`, () => {
		let input = (_data: string) => {};
		const writes: string[] = [];
		const terminal: any = {
			columns: 80, rows: 24, kittyProtocolActive: false,
			start(onInput: (data: string) => void) { input = onInput; },
			stop() {}, async drainInput() {},
			write(data: string) { writes.push(data); },
			moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
		};
		const tui = new Renderer(terminal, false);
		const component = new TabbedQuestions([
			{ question: "Choose one", mode: "single-select", options: [option] },
		], tui, theme, getKeybindings(), () => {});
		tui.addChild(component);
		tui.setFocus(component);
		try {
			tui.start();
			input(keys.enter);
			input(keys.tab);
			input(keys.enter);
			input("A visible note");
			tui.renderNow(true);
			assert.match(writes.join(""), /\x1b\[7m \x1b\[(?:0|27)m/, "cursor remains visible with hardware cursor disabled");
			assert.ok(!writes.join("").includes(CURSOR_MARKER), "Pi consumes the positioning marker before terminal output");
			assert.ok(!writes.join("").includes("_pi:fc"), "Pi consumes the fake cursor markers too");
			// Pi 1.2 owns suppression of the software cursor when hardware is on.
			if (component.render(80).join("").includes("\x1b_pi:fc\x07")) {
				tui.setShowHardwareCursor(true);
				writes.length = 0;
				tui.renderNow(true);
				assert.ok(!writes.join("").includes("\x1b[7m"), "hardware mode does not draw a second cursor");
				assert.ok(!writes.join("").includes("_pi:"), "no cursor protocol leaks into terminal output");
				tui.setShowHardwareCursor(false);
			}
			input(keys.clear);
			input(keys.tab);
			input(keys.enter);
			tui.renderNow(true);
			const lines = component.render(80);
			assertCursor(lines, 80, 24);
			assert.ok(!sanitizeDisplayText(lines.join("\n")).includes("A visible note"));
			assert.ok(lines.some((line) => line.includes("\x1b[34mKeep the answer")), "choice theme styles survive the complete render path");
		} finally {
			tui.stop();
		}
	});
}

test("aborting a standalone dialog resolves once and removes its listener", async () => {
	const controller = new AbortController();
	const tui = runtime();
	let completions = 0;
	const ctx: any = { ui: { custom(factory: any) { return new Promise((resolve) => { factory(tui, theme, getKeybindings(), (value: any) => { completions++; resolve(value); }); }); } } };
	const pending = askText(ctx, "Question?", undefined, controller.signal);
	controller.abort();
	assert.equal(await pending, null);
	assert.equal(completions, 1);
});
