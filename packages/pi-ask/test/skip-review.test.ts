import assert from "node:assert/strict";
import { test } from "node:test";
import { CURSOR_MARKER, getKeybindings, TuiAltScreen, TuiMainScreen, visibleWidth } from "@earendil-works/pi-tui";
import registerQuestions from "../extensions/questions.ts";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";
import { buildBatchResult, type QuestionDef, type TabAnswer } from "../extensions/ask-user-question/domain.ts";
import { sanitizeDisplayText } from "../extensions/ask-user-question/tui-primitives.ts";

const keys = { skip: "\x13", enhancedSkip: "\x1b[115;5u", review: "\x1b[13;5u", altReview: "\x1b\r", enhancedAltReview: "\x1b[13;3u", enter: "\r", tab: "\t", left: "\x1b[1;5D", right: "\x1b[1;5C", escape: "\x1b", clear: "\x03", ask: "\x1b[47;5u", revise: "\x12" };
const theme = { fg: (_: string, text: string) => text, bg: (_: string, text: string) => text, bold: (text: string) => text };
const option = { label: "Keep this choice", value: "keep" };
const modes = ["text", "single-select", "multi-select"] as const;
function question(mode: QuestionDef["mode"], index: number): QuestionDef {
	return { question: `Question ${index + 1}?`, label: `Q${index + 1}`, mode, options: mode === "text" ? [] : [option] };
}
function harness(mode: QuestionDef["mode"] = "text", count = 2) {
	const questions = Array.from({ length: count }, (_, index) => question(mode, index));
	const tui = { terminal: { rows: 40 }, requestRender() {} };
	let result: any;
	let completions = 0;
	const component = new TabbedQuestions(questions, tui, theme, getKeybindings(), (value) => { result = value; completions++; });
	component.focused = true;
	return { component, questions, tui, get result() { return result; }, get completions() { return completions; } };
}
function state(h: ReturnType<typeof harness>): any { return h.component; }
function submitted(value: unknown): TabAnswer[] { assert.ok(Array.isArray(value), "submission returns an answer array"); return value; }
function view(h: ReturnType<typeof harness>, width = 100): string { return sanitizeDisplayText(h.component.render(width).join("\n")); }
function stage(h: ReturnType<typeof harness>, mode: QuestionDef["mode"]) {
	h.component.handleInput(mode === "text" ? "Retained answer draft" : mode === "single-select" ? keys.enter : " ");
}
function note(h: ReturnType<typeof harness>, text = "Keep this note") {
	h.component.handleInput(keys.tab); // Focus the visible + Add note action.
	h.component.handleInput(keys.enter); // Activate it.
	h.component.handleInput(text);
}

for (const mode of modes) {
	test(`${mode}: explicit skip advances, survives navigation, and permits normal Review`, () => {
		const h = harness(mode);
		stage(h, mode);
		note(h);
		h.component.handleInput(keys.skip);
		assert.equal(state(h).activeTab, 1);
		assert.equal(state(h).tabs[0].skipped, true);
		assert.equal(state(h).tabs[0].note, "Keep this note");
		assert.match(view(h), /Question 2\?/);
		h.component.handleInput(keys.left);
		assert.equal(state(h).tabs[0].skipped, true, "browsing does not restore a skipped question");
		assert.match(view(h), /Skipped · answer and note not sent/);
		assert.match(view(h), /Ctrl\+S Restore/);
		assert.match(view(h), /↵ Restore/);
		assert.ok(!view(h).includes("Ctrl+C Clear"), "read-only drafts must not advertise a clear action");
		h.component.handleInput(keys.right);
		if (mode === "text") h.component.handleInput("Accepted second answer");
		else stage(h, mode);
		h.component.handleInput(mode === "multi-select" ? keys.review : keys.enter);
		assert.equal(state(h).reviewing, true, "the completed choices and explicit skip can be reviewed");
		assert.equal(h.result, undefined, "opening Review must not submit");
		assert.match(view(h), /Review 1 answer · 1 skipped/);
		assert.match(view(h), /Skipped — answer and note won't be sent/);
		h.component.handleInput(keys.enter);
		const answers = submitted(h.result);
		assert.equal(answers[0].answer, null, "retained drafts must not leak into submitted answers");
		assert.equal(answers[0].note, "", "a skipped note is kept in the form but not sent");
		assert.notEqual(answers[1].answer, null);
		const result = buildBatchResult(h.questions, answers);
		assert.deepEqual(result.details.skippedQuestionIndexes, [0]);
		assert.match(result.content[0].text, /skipped by user/);
		assert.ok(!result.content[0].text.includes("Retained answer draft"));
	});

	test(`${mode}: every question can be explicitly skipped and submitted after Review`, () => {
		for (const skip of [keys.skip, keys.enhancedSkip]) {
			const h = harness(mode, 3);
			for (let index = 0; index < 3; index++) {
				assert.equal(state(h).activeTab, index);
				h.component.handleInput(skip);
			}
			assert.equal(state(h).reviewing, true);
			assert.equal(h.result, undefined);
			assert.match(view(h), /Review 0 answers · 3 skipped/);
			h.component.handleInput(keys.enter);
			assert.equal(h.completions, 1);
			const answers = submitted(h.result);
			assert.equal(answers.length, 3);
			assert.ok(answers.every((entry) => entry.answer === null));
			const result = buildBatchResult(h.questions, answers);
			assert.deepEqual(result.details.skippedQuestionIndexes, [0, 1, 2]);
			assert.match(result.content[0].text, /0 answers and skipped 3 questions/);
		}
	});

	test(`${mode}: restoration is explicit and kept answer drafts remain unchanged`, () => {
		const h = harness(mode);
		stage(h, mode);
		const original = structuredClone(state(h).tabs[0].answer);
		h.component.handleInput(keys.skip);
		h.component.handleInput(keys.left);
		for (const input of ["accidental typing", "1", " ", keys.clear]) h.component.handleInput(input);
		assert.equal(state(h).tabs[0].skipped, true);
		assert.deepEqual(state(h).tabs[0].answer, original);
		assert.deepEqual(state(h).snapshot()[0].answer, null);
		h.component.handleInput(keys.enter);
		assert.equal(state(h).tabs[0].skipped, false);
		assert.equal(state(h).activeTab, 0, "Enter Restore must not also advance");
		assert.deepEqual(state(h).tabs[0].answer, original);
		h.component.handleInput(keys.skip);
		h.component.handleInput(keys.left);
		h.component.handleInput(keys.enhancedSkip);
		assert.equal(state(h).tabs[0].skipped, false);
		assert.deepEqual(state(h).tabs[0].answer, original);
	});

	test(`${mode}: skipped notes stay editable without silently restoring an answer`, () => {
		const h = harness(mode);
		stage(h, mode);
		h.component.handleInput(keys.skip);
		h.component.handleInput(keys.left);
		note(h, "Note on a skipped question");
		assert.equal(state(h).tabs[0].skipped, true);
		assert.equal(h.component.render(100).join("\n").split(CURSOR_MARKER).length - 1, 1);
		h.component.handleInput(keys.tab);
		assert.equal(state(h).tabs[0].skipped, true);
		assert.ok(!h.component.render(100).join("\n").includes(CURSOR_MARKER), "a read-only answer must not show an editable cursor");
		h.component.focused = false;
		h.component.focused = true;
		assert.ok(!h.component.render(100).join("\n").includes(CURSOR_MARKER));
		h.component.handleInput(keys.right); // Tab already returned directly to the answer.
		h.component.handleInput(keys.skip);
		assert.equal(state(h).reviewing, true);
		h.component.handleInput(keys.enter);
		assert.equal(h.result[0].answer, null);
		assert.equal(h.result[0].note, "", "skipping must not send the note");
	});
}

for (const review of [keys.review, keys.altReview, keys.enhancedAltReview]) {
	test(`partial Review accepts ${JSON.stringify(review)} and preserves existing skip-rest behavior`, () => {
		const h = harness();
		h.component.handleInput("Answered first question");
		h.component.handleInput(keys.enter); // Commit the answer; merely typing is a draft.
		note(h, "Unanswered question note");
		h.component.handleInput(review);
		assert.equal(state(h).reviewing, true);
		assert.equal(h.result, undefined);
		assert.match(view(h), /1 answer · 0 skipped · 1 unanswered/);
		assert.match(view(h), /Unanswered/);
		h.component.handleInput(keys.escape);
		assert.equal(state(h).reviewing, false);
		assert.equal(state(h).activeTab, 1);
		h.component.handleInput(review);
		h.component.handleInput(keys.enter);
		const answers = submitted(h.result);
		assert.equal(answers[0].answer, "Answered first question");
		assert.equal(answers[1].note, "", "review submission does not send a skipped note");
		assert.deepEqual(buildBatchResult(h.questions, answers).details.skippedQuestionIndexes, [1]);
	});
}

test("empty or partly skipped batches cannot accidentally submit every pending question", () => {
	const h = harness("text", 3);
	h.component.handleInput(keys.altReview);
	assert.equal(state(h).reviewing, false);
	assert.match(view(h), /explicitly skip every question first/);
	h.component.handleInput(keys.skip);
	h.component.handleInput(keys.altReview);
	assert.equal(state(h).reviewing, false);
	assert.equal(h.result, undefined);
	h.component.handleInput(keys.right);
	h.component.handleInput(keys.skip);
	assert.equal(state(h).reviewing, false, "ordinary Review must identify the pending middle question");
	assert.equal(state(h).activeTab, 1);
	assert.match(view(h), /Answer or skip question 2 before Review/);
	h.component.handleInput(keys.skip);
	assert.equal(state(h).reviewing, true, "skipping the last pending question opens Review, even out of order");
	assert.equal(h.result, undefined);
});

for (const mode of ["single-select", "multi-select"] as const) {
	test(`${mode}: skipping from a custom editor retains the draft for restore`, () => {
		const h = harness(mode);
		h.component.handleInput("2");
		assert.equal(state(h).editMode, true);
		const draft = "Large custom context. ".repeat(60);
		h.component.handleInput(`\x1b[200~${draft}\x1b[201~`);
		h.component.handleInput(keys.skip);
		assert.equal(state(h).tabs[0].skipped, true);
		h.component.handleInput(keys.left);
		assert.equal(state(h).snapshot()[0].answer, null);
		h.component.handleInput(keys.skip);
		assert.equal(state(h).tabs[0].skipped, false);
		assert.equal(state(h).tabs[0].otherText, draft, "compressed paste previews must not replace retained custom drafts");
		h.component.handleInput(keys.altReview);
		assert.equal(state(h).reviewing, true);
	});
}

test("clarification and revision do not treat retained skipped drafts as resolved answers", () => {
	for (const action of [keys.ask, keys.revise]) {
		const h = harness("text", 3);
		h.component.handleInput("Do not submit this skipped draft");
		h.component.handleInput(keys.skip);
		h.component.handleInput("Committed answer");
		h.component.handleInput(keys.enter);
		h.component.handleInput(action);
		if (action === keys.ask) {
			h.component.handleInput("Explain this question.");
			h.component.handleInput(keys.enter);
		}
		assert.equal(h.result.answers[0].answer, null);
		assert.equal(h.result.answers[1].answer, "Committed answer");
	}
	const h = harness();
	h.component.handleInput("Draft");
	h.component.handleInput(keys.skip);
	h.component.handleInput(keys.left);
	h.component.handleInput(keys.ask);
	h.component.handleInput(keys.escape);
	assert.equal(state(h).tabs[0].skipped, true);
	assert.ok(!h.component.render(100).join("\n").includes(CURSOR_MARKER));
});

test("all-skipped Review supports Back, restore, and a new submission without closing early", () => {
	const h = harness();
	h.component.handleInput(keys.skip);
	h.component.handleInput(keys.skip);
	h.component.handleInput(keys.escape);
	assert.equal(h.result, undefined);
	assert.equal(state(h).activeTab, 0);
	h.component.handleInput(keys.enter);
	h.component.handleInput("Answer after restoring");
	h.component.handleInput(keys.enter); // Commit the draft and open Review.
	assert.match(view(h), /1 answer · 1 skipped/);
	h.component.handleInput(keys.enter);
	const answers = submitted(h.result);
	assert.equal(answers[0].answer, "Answer after restoring");
	assert.equal(answers[1].answer, null);
});

test("Skip and Review hints fit widths and skipped progress survives resize", () => {
	const h = harness();
	assert.match(view(h), /Ctrl\+S Skip/);
	assert.doesNotMatch(view(h), /Review/, "review is not offered before any answer or explicit skip");
	h.component.handleInput(keys.skip);
	h.component.handleInput(keys.left);
	for (const width of [1, 2, 6, 12, 20, 40, 80, 120]) {
		for (const rows of [8, 16, 24, 40]) {
			h.tui.terminal.rows = rows;
			const lines = h.component.render(width);
			assert.ok(lines.length <= rows);
			assert.ok(lines.every((line) => visibleWidth(line) <= width));
		}
	}
	h.tui.terminal.rows = 40;
	assert.match(view(h), /Skipped · answer and note not sent/);
	assert.match(view(h), /Ctrl\+S Restore/);
});

for (const Renderer of [TuiMainScreen, TuiAltScreen]) {
	test(`${Renderer.name}: actual Pi renderer routes skip and Review input`, () => {
		let input: ((data: string) => void) | undefined;
		const terminal: any = { columns: 100, rows: 40, write() {}, start(callback: (data: string) => void) { input = callback; }, stop() {}, hideCursor() {}, showCursor() {}, clearScreen() {}, clearLine() {}, clearFromCursor() {}, moveBy() {}, setTitle() {} };
		const tui: any = new Renderer(terminal, false);
		let result: any;
		const component = new TabbedQuestions([question("text", 0), question("text", 1)], tui, theme, getKeybindings(), (value) => { result = value; });
		tui.addChild(component);
		tui.setFocus(component);
		tui.start();
		try {
			input!(keys.skip);
			input!(keys.enhancedSkip);
			tui.doRender();
			assert.equal((component as any).reviewing, true);
			assert.equal(result, undefined);
			input!(keys.enter);
			assert.ok(submitted(result).every((entry) => entry.answer === null));
		} finally { tui.stop(); }
	});

	test(`${Renderer.name}: all-answered Review accepts a number key to edit before Submit`, () => {
		let input: ((data: string) => void) | undefined;
		const terminal: any = { columns: 100, rows: 40, write() {}, start(callback: (data: string) => void) { input = callback; }, stop() {}, hideCursor() {}, showCursor() {}, clearScreen() {}, clearLine() {}, clearFromCursor() {}, moveBy() {}, setTitle() {} };
		const tui: any = new Renderer(terminal, false);
		let result: any;
		const component = new TabbedQuestions([question("text", 0), question("text", 1)], tui, theme, getKeybindings(), (value) => { result = value; });
		tui.addChild(component);
		tui.setFocus(component);
		tui.start();
		try {
			input!("First answer"); input!(keys.enter);
			input!("Second answer"); input!(keys.enter);
			assert.equal((component as any).reviewing, true);
			assert.equal(result, undefined);
			input!("1");
			assert.equal((component as any).reviewing, false);
			assert.equal((component as any).activeTab, 0);
			input!(keys.clear); input!("Revised first answer"); input!(keys.enter);
			assert.equal((component as any).reviewing, true);
			assert.equal(result, undefined);
		} finally { tui.stop(); }
	});
}

test("registered ask_questions returns explicit all-skipped metadata and labels", async () => {
	const tools = new Map<string, any>();
	const events: any[] = [];
	registerQuestions({ registerTool(tool: any) { tools.set(tool.name, tool); }, events: { emit(name: string, data: any) { events.push([name, data]); } } } as any);
	let open!: (component: TabbedQuestions) => void;
	const opened = new Promise<TabbedQuestions>((resolve) => { open = resolve; });
	const ctx: any = { hasUI: true, mode: "tui", ui: { custom(factory: any) {
		return new Promise((resolve) => {
			const component = factory({ terminal: { rows: 40 }, requestRender() {} }, theme, getKeybindings(), resolve);
			component.focused = true;
			open(component);
		});
	} } };
	const tool = tools.get("ask_questions");
	const pending = tool.execute("skip-test", { questions: [{ question: "First?" }, { question: "Second?" }] }, undefined, undefined, ctx);
	const component = await opened;
	component.handleInput(keys.skip);
	component.handleInput(keys.skip);
	component.handleInput(keys.enter);
	const result = await pending;
	assert.equal(result.details.status, "answered");
	assert.deepEqual(result.details.skippedQuestionIndexes, [0, 1]);
	assert.ok(result.details.answers.every((entry: any) => entry.answer === null));
	assert.match(result.content[0].text, /0 answers and skipped 2 questions/);
	const history = tool.renderResult(result, {}, theme).render(100).join("\n");
	assert.match(history, /First\?[\s\S]*Skipped[\s\S]*Second\?[\s\S]*Skipped/);
	assert.doesNotMatch(history, /Status/);
	assert.equal(events.at(-1)[1].active, false, "the UI-blocked state is released after submission");
});
