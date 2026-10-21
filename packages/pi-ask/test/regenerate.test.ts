import assert from "node:assert/strict";
import { test } from "node:test";
import { getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import registerQuestions from "../extensions/questions.ts";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";
import { sanitizeDisplayText } from "../extensions/ask-user-question/tui-primitives.ts";

const theme = { fg(_role: string, text: string) { return text; }, bg(_role: string, text: string) { return text; }, bold(text: string) { return text; } };
const tui = { terminal: { rows: 40 }, requestRender() {} };

for (const mode of ["text", "single-select", "multi-select"]) {
  test(`single ${mode} visibly regenerates with an active note, not an answer`, async () => {
    const tools = new Map<string, any>();
    registerQuestions({ registerTool(tool: any) { tools.set(tool.name, tool); }, events: { emit() {} } } as any);
    let open!: (component: any) => void;
    const opened = new Promise<any>(resolve => { open = resolve; });
    const ctx: any = { hasUI: true, mode: "tui", cwd: process.cwd(), ui: { custom(factory: any) {
      return new Promise(resolve => { const c = factory(tui, theme, getKeybindings(), resolve); c.focused = true; open(c); });
    } } };
    const params = { question: "What fits?", ...(mode !== "text" ? { options: [{ label: "One" }], multiSelect: mode === "multi-select" } : {}) };
    const pending = tools.get("ask_user_question").execute("regenerate", params, undefined, undefined, ctx);
    const c = await opened;
    for (const width of [32, 80, 120]) {
      const lines = c.render(width);
      assert.match(sanitizeDisplayText(lines.join("\n")), /Ctrl\+R Regenerate/);
      assert.ok(lines.every((line: string) => visibleWidth(line) <= width));
    }
    c.handleInput("\t"); c.handleInput("\r"); c.handleInput("Try a different framing");
    c.handleInput("\x12");
    const result = await pending;
    assert.equal(result.details.status, "regenerate");
    assert.deepEqual(result.details.answers, []);
    assert.equal(result.details.unansweredNotes[0].note, "Try a different framing");
    assert.equal(result.details.unansweredQuestions[0].mode, mode);
  });
}

test("fresh batch can regenerate without answering; posted forms cannot silently regenerate", () => {
  const questions = [{ question: "Why?", mode: "text" as const, options: [] }];
  let result: any;
  const c = new TabbedQuestions(questions, tui, theme, getKeybindings(), value => { result = value; });
  assert.match(c.render(80).join("\n"), /Ctrl\+R Regenerate/);
  assert.ok(c.getMoreActions().some(action => action.hint === "Ctrl+R"));
  c.handleInput("\x12");
  assert.equal(result.action, "regenerate");
  assert.equal(result.answers[0].answer, null);
  result = undefined;
  const posted = new TabbedQuestions(questions, tui, theme, getKeybindings(), value => { result = value; }, process.cwd(), undefined, false);
  assert.doesNotMatch(posted.render(80).join("\n"), /Regenerate/);
  posted.handleInput("\x12");
  assert.equal(result, undefined);
});
