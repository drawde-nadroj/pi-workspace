import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { questionCall, questionResult } from "../extensions/ask-user-question/question-history.ts";
import { addActionHints, sanitizeDisplayText } from "../extensions/ask-user-question/tui-primitives.ts";

const roles: Array<[string, string]> = [];
const theme = { fg(role: string, text: string) { roles.push([role, text]); return text; }, bold(text: string) { return text; } };
const args = { question: "Which version?", options: [{ label: "Editable copy", description: "Keep the original.", suggestion: { kind: "fit", basis: "You asked to preserve the source.", caveat: "Requires room for a second copy." } }] };
const note = "My exact note...\nKeep this second line.";
const result = { details: { question: args.question, mode: "single-select", status: "answered", answers: [{ type: "option", label: "Editable copy", value: "copy" }], note } };
const plain = (component: any, width = 90) => component.render(width).map(sanitizeDisplayText).join("\n");

test("call slot stays empty before, during, and after a question result", () => {
  const context = { args, state: {} };
  const call = questionCall(args, theme, context);
  assert.deepEqual(call.render(90), []);
  questionResult(result, {}, theme, context).render(90);
  assert.deepEqual(call.render(90), []);
  assert.deepEqual(questionCall(args, theme, undefined).render(90), []);
});

test("completed choices read as question then accented choice, with verbatim note", () => {
  roles.length = 0;
  const view = plain(questionResult(result, {}, theme, { args }));
  assert.match(view, /Which version\?/);
  assert.doesNotMatch(view, /Selected answer|Your answer|│ Question\s/);
  assert.match(view, /✓ Editable copy/);
  assert.ok(view.indexOf("Which version?") < view.indexOf("✓ Editable copy"));
  assert.match(view, /Your note/);
  assert.ok(view.indexOf("Your note") < view.indexOf("My exact note..."));
  assert.ok(roles.some(([role, text]) => role === "text" && text === args.question));
  assert.ok(roles.some(([role, text]) => role === "accent" && text === "Editable copy"));
  for (const line of note.split("\n")) assert.ok(roles.some(([role, text]) => role === "text" && text === line));
  assert.equal(result.details.note, note);
  assert.doesNotMatch(view, /Original choices|Keep the original/);
  const expanded = plain(questionResult(result, { expanded: true }, theme, { args }));
  assert.match(expanded, /Original choices/);
  assert.match(expanded, /1\. Editable copy/);
  assert.match(expanded, /Assistant's take · possible fit/);
  assert.match(expanded, /Why: You asked to preserve the source/);
  assert.match(expanded, /Caveat: Requires room for a second copy/);
  assert.doesNotMatch(expanded, /Recommended/);
});

test("free-form and custom batch answers remain verbatim without a choice marker", () => {
  for (const answer of ["Written answer", { type: "other", label: "Written answer", value: "Written answer" }]) {
    roles.length = 0;
    const batch = { details: { questions: [{ question: "Explain?", mode: typeof answer === "string" ? "text" : "single-select" }], answers: [{ questionIndex: 0, answer, note }] } };
    const view = plain(questionResult(batch, {}, theme, {}));
    assert.match(view, /Explain\?[\s\S]*Written answer/);
    assert.doesNotMatch(view, /Selected answer|Your answer|✓/);
    assert.ok(roles.some(([role, text]) => role === "accent" && text === "Written answer"));
    assert.match(view, /Your note/);
  }
});

test("non-answer states and clarification stay distinct from user answers", () => {
  for (const status of ["cancelled", "skipped", "unavailable", "clarification_requested"]) {
    roles.length = 0;
    const view = plain(questionResult({ details: { question: "Why?", status, clarification: status === "clarification_requested" ? "Please explain." : undefined } }, {}, theme, {}));
    assert.ok(roles.some(([role, text]) => role === "text" && text === "Why?"));
    if (status === "cancelled") assert.ok(roles.some(([role, text]) => role === "muted" && text === "Cancelled"));
    assert.doesNotMatch(view, /Status|Selected answer|✓/);
    if (status === "clarification_requested") assert.match(view, /Your question/);
    if (status === "skipped") assert.match(view, /Skipped/);
  }
  const view = plain(questionResult({ details: { questions: [{ question: "Skip?" }], answers: [], skippedQuestionIndexes: [0], unansweredNotes: [{ questionIndex: 0, note }] } }, {}, theme, {}));
  assert.match(view, /Skipped/);
  assert.match(view, /Your note/);
});

test("history wraps narrow widths and sanitizes untrusted terminal commands", () => {
  const component = questionResult({ details: { ...result.details, note: "界面 é\n\x1b[31mNot a color command\x1b[0m" } }, {}, theme, { args });
  for (const width of [1, 2, 6, 9, 10, 20, 40, 100]) {
    const lines = component.render(width);
    assert.ok(lines.every((line: string) => visibleWidth(line) <= width));
    assert.ok(lines.every((line: string) => !line.includes("\x1b[31m")), "untrusted foreground escape is removed");
  }
});

test("keyboard controls use a subdued footer role", () => {
  roles.length = 0;
  const lines: string[] = [];
  addActionHints(lines, 80, theme, ["Enter Select", "Esc Cancel"]);
  assert.ok(roles.length > 0 && roles.every(([role]) => role === "dim"));
});
