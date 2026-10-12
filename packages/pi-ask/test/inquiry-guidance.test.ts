import assert from "node:assert/strict";
import { test } from "node:test";
import registerQuestions from "../extensions/questions.ts";
import {
  buildBatchClarificationResult,
  buildBatchResult,
  buildResult,
  skippedResult,
  buildClarificationResult,
  buildRegenerateResult,
  type QuestionDef,
} from "../extensions/ask-user-question/domain.ts";

test("both tools distinguish necessary decisions from invited exploration", () => {
  const tools = new Map<string, any>();
  registerQuestions({ registerTool(tool: any) { tools.set(tool.name, tool); } } as any);
  const single = tools.get("ask_user_question");
  const batch = tools.get("ask_questions");
  const singleGuidance = [single.description, single.promptSnippet, ...single.promptGuidelines].join(" ");
  const batchGuidance = [batch.description, batch.promptSnippet, ...batch.promptGuidelines].join(" ");
  assert.match(singleGuidance, /provisional judgment/);
  assert.match(singleGuidance, /materially change the next action/);
  assert.match(singleGuidance, /invites exploration or reflection/);
  assert.match(singleGuidance, /reconsider an aim/);
  assert.match(singleGuidance, /warrant the interruption/);
  assert.match(singleGuidance, /unsolicited questionnaire/);
  assert.match(singleGuidance, /no question is a good outcome/i);
  assert.match(batchGuidance, /materially change the next action/);
  assert.match(batchGuidance, /invited exploration/);
  assert.match(batchGuidance, /No questions is a valid outcome/);
  assert.doesNotMatch(singleGuidance, /immediately call ask_user_question again/);
  assert.doesNotMatch(batchGuidance, /immediately call ask_questions again/);
});

test("both tools preserve answer caveats, scope ownership, and consent boundaries", () => {
  const tools: any[] = [];
  registerQuestions({ registerTool(tool: any) { tools.push(tool); } } as any);
  for (const tool of tools) {
    const guidance = tool.promptGuidelines.join(" ");
    for (const pattern of [
      /apply it and its notes or caveats/, /Drop questions made obsolete/,
      /existing requirement through its owning tool if available/,
      /supersede changed requirements rather than rewriting their history/,
      /Do not create a task for every answer/,
      /Skipped, unanswered, cancelled, or unavailable questions are not agreement or consent/,
      /do not proceed across an unresolved approval boundary/,
      /Exploratory answers are not implementation authorization/,
    ]) assert.match(guidance, pattern, tool.name);
  }
});

test("submitted answers retain caveats and skipped answers remain unknown", () => {
  const single = buildResult("Explore what?", undefined, "text",
    [{ type: "text", label: "A prototype", value: "A prototype" }], "Discuss only; do not build");
  assert.equal(single.details.note, "Discuss only; do not build");
  assert.match(single.content[0].text, /Discuss only; do not build/);
  const questions: QuestionDef[] = [
    { question: "Direction?", mode: "text", options: [] },
    { question: "Deploy?", mode: "text", options: [] },
  ];
  const batch = buildBatchResult(questions, [
    { questionIndex: 0, answer: "Local prototype", note: "No network" },
    { questionIndex: 1, answer: null, skipped: true },
  ]);
  assert.match(batch.content[0].text, /Note: No network/);
  assert.match(batch.content[0].text, /skipped by user/);
  assert.deepEqual(batch.details.skippedQuestionIndexes, [1]);
  assert.equal(batch.details.answers[1].answer, null);
  const skipped = skippedResult("Deploy?", "single-select");
  assert.equal(skipped.details.status, "skipped");
  assert.deepEqual(skipped.details.answers, []);
  assert.match(skipped.content[0].text, /unknown, not agreement or consent/);
  assert.match(skipped.content[0].text, /do not cross an unresolved approval boundary/);
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
