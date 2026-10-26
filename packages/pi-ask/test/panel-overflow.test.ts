import assert from "node:assert/strict";
import { test } from "node:test";
import { TuiMainScreen, getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";
import { frameQuestion, questionHeight, questionViewport } from "../extensions/ask-user-question/question-surface.ts";
import { fitLineWindow, sanitizeDisplayText, WrappedChoiceList } from "../extensions/ask-user-question/tui-primitives.ts";
import type { QuestionDef } from "../extensions/ask-user-question/domain.ts";

const theme = { fg(_role: string, text: string) { return text; }, bg(_role: string, text: string) { return text; }, bold(text: string) { return text; } };
const keys = { enter: "\r", altUp: "\x1b[1;3A", altDown: "\x1b[1;3B", down: "\x1b[B" };

/** The reported question: a claim, its grounds, and a closing paragraph. */
const question: QuestionDef = {
  question: "Does the claim as stated need the supporting grounds?",
  label: "Claim",
  mode: "single-select",
  details: [
    "A reviewer asked whether the stated claim as written can stand without the supporting grounds attached to it.",
    "The claim bounds what this release may do; the grounds record why that boundary is the right one, and the reviewer",
    "read both before answering. Two constraints follow from that. First, any answer here changes a boundary that",
    "downstream work already treats as settled, so it is not a private editing decision. Second, the reasoning trail is",
    "what makes the boundary auditable later, so dropping it also drops the evidence a future reader would need to",
    "revisit the decision without re-deriving it from scratch. Nothing else in this question is load-bearing: the",
    "options below differ only in how much of that trail they carry forward. If the grounds stay attached, the next",
    "question can build on them directly. If they do not, the follow-up has to restate the case before it can ask",
    "anything useful, and that restatement is the work this question exists to avoid. Either way the answer is",
    "recorded with the question, so the choice is visible to whoever reads this boundary next.",
  ].join(" "),
  options: [
    {
      label: "Claim plus grounds",
      value: "with-grounds",
      description: "Keep the boundary and the reasoning that produced it.",
      suggestion: { kind: "evidence", basis: "The grounds are what the reviewer already read and accepted.", caveat: "Carries the whole trail into every later reference." },
    },
    {
      label: "Claim only",
      value: "claim-only",
      description: "Carry the boundary on its own.",
      suggestion: { kind: "low-friction", basis: "Shortest reference for downstream work.", caveat: "A later reader has to re-derive why the boundary holds." },
    },
    {
      label: "Claim plus the next question it opens",
      value: "with-next",
      description: "Carry the boundary and the question it makes askable.",
      suggestion: { kind: "explore", basis: "Keeps the follow-up visible while it is still cheap.", caveat: "Presumes the follow-up is still in scope." },
    },
  ],
};

const optionLabels = ["1. Claim plus grounds", "2. Claim only", "3. Claim plus the next question it opens"];
const itemLabels = [...optionLabels, "Something else"];

function view(questions: QuestionDef[], rows: number, width = 132) {
  const tui = { terminal: { rows }, requestRender() {} };
  const form = new TabbedQuestions(questions, questionViewport(tui), theme, getKeybindings(), () => {});
  const shell = frameQuestion(form, theme, tui);
  shell.focused = true;
  const render = (): string[] => {
    const rows: string[] = shell.render(width);
    return rows.map(row => sanitizeDisplayText(stripVTControlCharacters(row)));
  };
  return { form, shell, render, componentRows: questionHeight(tui) - 2 };
}

const shownChoices = (rows: string[]) => optionLabels.filter(label => rows.some(row => row.includes(label))).length;
const shownItems = (rows: string[]) => itemLabels.filter(label => rows.some(row => row.includes(label))).length;
const indexOfRow = (rows: string[], text: string) => rows.findIndex(row => row.includes(text));

test("fitLineWindow names every clipped side and never overwrites a content row", () => {
  for (let total = 0; total <= 12; total++) {
    for (let rows = 1; rows <= 8; rows++) {
      for (let requested = 0; requested <= total; requested++) {
        const found = fitLineWindow(total, rows, requested);
        const markerRows = (found.above ? 1 : 0) + (found.below ? 1 : 0);
        const label = `total ${total} rows ${rows} requested ${requested}`;
        assert.ok(found.start >= 0 && found.count >= 0, label);
        assert.ok(found.start + found.count <= total, `${label}: window stays inside the content`);
        assert.ok(found.count + markerRows <= rows, `${label}: markers fit the region`);
        if (total <= rows) {
          assert.deepEqual(found, { start: 0, count: total, above: false, below: false }, `${label}: everything fits`);
          continue;
        }
        assert.equal(found.count + markerRows, rows, `${label}: the region is spent on content and markers`);
        // A region of one or two rows cannot hold a marker beside content on both
        // sides: the window slides, and the host's key hints name the rest.
        if (!found.above) assert.ok(found.start === 0 || rows <= 2, `${label}: content above must be counted`);
        if (!found.below) assert.ok(found.start + found.count === total || rows <= 2, `${label}: content below must be counted`);
        if (requested >= total) assert.equal(found.start + found.count, total, `${label}: the end is reachable`);
      }
    }
  }
});

const rich = (): WrappedChoiceList => new WrappedChoiceList(question.options, "Something else…", 4, getKeybindings(), theme);

test("a budgeted choice list keeps the focused rationale and counts the rest", () => {
  const list = rich();
  const measure = list.measure(120, { showRadio: true });
  assert.ok(measure.full > measure.compressed, `compressing saves rows (${measure.full} vs ${measure.compressed})`);
  for (let budget = 6; budget <= 10; budget++) {
    const plain = list.render(120, { showRadio: true, availableLines: budget }).map(sanitizeDisplayText);
    const text = plain.join("\n");
    assert.equal(plain.length, budget, `budget ${budget}: the region is exactly its budget`);
    assert.ok(plain.every(row => visibleWidth(row) <= 120));
    assert.match(text, /Why: /, `budget ${budget}: the focused choice keeps its why`);
    assert.match(text, /Caveat: /, `budget ${budget}: the focused choice keeps its caveat`);
    const shown = shownItems(plain);
    assert.ok(shown >= 1, `budget ${budget}: at least one choice is readable`);
    const whyRows = plain.filter(row => row.includes("Why: ")).length;
    const caveatRows = plain.filter(row => row.includes("Caveat: ")).length;
    assert.match(text, /Why: The grounds are/, `budget ${budget}: the focused choice keeps its why`);
    assert.equal(whyRows, caveatRows, `budget ${budget}: a rationale is never half-rendered`);
    if (shown < itemLabels.length) assert.match(text, new RegExp(`↓ ${itemLabels.length - shown} more`), `budget ${budget}: hidden choices are counted`);
    else assert.doesNotMatch(text, /more/, `budget ${budget}: nothing is hidden`);
  }
  // Roomy budgets render every rationale and no marker.
  const roomy = list.render(120, { showRadio: true, availableLines: measure.full }).map(sanitizeDisplayText).join("\n");
  assert.equal(roomy.match(/Why: /g)?.length, 3, "every choice explains itself when it fits");
  assert.doesNotMatch(roomy, /more/);
});

test("132x24 windows the question and still names every choice", () => {
  const { render, componentRows } = view([question], 24);
  const rows = render();
  assert.ok(rows.length <= componentRows, `the panel fits the screen (${rows.length} of ${componentRows})`);
  assert.match(rows.join("\n"), /↓ \d+ more lines · Alt\+↓/, "a clipped question counts the rows it hides");
  assert.equal(shownChoices(rows), 3, `all three choices are named: ${JSON.stringify(rows)}`);
  // Option 1's rows stay together: label, why, caveat, and only then option 2.
  const label = indexOfRow(rows, "1. Claim plus grounds");
  const why = indexOfRow(rows, "Why: The grounds are what the reviewer");
  const caveat = indexOfRow(rows, "Caveat: Carries the whole trail");
  const second = indexOfRow(rows, "2. Claim only");
  assert.ok(label >= 0 && why > label && caveat > why && second > caveat,
    `option 1's rationale stays under its own label (${JSON.stringify({ label, why, caveat, second })})`);
});

test("no question text is ever dropped without a counted marker", () => {
  const words = (question.details ?? "").split(/\s+/);
  for (const rows of [20, 22, 24, 26, 29, 32]) {
    const { render, componentRows } = view([question], rows);
    const rowsOut = render();
    const text = rowsOut.join("\n");
    assert.ok(rowsOut.length <= componentRows, `rows ${rows}: the panel fits the screen`);
    assert.equal(shownChoices(rowsOut), 3, `rows ${rows}: every choice is named`);
    assert.ok(rowsOut.some(row => /│\s+\+ Note\s*│/.test(row)), `rows ${rows}: tight chrome keeps the note action`);
    const missing = words.filter(word => !text.includes(word)).length;
    if (missing > 0) assert.match(text, /↓ \d+ more lines · Alt\+↓/, `rows ${rows}: the ${missing} hidden question words are counted`);
    else assert.doesNotMatch(text, /more lines/, `rows ${rows}: a whole question claims no hidden rows`);
  }
});

test("a taller panel keeps the whole question, so nothing needs a marker", () => {
  const { render, componentRows } = view([question], 29);
  const rows = render();
  assert.ok(rows.length <= componentRows, `the panel fits the screen (${rows.length} of ${componentRows})`);
  assert.equal(shownChoices(rows), 3);
  assert.doesNotMatch(rows.join("\n"), /more lines/, "the question is whole, so it claims no hidden rows");
  assert.match(rows.join("\n"), /Caveat: Carries the whole trail/, "the focused choice keeps its caveat");
  assert.doesNotMatch(rows.join("\n"), /Caveat: Carries the whole trail[\s\S]*Caveat: Carries/, "one caveat, one owner");
});

test("Alt+arrows move only the clipped question, and are inert when it fits", () => {
  const clipped = view([question], 24);
  const before = clipped.render();
  assert.match(before.join("\n"), /↓ \d+ more lines · Alt\+↓/);
  clipped.form.handleInput(keys.altDown);
  const scrolled = clipped.render();
  assert.notDeepEqual(scrolled, before, "Alt+Down reveals a hidden question line");
  assert.deepEqual(scrolled.filter(row => optionLabels.some(label => row.includes(label))),
    before.filter(row => optionLabels.some(label => row.includes(label))), "the choices are unchanged");
  clipped.form.handleInput(keys.altUp);
  assert.deepEqual(clipped.render(), before, "Alt+Up restores the first question rows");

  const roomy = view([question], 50);
  const settled = roomy.render();
  roomy.form.handleInput(keys.altDown);
  assert.deepEqual(roomy.render(), settled, "nothing is clipped, so the keys do nothing");
});

test("moving the choice cursor keeps the row count and hands the rationale over", () => {
  const { form, render } = view([question], 29);
  const before = render();
  form.handleInput(keys.down);
  const moved = render();
  assert.equal(moved.length, before.length, "the cursor moves without shifting rows");
  assert.equal(shownChoices(moved), 3, "the same choices stay named");
  assert.match(moved.join("\n"), /Why: Shortest reference for downstream work/, "option 2 now explains itself");
  assert.doesNotMatch(moved.join("\n"), /Why: The grounds are/, "option 1 stops explaining itself");
});

test("a question taller than its share is windowed, and the choices still render", () => {
  const tall: QuestionDef = { ...question, details: Array.from({ length: 30 }, (_value, index) => `Ground ${index + 1}: the boundary holds because the reviewer checked this line.`).join(" ") };
  const { render, componentRows } = view([tall], 24);
  const rows = render();
  assert.ok(rows.length <= componentRows, `the panel fits the screen (${rows.length} of ${componentRows})`);
  assert.match(rows.join("\n"), /↓ \d+ more lines · Alt\+↓/, "the question names the rows it cannot show");
  assert.match(rows.join("\n"), /1\. Claim plus grounds/, "the focused choice is still readable");
  assert.match(rows.join("\n"), /Why: The grounds are/, "the focused choice keeps its rationale");
});

test("132x50 renders every choice and rationale with no option marker", () => {
  const { render, componentRows } = view([question], 50);
  const rows = render();
  assert.equal(shownChoices(rows), 3);
  assert.equal((rows.join("\n").match(/Why: /g) ?? []).length, 3, "every choice explains itself");
  assert.doesNotMatch(rows.join("\n"), /more lines/, "the question fits");
  assert.ok(rows.length <= componentRows);
});

test("the real Pi screen writes all three choices at 132x29", () => {
  const writes: string[] = [];
  const terminal: any = { columns: 132, rows: 29, kittyProtocolActive: false,
    start() {}, stop() {}, async drainInput() {}, write(data: string) { writes.push(data); },
    moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
  const tui = new TuiMainScreen(terminal, false);
  const form = new TabbedQuestions([question], tui, theme, getKeybindings(), () => {});
  const shell = frameQuestion(form, theme, tui);
  try {
    tui.addChild(shell);
    tui.setFocus(shell);
    tui.start();
    void shell.render(132);
    writes.length = 0;
    tui.renderNow(true);
    const written = stripVTControlCharacters(writes.join(""));
    assert.match(written, /╰ 1 of 1/, "the progress label survives the taller panel");
    assert.match(written, /2\. Claim only/, "the second choice reaches the screen");
    assert.match(written, /Why: The grounds are/, "the focused rationale is not replaced by a marker");
  } finally { tui.stop(); }
});

test("an overlay cap bounds the frame even when the screen is tall", () => {
  const tui = { terminal: { rows: 40 }, requestRender() {} };
  const form = new TabbedQuestions([question], questionViewport(tui, Math.floor(40 * 0.85)), theme, getKeybindings(), () => {});
  const shell = frameQuestion(form, theme, tui, { raised: true, maxRows: Math.floor(40 * 0.85) });
  const rows = shell.render(132);
  assert.ok(rows.length <= Math.floor(40 * 0.85), `the overlay cap holds (${rows.length})`);
  assert.equal(shownChoices(rows.map((row: string) => sanitizeDisplayText(row))), 3, "the cap does not drop the choices");
});

test("multi-select keeps its selection header inside the allocated region", () => {
  const multi: QuestionDef = {
    question: "Which parts ship together?",
    label: "Scope",
    mode: "multi-select",
    details: question.details,
    options: question.options.slice(0, 2).concat([
      { label: "Reader switch", value: "reader", description: "Turns on the new path." },
      { label: "Old writer removal", value: "writer", description: "Deletes the previous path." },
    ]),
  };
  for (const rows of [20, 24, 26, 29, 32]) {
    const tui = { terminal: { rows }, requestRender() {} };
    const form = new TabbedQuestions([multi], questionViewport(tui), theme, getKeybindings(), () => {});
    const shell = frameQuestion(form, theme, tui);
    form.handleInput(" "); // select option 1 so the counted header is the taller form
    const rendered: string[] = shell.render(132);
    const plain: string[] = rendered.map(row => sanitizeDisplayText(stripVTControlCharacters(row)));
    const text = plain.join("\n");
    assert.ok(plain.length <= questionHeight(tui) - 2, `rows ${rows}: the panel fits its region (${plain.length})`);
    assert.match(text, /1 selected/, `rows ${rows}: the selection header is rendered`);
    assert.ok(plain.some(row => /│\s+\+ Note\s*│/.test(row)), `rows ${rows}: the note action survives the header rows`);
    assert.match(text, /1\. Claim plus grounds/, `rows ${rows}: the focused choice is readable`);
    const missing = (multi.details ?? "").split(/\s+/).filter(word => !text.includes(word)).length;
    if (missing > 0) assert.match(text, /↓ \d+ more lines · Alt\+↓/, `rows ${rows}: hidden question text is counted`);
  }
});

test("a pinned custom-answer editor never hides the question it belongs to", () => {
  // Smallest panels: the question keeps its rows, the editor stays capped, and the
  // action bar names the option window. This is the documented limit, not a surprise.
  for (const rows of [16, 18, 20]) {
    const { form, render } = view([question], rows);
    form.handleInput("4");
    const plain = render();
    assert.match(plain.join("\n"), /Does the claim as stated need/, `the question survives at ${rows} rows`);
    assert.match(plain.join("\n"), /Alt\+↑\/↓ Options/, `the option window is named at ${rows} rows`);
    assert.ok(plain.every(row => visibleWidth(row) <= 132));
  }
});
