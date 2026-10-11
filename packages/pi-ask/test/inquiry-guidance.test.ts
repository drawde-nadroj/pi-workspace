import assert from "node:assert/strict";
import { test } from "node:test";
import registerQuestions from "../extensions/questions.ts";
import {
  buildBatchClarificationResult,
  buildClarificationResult,
  buildRegenerateResult,
  type QuestionDef,
} from "../extensions/ask-user-question/domain.ts";

test("both tools require decision-sensitive inquiry before asking", () => {
  const tools = new Map<string, any>();
  registerQuestions({ registerTool(tool: any) { tools.set(tool.name, tool); } } as any);
  const single = tools.get("ask_user_question");
  const batch = tools.get("ask_questions");
  assert.match(single.promptGuidelines.join(" "), /provisional judgment/);
  assert.match(single.promptGuidelines.join(" "), /no question is a good outcome/i);
  assert.match(batch.promptGuidelines.join(" "), /independently consequential/);
  assert.match(batch.promptGuidelines.join(" "), /No questions is a valid outcome/);
  assert.doesNotMatch(single.promptGuidelines.join(" "), /immediately call ask_user_question again/);
  assert.doesNotMatch(batch.promptGuidelines.join(" "), /immediately call ask_questions again/);
});

test("revision and clarification allow questions to become unnecessary without losing resolved context", () => {
  const questions: QuestionDef[] = [
    { question: "Which direction?", mode: "text", options: [] },
    { question: "Which format?", mode: "text", options: [] },
  ];
  const answers = [{ questionIndex: 0, answer: "Try a prototype", note: "Keep it reversible" }];
  const revision = buildRegenerateResult(questions, answers);
  assert.match(revision.content[0].text, /drop it if resolved or no longer consequential/);
  assert.match(revision.content[0].text, /if none remain, explain why and proceed/);
  assert.match(revision.content[0].text, /Try a prototype/);
  assert.match(revision.content[0].text, /Keep it reversible/);
  assert.deepEqual(revision.details.answers, answers);
  assert.equal(revision.details.unansweredQuestions?.length, 1);

  const single = buildClarificationResult("Which direction?", undefined, "text", [], "Why?");
  assert.match(single.content[0].text, /re-ask it only if needed/);
  assert.equal(single.details.status, "clarification_requested");

  const batch = buildBatchClarificationResult(questions, answers, 1, "Why?");
  assert.match(batch.content[0].text, /Re-ask only the essential revised questions/);
  assert.match(batch.content[0].text, /Try a prototype/);
  assert.equal(batch.details.status, "clarification_requested");
});
