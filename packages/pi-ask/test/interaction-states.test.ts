import assert from "node:assert/strict";
import { test } from "node:test";
import { CURSOR_MARKER, getKeybindings } from "@earendil-works/pi-tui";
import registerQuestions from "../extensions/questions.ts";
import { askText } from "../extensions/ask-user-question/standalone-ui.ts";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";
import { buildBatchResult, type QuestionDef, type TabAnswer } from "../extensions/ask-user-question/domain.ts";
import { frameQuestion, questionViewport } from "../extensions/ask-user-question/question-surface.ts";
import { sanitizeDisplayText } from "../extensions/ask-user-question/tui-primitives.ts";

const theme = { fg(_role: string, text: string) { return text; }, bg(_role: string, text: string) { return text; }, bold(text: string) { return text; } };
const keys = { enter: "\r", tab: "\t", skip: "\x13", review: "\x1b[13;5u", next: "\x1b[1;5C" };
function form(count = 2) {
  return formWithQuestions(Array.from({ length: count }, (_, i) => ({ question: `Question ${i + 1}?`, label: `Topic ${i + 1}`, mode: "text", options: [] })));
}
function formWithQuestions(questions: QuestionDef[]) {
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  let result: any;
  const component = new TabbedQuestions(questions, questionViewport(tui), theme, getKeybindings(), value => { result = value; });
  const shell = frameQuestion(component, theme, tui);
  shell.focused = true;
  return { component, shell, questions, get result() { return result; }, view: () => sanitizeDisplayText(shell.render(100).join("\n")) };
}

test("frame shows 1 of N at the bottom left instead of a question-summary bar", () => {
  const h = form(3);
  let lines = h.view().split("\n");
  assert.match(lines[0], /^╭ Questions ─+╮$/);
  assert.match(lines.at(-1)!, /^╰ 1 of 3 ─+╯$/);
  assert.doesNotMatch(h.view(), /○ Topic|✓ Topic/);
  h.shell.handleInput(keys.skip);
  lines = h.view().split("\n");
  assert.match(lines.at(-1)!, /^╰ 2 of 3 ─+╯$/);
  h.shell.handleInput(keys.skip);
  h.shell.handleInput(keys.skip);
  assert.match(h.view().split("\n").at(-1)!, /^╰ Review /);
  assert.match(h.view(), /Review 0 answers · 3 skipped/);
});

test("Regenerate is visible on an eligible question and in partial Review", () => {
  const h = form();
  h.shell.handleInput("First answer");
  h.shell.handleInput(keys.enter);
  assert.match(h.view(), /Ctrl\+R Regenerate unanswered/);
  assert.ok(h.component.getMoreActions().some(action => action.label === "Regenerate unanswered questions"));
  h.shell.handleInput(keys.review);
  assert.match(h.view(), /Review 1 answer · 0 skipped · 1 unanswered/);
  assert.match(h.view(), /Ctrl\+R Regenerate unanswered/);
  assert.ok(h.component.getMoreActions().some(action => action.label === "Regenerate unanswered questions"));
  h.shell.handleInput("\x12");
  assert.equal(h.result.action, "regenerate");
  assert.equal(h.result.answers[0].answer, "First answer");
  assert.equal(h.result.answers[1].answer, null);
});

test("+ opens a choice note; discarded edits restore saved text; + in an answer stays literal", () => {
  const h = formWithQuestions([
    { question: "Choose?", mode: "single-select", options: [{ label: "One", value: "one" }] },
    { question: "Why?", mode: "text", options: [] },
  ]);
  h.shell.handleInput("+");
  h.shell.handleInput("Keep this");
  assert.equal(h.component["tabs"][0].note, "", "editing does not commit the note");
  h.shell.handleInput(keys.enter);
  assert.equal(h.component["tabs"][0].note, "Keep this");
  h.shell.handleInput("+");
  h.shell.handleInput("Unwanted");
  h.shell.handleInput("\x03");
  assert.equal(h.component["tabs"][0].note, "Keep this");
  assert.match(h.view(), /\+ Note: Keep this/);
  h.shell.handleInput(keys.enter); // select choice
  h.shell.handleInput(keys.enter); // continue
  h.shell.handleInput("a+b");
  assert.match(h.view(), /a\+b/);
  assert.equal(h.component["tabs"][1].note, "");
});

test("choice focus is text-only without shifting rows; note alignment and bottom divider remain", () => {
  const h = formWithQuestions([
    { question: "Which project?", mode: "single-select", options: [
      { label: "First option", value: "first", description: "First description" },
      { label: "Second option", value: "second", description: "Second description" },
    ] },
    { question: "Why?", mode: "text", options: [] },
  ]);
  const lines = h.view().split("\n");
  assert.match(lines[0], /^╭ Questions /);
  assert.doesNotMatch(lines[1], /─{5}/, "no duplicate rule immediately under the title");
  assert.ok(!lines.some(line => /╭─+╮|╰─+╯/.test(line)), "choices have no focus box");
  assert.match(lines.find(line => line.includes("First option"))!, /→ ○ 1\. First option/);
  h.shell.handleInput("\x1b[B");
  const moved = h.view().split("\n");
  assert.equal(moved.length, lines.length, "moving focus does not shift any rows");
  assert.equal(moved.findIndex(line => line.includes("+ Note")), lines.findIndex(line => line.includes("+ Note")));
  assert.match(moved.find(line => line.includes("Second option"))!, /→ ○ 2\. Second option/);
  const option = lines.find(line => line.includes("Second option"))!;
  const note = lines.find(line => line.includes("+ Note"))!;
  assert.equal(note.indexOf("+ Note"), option.indexOf("Second option"), "note aligns with option labels");
  assert.match(h.view(), /─{20}[\s\S]*↵ Select/, "the bottom action divider remains");
  h.shell.handleInput(keys.tab);
  h.shell.handleInput(keys.enter);
  const editing = h.view().split("\n");
  const noteRow = editing.findIndex(line => line.includes("+ Note"));
  assert.equal(editing[noteRow + 1].indexOf("╭"), editing[noteRow].indexOf("+ Note"), "note editor shares note indentation");
});

test("Review advertises only the available numbered edit shortcuts", () => {
  const h = form(3);
  for (let i = 0; i < 3; i++) h.shell.handleInput(keys.skip);
  assert.match(h.view(), /1–3 Edit/);
  assert.doesNotMatch(h.view(), /1–9 Edit/);
  h.shell.handleInput("3");
  assert.match(h.view(), /3 of 3/);
});

test("all-answered Review can reopen and revise any question before final Submit", () => {
  const h = form(3);
  for (let i = 0; i < 3; i++) {
    h.shell.handleInput(`Answer ${i + 1}`);
    h.shell.handleInput(keys.enter);
  }
  assert.match(h.view(), /Review 3 answers · 0 skipped/);
  assert.match(h.view(), /1–3 Edit/);
  assert.ok(h.component.getMoreActions().some(action => action.label.startsWith("Edit 2:")));
  h.shell.handleInput("2");
  assert.match(h.view(), /2 of 3/);
  h.shell.handleInput("\x03");
  h.shell.handleInput("Revised answer");
  h.shell.handleInput(keys.enter);
  assert.match(h.view(), /Answered — Revised answer/);
  assert.equal(h.result, undefined, "editing Review does not submit the form");
});

test("Review offers a numbered edit path for more than nine questions", () => {
  const h = form(12);
  for (let i = 0; i < 12; i++) h.shell.handleInput(keys.skip);
  assert.match(h.view(), /1–12 then ↵ Edit/);
  h.shell.handleInput("1");
  assert.match(h.view(), /↵ Edit 1/);
  h.shell.handleInput("2");
  assert.match(h.view(), /↵ Edit 12/);
  h.shell.handleInput(keys.enter);
  assert.match(h.view(), /12 of 12/);
});

test("Enter toggles multiple choices instead of silently doing nothing", () => {
  const h = formWithQuestions([
    { question: "Which fit?", label: "Selections", mode: "multi-select", options: [{ label: "First", value: "first" }, { label: "Second", value: "second" }] },
    { question: "Anything else?", label: "Context", mode: "text", options: [] },
  ]);
  h.shell.handleInput(keys.enter);
  assert.match(h.view(), /1 selected/);
  assert.match(h.view(), /↵\/Space Toggle/);
  h.shell.handleInput("\x1b[B");
  h.shell.handleInput(keys.enter);
  assert.match(h.view(), /2 selected/);
  assert.match(h.view(), /1 of 2/);
  h.shell.handleInput(keys.enter);
  assert.match(h.view(), /1 selected/);
  h.shell.handleInput(" ");
  assert.match(h.view(), /2 selected/);
  h.shell.handleInput(keys.review);
  assert.match(h.view(), /Answered — First · Second/);
});

test("note keeps one visible + control and Tab closes editing directly to the answer", () => {
  const h = form();
  assert.match(h.view(), /\+ Note/);
  h.shell.handleInput(keys.tab);
  assert.match(h.view(), /› \+ Note · Enter/);
  h.shell.handleInput(keys.enter);
  const noteLines = h.view().split("\n");
  const noteRow = noteLines.findIndex(line => line.includes("+ Note"));
  assert.ok(noteRow >= 0);
  assert.match(noteLines[noteRow + 1], /╭─+╮/, "the active note has the same outlined editor as the answer");
  assert.doesNotMatch(h.view(), /Note \(optional\)|Note · Edit/);
  h.shell.handleInput("Remember this");
  h.shell.handleInput(keys.tab);
  assert.match(h.view(), /\+ Note: Remember this/);
  h.shell.handleInput("Main answer");
  assert.equal(h.component["tabs"][0].note, "Remember this");
  assert.match(h.view(), /Draft · press Enter/);
});

test("+ Note is a keyboard action, not a Tab-only editor shortcut", () => {
  const h = form();
  assert.match(h.view(), /\+ Note/);
  h.shell.handleInput(keys.tab);
  assert.match(h.view(), /› \+ Note · Enter/);
  assert.doesNotMatch(h.view(), /Tab note/);
  assert.ok(!h.shell.render(100).join("").includes(CURSOR_MARKER), "the action is focused, not the editor");
  h.shell.handleInput(keys.enter);
  assert.ok(h.shell.render(100).join("").includes(CURSOR_MARKER), "Enter activates the note editor");
  h.shell.handleInput("Caveat");
  h.shell.handleInput(keys.enter);
  assert.match(h.view(), /\+ Note: Caveat/);
  h.shell.handleInput("An answer");
  h.shell.handleInput(keys.enter);
  h.shell.handleInput(keys.skip);
  h.shell.handleInput(keys.enter);
  assert.equal(h.result[0].note, "Caveat");
  assert.equal(h.result[0].answer, "An answer");
});

test("review distinguishes pending from skipped; explicit submit omits an unanswered note", () => {
  const h = form();
  h.shell.handleInput("Committed");
  h.shell.handleInput(keys.enter);
  h.shell.handleInput(keys.tab);
  h.shell.handleInput(keys.enter);
  h.shell.handleInput("Private draft note");
  h.shell.handleInput(keys.review);
  assert.match(h.view(), /Review 1 answer · 0 skipped · 1 unanswered/);
  assert.match(h.view(), /Unanswered/);
  assert.match(h.view(), /Submit without 1 unanswered/);
  assert.equal(h.result, undefined, "opening Review cannot submit");
  h.shell.handleInput(keys.enter);
  assert.ok(Array.isArray(h.result));
  const submitted: TabAnswer[] = h.result;
  assert.equal(submitted[1].skipped, true);
  assert.equal(submitted[1].note, "");
  assert.deepEqual(buildBatchResult(h.questions, submitted).details.skippedQuestionIndexes, [1]);
});

test("navigating away keeps free text as a draft until Continue commits it", () => {
  const h = form();
  h.shell.handleInput("Unsent draft");
  h.shell.handleInput(keys.next);
  assert.equal(h.component["tabs"][0].answer, null);
  h.shell.handleInput("Committed answer");
  h.shell.handleInput(keys.enter);
  h.shell.handleInput(keys.review);
  assert.match(h.view(), /Unanswered — draft not sent/);
  h.shell.handleInput(keys.enter);
  assert.equal(h.result[0].answer, null);
  assert.equal(h.result[0].skipped, true);
  assert.equal(h.result[1].answer, "Committed answer");
});

test("Escape warns before discarding a free-text draft", async () => {
  const batch = form();
  batch.shell.handleInput("Uncommitted draft");
  batch.shell.handleInput("\x1b");
  assert.equal(batch.result, undefined);
  assert.match(batch.view(), /Esc again to close/);
  batch.shell.handleInput("\x1b");
  assert.equal(batch.result, null);

  let component: any;
  const ctx: any = { cwd: process.cwd(), ui: { custom(factory: any) {
    return new Promise(resolve => {
      component = factory({ terminal: { rows: 40 }, requestRender() {} }, theme, getKeybindings(), resolve);
      component.focused = true;
    });
  } } };
  const pending = askText(ctx, "What matters?", undefined);
  component.handleInput("Uncommitted draft");
  component.handleInput("\x1b");
  assert.match(sanitizeDisplayText(component.render(100).join("\n")), /Esc again to close/);
  component.handleInput("\x1b");
  assert.equal(await pending, null);
});

test("single free-text Skip returns skipped rather than cancelled", async () => {
  const tools = new Map<string, any>();
  registerQuestions({ registerTool(tool: any) { tools.set(tool.name, tool); }, events: { emit() {} } } as any);
  let open!: (component: any) => void;
  const opened = new Promise<any>(resolve => { open = resolve; });
  const ctx: any = { hasUI: true, mode: "tui", cwd: process.cwd(), ui: { custom(factory: any) {
    return new Promise(resolve => {
      const component = factory({ terminal: { rows: 40 }, requestRender() {} }, theme, getKeybindings(), resolve);
      component.focused = true;
      open(component);
    });
  } } };
  const pending = tools.get("ask_user_question").execute("skip-single", { question: "What do you think?" }, undefined, undefined, ctx);
  const component = await opened;
  assert.match(sanitizeDisplayText(component.render(100).join("\n")), /Ctrl\+S Skip question/);
  component.handleInput(keys.skip);
  const result = await pending;
  assert.equal(result.details.status, "skipped");
  assert.deepEqual(result.details.answers, []);
  assert.match(result.content[0].text, /Continue without an answer/);
});
