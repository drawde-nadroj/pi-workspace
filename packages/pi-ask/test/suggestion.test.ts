import assert from "node:assert/strict";
import { test } from "node:test";
import { getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { buildBatchClarificationResult, buildClarificationResult, buildRegenerateResult, normalizeOptions, type QuestionDef } from "../extensions/ask-user-question/domain.ts";
import { questionHistory } from "../extensions/ask-user-question/question-history.ts";
import { sanitizeDisplayText, WrappedChoiceList } from "../extensions/ask-user-question/tui-primitives.ts";

const theme = { fg(_role: string, value: string) { return value; }, bg(_role: string, value: string) { return value; }, bold(value: string) { return value; } };
const text = (lines: string[]) => lines.map(sanitizeDisplayText).join("\n");

const input = [
  { label: "First", recommended: true },
  { label: "Legacy (Recommended)" },
  { label: "Explore", suggestion: { kind: "explore" as const, basis: "  Offers a new angle.  ", caveat: "  Not yet tested.  " } },
];

test("legacy flags and suffixes are accepted but cannot create an endorsement", () => {
  const options = normalizeOptions(input);
  assert.deepEqual(options.map(option => option.label), ["First", "Legacy", "Explore"]);
  assert.equal(options[0].recommended, true);
  assert.equal(options[1].recommended, true);
  assert.equal(options[0].suggestion, undefined);
  assert.deepEqual(options[2].suggestion, { kind: "explore", basis: "Offers a new angle.", caveat: "Not yet tested." });
  const list = new WrappedChoiceList(options, "Something else…", 5, getKeybindings(), theme);
  const view = text(list.render(80));
  assert.match(view, /Assistant's take · explore/);
  assert.match(view, /Why: Offers a new angle/);
  assert.match(view, /Caveat: Not yet tested/);
  assert.doesNotMatch(view, /Recommended|Assistant's take · evidence|Assistant's take · possible fit/);
  const history = text(questionHistory({ question: "Where next?", options: input }, undefined, theme).render(80));
  assert.doesNotMatch(history, /Recommended/);
  assert.match(history, /Why: Offers a new angle/);
});

test("a suggestion cannot be shown without a nonblank basis", () => {
  assert.throws(() => normalizeOptions([{ label: "Try it", suggestion: { kind: "fit", basis: "  " } }]), /nonblank basis/);
});

test("the live choice list sanitizes suggestions and fits narrow terminals", () => {
  const options = normalizeOptions([{ label: "Try it", suggestion: {
    kind: "low-friction", basis: "No setup \x1b[31mneeded\x1b[0m", caveat: "Scale later.",
  } }]);
  const list = new WrappedChoiceList(options, "Something else…", 2, getKeybindings(), theme);
  for (const width of [8, 20, 45, 80]) {
    const lines = list.render(width);
    assert.ok(lines.every(line => visibleWidth(line) <= width));
    assert.ok(lines.every(line => !line.includes("\x1b[31m")));
    const view = text(lines);
    if (width >= 20) {
      assert.match(view, /Why:/);
      assert.match(view, /Caveat:/);
    }
  }
});

test("clarification and batch revision keep the suggestion's basis and caveat", () => {
  const options = normalizeOptions([{ label: "Prototype", suggestion: { kind: "low-friction", basis: "No server needed.", caveat: "Revisit for production." } }]);
  const single = buildClarificationResult("Which path?", undefined, "single-select", options, "Why?");
  assert.match(single.content[0].text, /No server needed/);
  assert.match(single.content[0].text, /Revisit for production/);
  const questions: QuestionDef[] = [{ question: "Which path?", mode: "single-select", options }];
  const batch = buildRegenerateResult(questions, []);
  assert.match(batch.content[0].text, /No server needed/);
  const clarification = buildBatchClarificationResult(questions, [], 0, "Why?");
  assert.match(clarification.content[0].text, /Revisit for production/);
});
