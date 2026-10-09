import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { jiti, source, root, theme, plain, visibleWidth } from "./host.mjs";
const { ActivityBlocks, toolStateStyle } = await jiti.import(join(source, "activity-blocks.ts"));
const host = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/index.js")));
const { ToolExecutionComponent } = host;
const { Container, Text } = await import(pathToFileURL(join(root, "@earendil-works/pi-tui/dist/index.js")));
const { codemodeRenderers } = await import(pathToFileURL(join(root, "@earendil-works/pi-coding-agent/dist/extensions/codemode/renderer.js")));
const definitions = Object.fromEntries([['read','Read'],['write','Write'],['edit','Edit'],['bash','Bash'],['powershell','PowerShell'],['grep','Grep'],['find','Find'],['ls','Ls']].map(([name, factory]) => [name, host[`create${factory}ToolDefinition`]('/tmp')]));
definitions.codemode = codemodeRenderers;
let id = 0;
const output = (node, width = 90) => node.render(width).map(plain).join("\n");
const textResult = (text, details) => ({ content: [{ type: "text", text }], details, isError: false });
function fixture(name, args, result, definition = definitions[name], selectedTheme = theme) {
  const root = new Container();
  const node = new ToolExecutionComponent(name, `test-${++id}`, args, { showImages: false }, definition, { requestRender() {} }, "/tmp");
  if (result) node.updateResult(result);
  root.addChild(node);
  const blocks = new ActivityBlocks(() => selectedTheme, () => {});
  blocks.sync(root);
  return { node, blocks, root };
}
function click(node, row, width = 90, x = 3) {
  const rows = node.render(width);
  return node.handleMouse({ type: 'click', button: 'left', x, y: row, width, height: rows.length, screenX: x, screenY: row });
}
function rawToggle(node, label = 'Raw payload', width = 90) {
  const row = node.render(width).findIndex(row => plain(row).includes(label));
  assert.ok(row >= 0, label); assert.equal(click(node, row, width)?.handled, true);
}
function fits(node) { for (const w of [24, 40, 90, 140]) for (const row of node.render(w)) assert.equal(visibleWidth(row), w); }

test('Read compact is a line count; expansion retains syntax/content and cleanup restores native behavior', () => {
  const result = textResult(Array.from({ length: 30 }, (_, n) => `line ${n}`).join('\n'));
  const f = fixture('read', { path: '/tmp/example/SKILL.md' }, result);
  try {
    assert.match(output(f.node), /Read  example\/SKILL.md/); assert.match(output(f.node), /30 returned lines/);
    assert.doesNotMatch(output(f.node), /line 0|line 29|Arguments|expand/); assert.equal(f.node.render(90).length, 3);
    f.node.setExpanded(true); assert.match(output(f.node), /line 0/); assert.match(output(f.node), /line 29/); fits(f.node);
    assert.equal(f.node.result, result);
    f.node.setExpanded(false); f.blocks.dispose(); assert.doesNotMatch(output(f.node), /30 returned lines/);
  } finally { f.blocks.dispose(); }
});

test('real native Edit self-shell is compact diff counts, readable diff on expansion, visible errors', () => {
  const diff = Array.from({ length: 18 }, (_, n) => `${n % 2 ? '+' : '-'}${n + 1} change${n}`).join('\n');
  const f = fixture('edit', { path: '/tmp/example.ts', edits: [{ oldText: 'old\ntext', newText: 'new\ntext' }] }, textResult('Applied exact edit', { diff }));
  try {
    assert.match(output(f.node), /╭.*Edit/); assert.match(output(f.node), /\+9 −9 lines/);
    assert.doesNotMatch(output(f.node), /change0|Applied exact edit|Arguments/); assert.equal(f.node.render(90).length, 3);
    f.node.setExpanded(true); assert.match(output(f.node), /Diff/); assert.match(output(f.node), /change17/); assert.match(output(f.node), /Applied exact edit/);
    assert.doesNotMatch(output(f.node), /old\\ntext/); fits(f.node);
    f.node.updateResult({ ...textResult('No unique match'), isError: true }); f.node.setExpanded(false);
    assert.match(output(f.node), /failed/); assert.match(output(f.node), /No unique match/); assert.doesNotMatch(output(f.node), /change0/);
  } finally { f.blocks.dispose(); }
});

for (const name of ['bash', 'powershell']) test(`${name} compact tail, early diagnostics and truncation remain visible; zero exit is quiet`, () => {
  const f = fixture(name, { command: 'run-checks' }, textResult('warning: sample\n' + Array.from({ length: 20 }, (_, n) => `log ${n}`).join('\n'), { exitCode: 0 }));
  try {
    assert.match(output(f.node), /log 19/); assert.match(output(f.node), /warning: sample/); assert.doesNotMatch(output(f.node), /log 0\b|Exit 0/);
    assert.equal(f.node.render(90).length, 4); fits(f.node);
    f.node.setExpanded(true); assert.match(output(f.node), /log 0\b/); assert.match(output(f.node), /Command/); assert.match(output(f.node), /Exit 0/);
    f.node.setExpanded(false);
    f.node.updateResult(textResult('tail', { exitCode: 2, truncation: { truncated: true }, fullOutputPath: '/tmp/full-output.txt' }));
    assert.match(output(f.node), /Exit 2/); assert.match(output(f.node), /Output truncated/); assert.match(output(f.node), /Full output:/);
    f.node.updateResult(textResult('partial'), true); assert.doesNotMatch(output(f.node), /returned/);
  } finally { f.blocks.dispose(); }
});

test('Write never dumps content in compact mode; expanded input is source, not escaped JSON', () => {
  const f = fixture('write', { path: '/tmp/new.ts', content: 'const alpha = 1;\nconst beta = 2;' });
  try {
    assert.match(output(f.node), /2 input lines/); assert.doesNotMatch(output(f.node), /const alpha|Written content/);
    f.node.updateResult(textResult('Wrote file')); assert.equal(f.node.render(90).length, 3);
    f.node.setExpanded(true); assert.match(output(f.node), /Input content/); assert.match(output(f.node), /const alpha/); assert.doesNotMatch(output(f.node), /;\\nconst/);
    f.node.setExpanded(false); f.node.updateResult({ ...textResult('Permission denied'), isError: true }); assert.match(output(f.node), /Permission denied/);
  } finally { f.blocks.dispose(); }
});

for (const name of ['grep', 'find', 'ls']) test(`${name} has a short text preview and all results on expansion`, () => {
  const f = fixture(name, { path: '/tmp', pattern: 'example' }, textResult('one.ts\ntwo.ts\nthree.ts\nfour.ts'));
  try {
    assert.match(output(f.node), /one.ts/); assert.doesNotMatch(output(f.node), /four.ts/); assert.ok(f.node.render(90).length <= 4);
    f.node.setExpanded(true); assert.match(output(f.node), /four.ts/); fits(f.node);
    f.node.setExpanded(false);
    const key = { grep: 'matchLimitReached', find: 'resultLimitReached', ls: 'entryLimitReached' }[name];
    f.node.updateResult(textResult('one.ts', { [key]: 100, linesTruncated: name === 'grep' }));
    assert.match(output(f.node), /limit reached: 100/);
    if (name === 'grep') assert.match(output(f.node), /Long result lines truncated/);
  } finally { f.blocks.dispose(); }
});

const demoCode = 'const results = await Promise.allSettled([\n  tools.read({ path: "demo.ts" }),\n]);\ntext(results);';
const demoResult = {
  content: [
    { type: 'text', text: 'Script completed\nWall time 2.0 seconds\nOutput:\n' },
    { type: 'text', text: JSON.stringify({ demoChild: 1, status: 'fulfilled', output: 'export function greet(name: string) {\n  return `Hello, ${name}!`;\n}' }) },
    { type: 'text', text: JSON.stringify({ demoChild: 2, status: 'fulfilled', output: { output: 'Demo child finished.\n', exit_code: 0 } }) },
  ],
  details: { calls: [{ name: 'read', args: '{"path":"/tmp/demo.ts"}', status: 'ok', durationMs: 5 }, { name: 'bash', args: '{"command":"sleep 2"}', status: 'ok', durationMs: 2000 }] }, isError: false,
};

test('screenshot regression: Codemode wrapper removed, readable records and actual script lines, raw separate', () => {
  const f = fixture('codemode', { code: demoCode }, demoResult);
  try {
    const compact = output(f.node);
    assert.match(compact, /2 calls/); assert.match(compact, /2 JSON records/); assert.match(compact, /2.0s/);
    assert.doesNotMatch(compact, /demoChild|const results|Script completed|Wall time|Output:|Arguments/);
    assert.equal(f.node.render(90).length, 4); fits(f.node);
    f.node.setExpanded(true);
    const readable = output(f.node);
    assert.match(readable, /Read  demo.ts/); assert.match(readable, /Bash  sleep 2/);
    assert.match(readable, /export function greet/); assert.match(readable, /return `Hello/);
    assert.match(readable, /Script\s*│\n/); assert.match(readable, /const results = await/);
    assert.doesNotMatch(readable, /Script completed|Wall time|Output:|\\n|\\"/); fits(f.node);
    rawToggle(f.node); const raw = output(f.node);
    assert.match(raw, /Raw output/); assert.match(raw, /Script completed/); assert.match(raw, /Raw arguments/);
    assert.ok(raw.includes(demoResult.content[1].text.slice(0, 60))); assert.match(raw, /Result details/);
    rawToggle(f.node, 'Readable view'); assert.doesNotMatch(output(f.node), /Script completed/);
    assert.equal(f.node.result, demoResult);
    f.blocks.setOutputMode(true); assert.match(output(f.node), /Raw arguments/);
    f.node.setExpanded(false); assert.doesNotMatch(output(f.node), /Raw arguments/);
    f.node.setExpanded(true); f.blocks.setOutputMode(false); assert.match(output(f.node), /Script\s*│\n/);
  } finally { f.blocks.dispose(); }
});

test('Codemode strips only the exact first separate wrapper block and retains child errors/cost/duration', () => {
  const calls = Array.from({ length: 6 }, (_, i) => ({ name: 'read', args: JSON.stringify({ path: 'file' + i }), status: i === 5 ? 'error' : 'ok', error: i === 5 ? 'Missing file' : '', durationMs: 42, cost: i === 5 ? 0.02 : undefined }));
  const f = fixture('codemode', { code: 'try {} catch {}' }, textResult('Script completed\nWall time 2.0 seconds\nOutput:\nuser text in same block', { calls }));
  try {
    f.blocks.clearHistory(); assert.match(output(f.node), /! Codemode.*child errors/); assert.match(output(f.node), /6 calls · 1 failed/);
    f.node.setExpanded(true); const value = output(f.node);
    assert.match(value, /Script completed/); assert.match(value, /Read  file5 · failed/); assert.match(value, /Missing file/); assert.match(value, /\$0.0200/);
    const row = f.node.render(90).find(row => plain(row).includes('file5'));
    assert.ok(row.includes(theme.style('×', { fg: toolStateStyle(theme, 'failed').color })));
    assert.ok(row.includes(theme.fg('muted', 'file5'))); fits(f.node);
  } finally { f.blocks.dispose(); }
});

test('generic JSON, JSONL, duplicate keys and exact numbers are readable; raw has original source', () => {
  const raw = '{"id":90071992547409931234,"items":[{"deep":"FULL_DETAIL"}],"same":1,"same":2}';
  const result = textResult(raw), f = fixture('mcp.lookup', { query: 'sample' }, result);
  try {
    assert.match(output(f.node), /JSON · 4 fields/); assert.doesNotMatch(output(f.node), /FULL_DETAIL|Arguments|90071992547409931234/);
    assert.equal(click(f.node, 1)?.handled, true);
    let value = output(f.node); assert.match(value, /90071992547409931234/); assert.match(value, /same  1/); assert.match(value, /same  2/);
    assert.ok(value.indexOf('FULL_DETAIL') < value.indexOf('Arguments'));
    rawToggle(f.node); assert.ok(output(f.node).includes(raw)); assert.equal(f.node.result, result);
    f.blocks.setOutputMode(false); f.node.setExpanded(false);
    f.node.updateResult({ ...textResult('{"message":"Permission denied"}'), isError: true }); assert.match(output(f.node), /Permission denied/);
    f.node.updateResult(textResult('{"partial":'), true); assert.doesNotMatch(output(f.node), /JSON ·/); assert.match(output(f.node), /partial/); fits(f.node);
  } finally { f.blocks.dispose(); }
});

test('generic text sanitizes controls and expanded body/modifier clicks remain selectable', () => {
  const f = fixture('mcp.demo.lookup', { query: 'item', many: [1,2,3] }, textResult('Hello\x1b]52;c;secret\x07\n' + 'long 界面 line '.repeat(60)));
  try {
    assert.match(output(f.node), /Hello/); assert.doesNotMatch(f.node.render(90).join(''), /\x1b\]52/); assert.ok(f.node.render(90).length <= 4);
    f.node.setExpanded(true); assert.match(output(f.node), /Arguments/); fits(f.node);
    assert.equal(click(f.node, 2), undefined);
    const rows = f.node.render(90), y = rows.findIndex(row => plain(row).includes('Raw payload'));
    assert.equal(f.node.handleMouse({ type:'click',button:'left',x:3,y,width:90,height:rows.length,screenX:3,screenY:y,ctrl:true }), undefined);
    f.node.invalidate(); assert.match(output(f.node), /Hello/);
  } finally { f.blocks.dispose(); }
});

for (const [name, definition] of [
  ['custom', { renderCall: () => new Text('CUSTOM TITLE'), renderResult: () => new Text('OWN RESULT') }],
  ['edit', { renderShell: 'self', renderCall: () => new Text('CUSTOM TITLE'), renderResult: () => new Text('OWN RESULT') }],
  ['read', { renderCall: () => new Text('CUSTOM TITLE'), renderResult: () => new Text('OWN RESULT') }],
]) test(`${name} custom UI stays native, not wrapped or reformatted`, () => {
  const f = fixture(name, {}, textResult('raw not for display'), definition);
  try { assert.match(output(f.node), /CUSTOM TITLE/); assert.match(output(f.node), /OWN RESULT/); assert.doesNotMatch(output(f.node), /raw not for display|╭/); }
  finally { f.blocks.dispose(); }
});

test('web access adapter frames existing custom call/progress/result components without altering payloads', () => {
  const definition = {
    renderCall: (args, th) => new Text(th.fg('accent', `search ${args.query}`), 0, 0),
    renderResult: (result, { expanded, isPartial }, th) => new Text(th.fg('toolOutput', isPartial ? 'searching 2 of 3' : expanded ? `full ${result.content[0].text}` : `preview ${result.content[0].text}`), 0, 0),
  };
  const f = fixture('web_search', { query: 'pi terminal' }, undefined, definition);
  try {
    f.node.markExecutionStarted();
    assert.match(output(f.node), /╭ Web · Search/);
    assert.match(output(f.node), /search pi terminal/);
    f.node.updateResult(textResult('source-linked result'), true);
    assert.match(output(f.node), /searching 2 of 3/);
    f.node.updateResult(textResult('source-linked result'));
    assert.match(output(f.node), /preview source-linked result/);
    assert.match(output(f.node), /✓/);
    assert.doesNotMatch(output(f.node), /\bdone\b|\breturned\b/);
    assert.equal(click(f.node, 0)?.handled, true);
    assert.match(output(f.node), /full source-linked result/);
    fits(f.node);
    assert.deepEqual(f.node.result, textResult('source-linked result'));
    f.node.updateResult({ ...textResult('rate limited'), isError: true });
    assert.match(output(f.node), /× failed/);
    f.node.updateResult({ ...textResult('stopped', { cancelled: true }), isError: true });
    assert.match(output(f.node), /■ cancelled/);
    f.node.updateResult({ content: [{ type: 'image', data: 'x', mimeType: 'image/png' }] });
    assert.doesNotMatch(output(f.node), /╭ Web · Search/, 'image output stays native');
    f.blocks.dispose();
    assert.doesNotMatch(output(f.node), /╭ Web · Search/, 'dispose restores original renderer');
  } finally { f.blocks.dispose(); }
});

test('web adapter leaves self-rendering, unfamiliar, and missing custom renderer shapes native', () => {
  for (const [name, definition] of [
    ['web_search', { renderShell: 'self', renderCall: () => new Text('SELF'), renderResult: () => new Text('RESULT') }],
    ['other_search', { renderCall: () => new Text('OTHER'), renderResult: () => new Text('RESULT') }],
    ['fetch_content', { renderCall: () => new Text('NO RESULT') }],
  ]) {
    const f = fixture(name, {}, textResult('data'), definition);
    try { assert.doesNotMatch(output(f.node), /╭ Web ·/); }
    finally { f.blocks.dispose(); }
  }
});

const { getThemeByName } = await import(pathToFileURL(join(root, '@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js')));
for (const name of ['dark', 'light']) test(`${name}: status colors/symbols survive streaming and expansion without coloring all successful edges`, () => {
  const selectedTheme = getThemeByName(name), f = fixture('codemode', { code: 'return 1' }, undefined, undefined, selectedTheme);
  try {
    assert.equal(new Set(['preparing','running','returned','failed','cancelled'].map(state => selectedTheme.style('x', { fg: toolStateStyle(selectedTheme, state).color }))).size, 5);
    f.node.markExecutionStarted(); assert.match(output(f.node), /◉ Codemode.*running/);
    f.node.updateResult(textResult('Result')); assert.match(output(f.node), /✓ Codemode/);
    assert.doesNotMatch(output(f.node), /✓ Codemode.*returned/);
    assert.ok(f.node.render(90)[0].includes(selectedTheme.style(' ✓ ', { fg: toolStateStyle(selectedTheme, 'returned').color, bold: true })),
      'status symbol keeps its semantic color while title stays readable on a neutral rail');
    assert.ok(!f.node.render(90)[0].includes(selectedTheme.style('╭', { fg: toolStateStyle(selectedTheme, 'returned').color })));
    f.node.setExpanded(true); assert.match(output(f.node), /▾ returned/); f.node.setExpanded(false);
    f.node.updateResult({ ...textResult('Script failed'), isError: true }); assert.match(output(f.node), /× Codemode.*failed/);
    f.node.updateResult({ ...textResult('Stopped', { cancelled: true }), isError: true }); assert.match(output(f.node), /■ Codemode.*cancelled/);
    f.node.updateResult(textResult('partial'), true); assert.match(output(f.node), /running/); fits(f.node);
  } finally { f.blocks.dispose(); }
});

test('representative actual-renderer captures at wide and narrow widths in compact/readable modes', () => {
  const cases = [
    fixture('read', { path: '/tmp/example.ts' }, textResult('export function greet(name: string) {\n  return `Hello, ${name}!`;\n}')),
    fixture('edit', { path: '/tmp/example.ts' }, textResult('Updated example.ts', { diff: "-1 const label = 'YOU';\n+1 const label = 'jordan';" })),
    fixture('bash', { command: 'node --test examples.test.mjs' }, textResult('tests 5\npass 5\nfail 0')),
    fixture('codemode', { code: demoCode }, demoResult),
    fixture('mcp.lookup', { query: 'demo' }, textResult('{"name":"Demo","items":[{"id":1},{"id":2}],"warnings":["sample warning"]}')),
  ];
  try {
    const captures = [90,40].flatMap(width => [false,true].map(expanded => {
      for (const f of cases) f.node.setExpanded(expanded);
      return `WIDTH ${width} · ${expanded ? 'READABLE' : 'COMPACT'}\n` + cases.map(f => output(f.node,width)).join('\n\n');
    })).join('\n\n');
    writeFileSync('/tmp/pi-readable-tool-captures.txt', captures);
    assert.match(captures, /jordan/); assert.match(captures, /JSON records/); assert.doesNotMatch(captures, /Script completed|\\nreturn/);
  } finally { for (const f of cases) f.blocks.dispose(); }
});
