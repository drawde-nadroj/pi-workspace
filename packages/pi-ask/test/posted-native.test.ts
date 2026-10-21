import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Input, TuiAltScreen, TuiMainScreen, getKeybindings, visibleWidth } from '@earendil-works/pi-tui';
import { postedQuestionUI } from '../extensions/ask-user-question/posted-ui.ts';
import { emptyPostedBook, postQuestion } from '../extensions/ask-user-question/posted-state.ts';
import { sanitizeDisplayText } from '../extensions/ask-user-question/tui-primitives.ts';

const theme: any = { fg: (_: string, t: string) => t, bg: (_: string, t: string) => t, bold: (t: string) => t };
for (const Renderer of [TuiMainScreen, TuiAltScreen]) {
  test(`${Renderer.name}: posted Ask stacks above a task overlay, keeps the native draft/cursor, and restores focus`, async () => {
    let send = (_data: string) => {}; const writes: string[] = [];
    const terminal: any = { columns: 100, rows: 36, kittyProtocolActive: false,
      start(callback: any) { send = callback; }, stop() {}, async drainInput() {}, write(data: string) { writes.push(data); },
      moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} };
    const tui = new Renderer(terminal, false), native = new Input(); native.setValue('Native draft remains untouched'); tui.addChild(native); tui.setFocus(native);
    let taskFocus = false;
    const task: any = { get focused() { return taskFocus; }, set focused(v: boolean) { taskFocus = v; }, render: (width: number) => ['Tasks → Questions · selected release question'.slice(0, width)], handleInput() {}, invalidate() {} };
    let taskHandle: any;
    try {
      tui.start(); taskHandle = tui.showOverlay(task, { width: '85%', anchor: 'center' });
      let shell: any;
      const ctx: any = { cwd: process.cwd(), ui: { custom(make: any, options: any) {
        return new Promise(resolve => {
          let handle: any;
          shell = make(tui, theme, getKeybindings(), (value: any) => { handle.hide(); resolve(value); });
          handle = tui.showOverlay(shell, options.overlayOptions);
        });
      } } };
      const q = postQuestion(emptyPostedBook(), { question: 'Which release boundary?', urgency: 'blocking', why: 'This is your decision.', boundary: 'Only release waits.' }).questions[0];
      const pending = postedQuestionUI(ctx, q, () => true, () => {});
      assert.equal(tui.getFocusedComponent(), shell);
      send('Keep the handoff local'); tui.renderNow(true);
      assert.equal(native.getValue(), 'Native draft remains untouched');
      assert.match(sanitizeDisplayText(writes.join('')), /Which release boundary/);
      for (const width of [16, 32, 80]) assert.ok(shell.render(width).every((line: string) => visibleWidth(line) <= width));
      terminal.columns = 54; terminal.rows = 24; tui.renderNow(true);
      send('\x1b'); send('\x1b'); const outcome = await pending;
      assert.equal(outcome.result, null); assert.equal(outcome.draft?.textBuffer, 'Keep the handoff local');
      assert.equal(tui.getFocusedComponent(), task); assert.equal(taskFocus, true);
      taskHandle.hide(); taskHandle = undefined;
      assert.equal(tui.getFocusedComponent(), native);
      send('!'); assert.equal(native.getValue(), '!Native draft remains untouched', 'native cursor position is preserved');
    } finally { taskHandle?.hide(); tui.stop(); }
  });
}
