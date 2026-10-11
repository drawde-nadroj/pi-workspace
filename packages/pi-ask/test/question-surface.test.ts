import assert from "node:assert/strict";
import { test } from "node:test";
import { CURSOR_MARKER, getKeybindings, Input, TuiAltScreen, TuiMainScreen, visibleWidth } from "@earendil-works/pi-tui";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";
import { frameQuestion, questionAccent, questionHeight, questionViewport, questionTheme } from "../extensions/ask-user-question/question-surface.ts";
import { addActionHints, actionHint, createQuestionEditor, sanitizeDisplayText, WrappedChoiceList } from "../extensions/ask-user-question/tui-primitives.ts";
import { askText, askSingleChoice, askMultiChoice } from "../extensions/ask-user-question/standalone-ui.ts";
const theme = {
  fg: (_role: string, text: string) => `\x1b[34m${text}\x1b[39m`,
  bg: (_role: string, text: string) => `\x1b[44m${text}\x1b[49m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};

test("question accents use the active Pi workspace accent without changing the global theme", () => {
  const calls: Array<{ role?: string; fg?: unknown }> = [];
  const accent = { r: 128, g: 91, b: 215 };
  const base = { colors: { accent }, fg(role: string, text: string) { calls.push({ role }); return text; }, style(text: string, options: { fg?: unknown }) { calls.push({ fg: options.fg }); return text; }, bold(text: string) { return text; } };
  const palette = questionTheme(base);
  assert.equal(questionAccent(base), accent);
  palette.fg("accent", "Selected"); palette.fg("borderAccent", "Your turn"); palette.fg("success", "Done");
  assert.deepEqual(calls, [{ fg: accent }, { fg: accent }, { role: "success" }]);
  base.fg("accent", "Unchanged");
  assert.deepEqual(calls.at(-1), { role: "accent" });
});

test("question progress matches the theme-accent title by default", () => {
  const styled: Array<{ text: string; fg: unknown }> = [];
  const accent = { r: 128, g: 91, b: 215 };
  const palette = { ...theme, colors: { accent }, appearance: "dark", style(text: string, options: { fg?: unknown }) { styled.push({ text, fg: options.fg }); return text; } };
  const tui: any = { terminal: { rows: 30 }, requestRender() {} };
  const form = new TabbedQuestions([{ question: "Why?", mode: "text", options: [] }], questionViewport(tui), palette, getKeybindings(), () => {});
  frameQuestion(form, palette, tui).render(90);
  const title = styled.find(item => item.text === " Questions ");
  const progress = styled.find(item => item.text === " 1 of 1 ");
  assert.ok(title && progress);
  assert.deepEqual(progress.fg, accent);
  assert.deepEqual(title.fg, accent);
});

test("question editor closes both sides and keeps typing inside left padding", () => {
  const tui: any = { terminal: { rows: 40 }, requestRender() {} };
  const editor = createQuestionEditor(tui, theme);
  editor.focused = true;
  for (const width of [7, 12, 20, 40, 100]) {
    editor.setText("actually 界面");
    const lines = editor.render(width);
    const plain = lines.map(sanitizeDisplayText);
    assert.match(plain[0], /^╭.*╮$/);
    assert.match(plain.at(-1)!, /^╰.*╯$/);
    for (const line of plain.slice(1, -1)) assert.match(line, /^│ .* │$/);
    assert.ok(plain[1].startsWith("│ a"));
    assert.ok(lines.every(line => visibleWidth(line) === width));
    assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
  }
  editor.setText("abcdef");
  editor.render(40);
  editor.handleMouse({ type: "click", button: "left", x: 2, y: 1, width: 40, height: 3, screenX: 2, screenY: 1, shift: false, alt: false, ctrl: false });
  editor.handleInput("!");
  assert.equal(editor.getText(), "!abcdef", "mouse origin agrees with the padded text origin");
});

test("text-only choice focus stays within widths without adding a background or rows", () => {
  const tui: any = { terminal: { rows: 30 }, requestRender() {} };
  const editor = createQuestionEditor(tui, theme);
  editor.focused = true;
  editor.setText("Custom answer");
  const choices = new WrappedChoiceList([{ label: "A long option with 界面 and wrapping", value: "one", description: "More context" }], "Something else…", 2, getKeybindings(), theme);
  for (const width of [1, 2, 4, 8, 9, 10, 16, 35]) for (const availableLines of [3, 12, 30]) {
    const lines = choices.render(width, { availableLines });
    assert.ok(lines.length <= availableLines);
    assert.ok(lines.every(line => visibleWidth(line) <= width), `overflow at ${width}`);
    assert.ok(!lines.some(line => line.includes("\x1b[44m")), `focus background at ${width}x${availableLines}`);
    if (availableLines === 30) {
      assert.ok(!lines.some(line => /╭─+╮|╰─+╯/.test(sanitizeDisplayText(line))), `focus border at ${width}`);
      const before = lines.length;
      choices.setSelectedIndex(1);
      const moved = choices.render(width, { availableLines });
      assert.equal(moved.length, before, `focus shifted rows at ${width}`);
      assert.ok(!moved.some(line => line.includes("\x1b[44m")));
      choices.setSelectedIndex(0);
    }
  }
  choices.selectOther();
  for (const width of [12, 30, 80]) {
    const lines = choices.render(width, { inlineOtherEditor: editor, availableLines: 20 });
    assert.ok(lines.every(line => visibleWidth(line) <= width));
    assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
  }
});

test("Something else editor embeds the shared closed frame in both choice-list layouts", () => {
  const tui: any = { terminal: { rows: 30 }, requestRender() {} };
  const editor = createQuestionEditor(tui, theme);
  editor.focused = true;
  editor.setText("custom 界面");
  const choices = new WrappedChoiceList([{ label: "First", value: "first" }], "Something else…", 3, getKeybindings(), theme);
  choices.selectOther();
  for (const showRadio of [false, true]) for (const width of [15, 36, 80]) {
    const lines = choices.render(width, { inlineOtherEditor: editor, showRadio });
    const plain = lines.map(sanitizeDisplayText);
    assert.match(plain.join(" "), /Some/);
    assert.match(plain.join(" "), /else/);
    assert.ok(plain.some(line => /╭.*╮/.test(line)), "top edge is embedded under Other");
    assert.ok(plain.some(line => /╰.*╯/.test(line)), "bottom edge is embedded under Other");
    assert.ok(lines.every(line => visibleWidth(line) <= width));
    assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
  }
});

test("keyboard hints use readable key symbols and center each packed row", () => {
  assert.equal(actionHint("Shift+Enter Newline · Tab Note · Ctrl+C Clear"), "⇧↵ Newline · Tab Note · Ctrl+C Clear");
  for (const width of [8, 20, 40, 80, 120]) {
    const lines: string[] = [];
    const roles: string[] = [];
    addActionHints(lines, width, { fg(role: string, text: string) { roles.push(role); return text; } }, ["Enter Save", "Ctrl+C Clear", "Tab Note", "Esc Back"]);
    for (const line of lines) {
      assert.ok(visibleWidth(line) <= width);
      const padding = line.length - line.trimStart().length;
      assert.equal(padding, Math.floor((width - visibleWidth(line.trimStart())) / 2));
    }
    assert.ok(roles.every(role => role === "dim"));
    if (width >= 20) assert.match(lines.join("\n"), /Tab Note/);
  }
});

test("question shell keeps native focus/cursor and fits all viewport sizes", () => {
  for (const rows of [4, 8, 12, 24, 60]) for (const width of [1, 2, 9, 10, 20, 38, 58, 90, 140]) {
    const tui: any = { terminal: { rows, columns: width }, requestRender() {} };
    const form = new TabbedQuestions([{ question: "Your answer? 界面", mode: "text", options: [] }], questionViewport(tui), theme, getKeybindings(), () => {});
    const shell = frameQuestion(form, theme, tui);
    shell.focused = true;
    shell.handleInput("A real answer 界面");
    const lines = shell.render(width);
    assert.ok(lines.length <= questionHeight(tui));
    for (const line of lines) assert.ok(visibleWidth(line) <= width);
    if (rows >= 24 && width >= 20) {
      assert.match(sanitizeDisplayText(lines[0]), /^╭ Questions/);
      if (width >= 38) assert.match(sanitizeDisplayText(lines.at(-1)!), /^╰ 1 of 1 /);
      assert.match(sanitizeDisplayText(lines.at(-1)!), /^╰/);
      assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
    }
    shell.focused = false;
    assert.ok(!shell.render(width).join("").includes(CURSOR_MARKER));
    shell.dispose(); shell.dispose();
  }
});

for (const Renderer of [TuiMainScreen, TuiAltScreen]) {
  test(`${Renderer.name}: question replaces the input surface then restores the underlying draft`, () => {
    let send = (_data: string) => {};
    const writes: string[] = [];
    const terminal: any = {
      columns: 92, rows: 30, kittyProtocolActive: false,
      start(callback: (data: string) => void) { send = callback; }, stop() {}, async drainInput() {}, write(data: string) { writes.push(data); },
      moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
    };
    const tui = new Renderer(terminal, false);
    const draft = new Input(); draft.setValue("Underlying draft");
    tui.addChild(draft); tui.setFocus(draft);
    let result: any;
    const form = new TabbedQuestions([{ question: "Your answer?", mode: "text", options: [] }], questionViewport(tui), theme, getKeybindings(), value => { result = value; });
    const shell = frameQuestion(form, theme, tui);
    try {
      tui.start();
      tui.removeChild(draft); tui.addChild(shell); tui.setFocus(shell);
      assert.equal(tui.children.includes(draft), false, "no second input surface remains mounted");
      writes.length = 0;
      send("Choice with a note");
      send("\t"); send("\r"); send("Keep this note");
      tui.renderNow(true);
      assert.match(sanitizeDisplayText(writes.join("")), /Questions/);
      assert.equal(draft.getValue(), "Underlying draft");
      assert.equal(result, undefined);
      assert.ok(!writes.join("").includes(CURSOR_MARKER));
      assert.ok(writes.join("").includes("\x1b[7m"));
      assert.doesNotMatch(sanitizeDisplayText(writes.join("")), /Underlying draft/);
      tui.removeChild(shell); tui.addChild(draft); tui.setFocus(draft); shell.dispose();
      send("!");
      assert.equal(draft.getValue(), "!Underlying draft", "native cursor position is restored, not moved to the end");
    } finally { tui.stop(); }
  });
}

test("standalone question and context wrap with the same inset on every line", async () => {
  const question = "Where in your code should this effect appear? Please give me the project path or component and what it should color.";
  const context = "A longer piece of context that must also wrap onto a second line without shifting its first line to the right.";
  for (const mode of ["text", "single", "multi"]) {
    let component: any;
    const tui: any = { terminal: { rows: 40, columns: 58 }, requestRender() {} };
    const ctx: any = { cwd: process.cwd(), ui: { custom(factory: any) {
      return new Promise(resolve => { component = factory(tui, theme, getKeybindings(), resolve); component.focused = true; });
    } } };
    const options = [{ label: "Example", value: "example" }];
    const pending = mode === "text" ? askText(ctx, question, context)
      : mode === "single" ? askSingleChoice(ctx, question, context, options)
      : askMultiChoice(ctx, question, context, options);
    const lines = component.render(58).map(sanitizeDisplayText);
    const first = lines.findIndex((line: string) => line.includes("Where in your code"));
    const blank = lines.findIndex((line: string, index: number) => index > first && /^│\s+│$/.test(line));
    const promptLines = lines.slice(first, blank);
    assert.ok(promptLines.length > 1, `${mode}: prompt wraps`);
    for (const line of promptLines) assert.match(line, /^│  \S/, `${mode}: prompt line has a consistent inset`);
    const contextFirst = lines.findIndex((line: string) => line.includes("A longer piece of context"));
    const contextBlank = lines.findIndex((line: string, index: number) => index > contextFirst && /^│\s+│$/.test(line));
    const contextLines = lines.slice(contextFirst, contextBlank);
    assert.ok(contextLines.length > 1, `${mode}: context wraps`);
    for (const line of contextLines) assert.match(line, /^│  \S/, `${mode}: context line has a consistent inset`);
    component.handleInput("\x1b");
    await pending;
  }
});

test("standalone question requests native input replacement and cancels once", async () => {
  let component: any, options: any, completions = 0;
  const signal = new AbortController();
  const tui: any = { terminal: { rows: 30, columns: 90 }, requestRender() {} };
  const ctx: any = { ui: { custom(factory: any, config: any) {
    options = config;
    return new Promise(resolve => { component = factory(tui, theme, getKeybindings(), (value: any) => { completions++; resolve(value); }); component.focused = true; });
  } } };
  const pending = askText(ctx, "What should change?", undefined, signal.signal);
  assert.equal(options.overlay, false);
  assert.equal(options.overlayOptions, undefined);
  const rendered = component.render(86).map(sanitizeDisplayText);
  assert.match(rendered[0], /Questions/);
  assert.match(rendered.at(-1)!, /^╰ 1 of 1 /);
  assert.ok(rendered.filter((line: string) => /╭.*╮/.test(line)).length >= 2, "free-form answer editor embeds its own complete shared frame");
  signal.abort();
  assert.equal(await pending, null);
  component.handleInput("\x1b");
  assert.equal(completions, 1);
  component.dispose();
});
